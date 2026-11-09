"use strict";

window.ReisPix = (() => {
  const keyTypes = {
    cpf: "CPF",
    cnpj: "CNPJ",
    phone: "Telefone",
    email: "E-mail",
    random: "Chave aleatória"
  };

  function normalizeKey(type, input) {
    let key = input.trim();
    if (type === "cpf" || type === "cnpj") {
      if (!/^[\d./ -]+$/.test(key)) throw Error("Use apenas dígitos e pontuação do documento.");
      key = key.replace(/\D/g, "");
      if (key.length !== (type === "cpf" ? 11 : 14)) throw Error("Confira o número do documento.");
    } else if (type === "phone") {
      key = key.replace(/[\s()-]/g, "");
      if (!key.startsWith("+")) key = /^\d{10,11}$/.test(key) ? "+55" + key : "+" + key;
      if (!/^\+[1-9]\d{7,14}$/.test(key)) throw Error("Informe o telefone com DDD e código do país.");
    } else if (type === "email") {
      key = key.toLowerCase();
      if (!/^[!-~]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(key) || key.split("@").length !== 2 || key.length > 77) throw Error("Confira o e-mail da chave Pix.");
    } else if (type === "random") {
      key = key.toLowerCase();
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key)) throw Error("Confira a chave aleatória.");
    } else {
      throw Error("Selecione o tipo de chave Pix.");
    }
    return key;
  }

  function merchantText(value, limit) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit).trim();
  }

  function field(id, value) {
    if (value.length > 99) throw Error("O campo excede o tamanho permitido para Pix.");
    return id + String(value.length).padStart(2, "0") + value;
  }

  function crc16(value) {
    let crc = 0xFFFF;
    for (const byte of new TextEncoder().encode(value)) {
      crc ^= byte << 8;
      for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  function payload(record, cents) {
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 999999999999) throw Error("Valor fora do limite do código Pix.");
    const name = merchantText(record.receiver, 25);
    const city = merchantText(record.city, 15);
    if (!name || !city) throw Error("Informe nome e cidade do recebedor.");
    const key = normalizeKey(record.type, record.key);
    const amount = Math.floor(cents / 100) + "." + String(cents % 100).padStart(2, "0");
    const code = field("00", "01") + field("26", field("00", "br.gov.bcb.pix") + field("01", key)) +
      field("52", "0000") + field("53", "986") + field("54", amount) + field("58", "BR") +
      field("59", name) + field("60", city) + field("62", field("05", "***")) + "6304";
    return code + crc16(code);
  }

  function init({ creditors, creditorId, quote, settle }) {
    const el = id => document.getElementById(id);
    const dialog = el("pixDialog");
    let current;
    let generated;
    let store;
    let loadedRecord = null;
    let dirty = false;
    let loadError = "";

    function read() {
      if (!store) throw Error(loadError || "O cadastro Pix está indisponível.");
      return store.read();
    }

    function renderRegistry(preferred = el("pixCreditor").value) {
      const names = new Map(read().map(record => [record.id, record.label || record.receiver]));
      for (const [id, name] of creditors()) names.set(id, name);
      el("pixCreditorNames").replaceChildren(...[...names.values()].sort((a, b) => a.localeCompare(b, "pt-BR")).map(name => new Option(name, name)));
      el("pixCreditor").value = preferred;
      loadRecord();
    }

    function loadRecord() {
      const label = el("pixCreditor").value.trim();
      const record = read().find(item => item.id === creditorId(label));
      loadedRecord = record || null;
      dirty = false;
      el("pixType").value = record?.type || "cpf";
      el("pixKey").value = record?.key || "";
      el("pixReceiver").value = record?.receiver || label;
      el("pixCity").value = record?.city || "";
      el("pixRemove").disabled = !record;
    }

    function registryAction(action) {
      try {
        el("pixRegistryStatus").textContent = "";
        action();
      } catch (error) {
        el("pixRegistryStatus").textContent = error.message;
      }
    }

    el("pixTab").addEventListener("click", () => registryAction(() => renderRegistry()));
    for (const id of ["pixKey", "pixReceiver", "pixCity", "pixType"]) {
      el(id).addEventListener("input", () => { dirty = true; });
    }
    el("pixCreditor").onchange = () => registryAction(loadRecord);
    el("pixForm").onsubmit = event => {
      event.preventDefault();
      registryAction(() => {
        const label = el("pixCreditor").value.trim();
        const id = creditorId(label);
        if (!label || id === "__sem_credor__") throw Error("Informe o nome do credor.");
        const type = el("pixType").value;
        const record = { id, label, type, key: normalizeKey(type, el("pixKey").value), receiver: el("pixReceiver").value.trim(), city: el("pixCity").value.trim() };
        payload(record, 1);
        if (!store) throw Error(loadError);
        store.write(id, record, loadedRecord?.id === id ? loadedRecord : null);
        ReisDrive.changed();
        renderRegistry();
        el("pixRegistryStatus").textContent = "Chave Pix salva. Conecte o Google Drive para usar em outros navegadores.";
      });
    };

    el("pixRemove").onclick = () => registryAction(() => {
      if (!confirm("Remover a chave Pix deste credor?")) return;
      const id = creditorId(el("pixCreditor").value);
      if (!store) throw Error(loadError);
      store.write(id, null, loadedRecord?.id === id ? loadedRecord : null);
      ReisDrive.changed();
      loadRecord();
      el("pixRegistryStatus").textContent = "Chave Pix removida.";
    });

    function resetCode() {
      generated = undefined;
      el("pixOutput").hidden = true;
      el("pixCode").value = "";
      const canvas = el("pixQr");
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    }

    function verifyQuote() {
      const latest = quote();
      if (latest.id !== current.id || latest.month !== current.month || latest.signature !== current.signature) {
        resetCode();
        throw Error("O saldo em aberto mudou. Feche a janela e abra Quitar credor novamente.");
      }
      return latest;
    }

    function paymentAction(action) {
      try {
        el("pixPaymentStatus").textContent = "";
        action();
      } catch (error) {
        el("pixPaymentStatus").textContent = error.message;
      }
    }

    el("settleCreditor").onclick = () => {
      try {
        current = quote();
        if (!current.cents) return;
        resetCode();
        el("pixPaymentStatus").textContent = "";
        el("pixPaymentSummary").textContent = current.name + " · " + current.monthLabel + " · " + current.amount;
        el("pixRegisterKey").hidden = current.id === "__sem_credor__";
        el("pixGenerate").disabled = current.id === "__sem_credor__";
        dialog.showModal();
      } catch (error) {
        alert(error.message);
      }
    };

    el("pixRegisterKey").onclick = () => {
      const name = current.name;
      dialog.close();
      el("pixTab").click();
      registryAction(() => renderRegistry(name));
      el("pixCreditor").focus();
    };

    el("pixGenerate").onclick = () => paymentAction(() => {
      verifyQuote();
      resetCode();
      const record = read().find(item => item.id === current.id);
      if (!record) throw Error("Cadastre a chave Pix deste credor antes de gerar o código.");
      const code = payload(record, current.cents);
      const qr = qrcode(0, "M");
      qr.addData(code, "Byte");
      qr.make();
      const size = qr.getModuleCount();
      const canvas = el("pixQr");
      const scale = 5;
      canvas.width = canvas.height = (size + 8) * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (qr.isDark(row, col)) ctx.fillRect((col + 4) * scale, (row + 4) * scale, scale, scale);
        }
      }
      generated = code;
      el("pixCode").value = code;
      el("pixOutput").hidden = false;
    });

    el("pixCopy").onclick = () => paymentAction(() => {
      verifyQuote();
      if (!generated) return;
      const record = read().find(item => item.id === current.id);
      if (!record || payload(record, current.cents) !== generated) {
        resetCode();
        throw Error("A chave Pix mudou. Gere o código novamente.");
      }
      navigator.clipboard.writeText(generated).then(() => {
        if (dialog.open) el("pixPaymentStatus").textContent = "Código Pix copiado.";
      }).catch(() => {
        if (!dialog.open) return;
        el("pixCode").select();
        el("pixPaymentStatus").textContent = "Copie o código selecionado.";
      });
    });

    el("pixMarkPaid").onclick = () => paymentAction(() => {
      verifyQuote();
      dialog.close();
      settle();
    });
    el("pixClose").onclick = () => dialog.close();
    dialog.addEventListener("close", resetCode);
    try {
      store = ReisPixStore.create(localStorage);
      ReisDrive.addStore({
        store, key: ReisPixStore.STORE, prefix: "reis-cash-pix-event-v1-", version: 1,
        check: ReisPixStore.check,
        update() {
          if (generated) {
            try {
              const record = read().find(item => item.id === current.id);
              if (!record || payload(record, current.cents) !== generated) resetCode();
            } catch { resetCode(); }
          }
          if (!el("pixPanel").hidden && !dirty) registryAction(() => renderRegistry());
        }
      });
    } catch (error) {
      loadError = error.message;
      el("pixRegistryStatus").textContent = loadError;
    }
    for (const [value, label] of Object.entries(keyTypes)) el("pixType").add(new Option(label, value));
  }

  return { init, payload, normalizeKey, crc16 };
})();
