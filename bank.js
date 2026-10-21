"use strict";
(function(){
const el=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e},cash=n=>(n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let bankStore,items=[],editing=null;
function error(message){el("bankError").textContent=message;el("bankError").hidden=!message}
function render(){
el("bankWithdraw").disabled=!bankStore||!items.length;
el("bankTotal").textContent=cash(items.reduce((n,x)=>n+x.cents,0));
el("bankTotals").replaceChildren();for(const type of ReisBankCore.types){const card=make("div",undefined,"card");card.append(make("div",type,"eyebrow"),make("div",cash(items.filter(x=>x.type===type).reduce((n,x)=>n+x.cents,0)),"amount"));el("bankTotals").append(card)}
el("bankList").replaceChildren();el("bankEmpty").hidden=!!items.length;
for(const item of [...items].sort((a,b)=>a.bank.localeCompare(b.bank,"pt-BR")||a.name.localeCompare(b.name,"pt-BR"))){
const card=make("article",undefined,"bank-account"),info=make("div");
info.append(make("h3",item.bank+" · "+item.name),make("span",item.type,"badge"),make("p","Atualizado em "+new Date(item.updated).toLocaleString("pt-BR"),"hint"));
const actions=make("div",undefined,"bank-account-actions"),edit=make("button","Atualizar saldo","central-toggle"),del=make("button","Excluir","bank-delete");
edit.setAttribute("aria-label","Atualizar saldo de "+item.name+" — "+item.bank);del.setAttribute("aria-label","Excluir saldo de "+item.name+" — "+item.bank);
edit.onclick=()=>open(item);del.onclick=()=>{if(confirm("Excluir apenas o saldo de "+item.name+"? Suas dívidas não serão alteradas."))persist(items.filter(x=>x.id!==item.id))};
actions.append(make("strong",cash(item.cents),"bank-value"),edit,del);card.append(info,actions);el("bankList").append(card)}
}
function persist(next){if(!bankStore)return false;try{items=bankStore.write(items,next);render();error("");ReisDrive.changed();return true}catch(e){error("Não foi possível salvar os saldos: "+e.message);return false}}
function open(item){editing=item?.id||null;el("bankForm").reset();el("bankFormError").textContent="";el("bankName").value=item?.bank||"";el("bankLabel").value=item?.name||"";el("bankType").value=item?.type||ReisBankCore.types[0];el("bankAmount").value=item?item.cents/100:"";el("bankDialogTitle").textContent=item?"Atualizar saldo":"Adicionar saldo";el("bankModal").showModal()}
function withdrawalPreview(){
const item=items.find(x=>x.id===el("withdrawAccount").value),amount=Math.round(Number(el("withdrawAmount").value)*100);
el("withdrawPreview").textContent=item?"Saldo atual: "+cash(item.cents)+(Number.isSafeInteger(amount)&&amount>0?" · Saldo após a retirada: "+cash(item.cents-amount):""):"Selecione a conta de origem.";
}
el("bankWithdraw").onclick=()=>{try{items=bankStore.read();render();el("withdrawForm").reset();el("withdrawError").textContent="";el("withdrawAccount").replaceChildren(new Option("Selecione a conta",""));for(const item of items)el("withdrawAccount").add(new Option(item.bank+" · "+item.name+" · "+item.type,item.id));el("withdrawAccount").value="";withdrawalPreview();el("withdrawModal").showModal()}catch(e){error(e.message)}};
el("withdrawAccount").onchange=withdrawalPreview;el("withdrawAmount").oninput=withdrawalPreview;
el("withdrawClose").onclick=el("withdrawCancel").onclick=()=>el("withdrawModal").close();
el("withdrawForm").onsubmit=e=>{
e.preventDefault();
const amount=Math.round(Number(el("withdrawAmount").value)*100),id=el("withdrawAccount").value;
if(!Number.isSafeInteger(amount)||amount<=0||amount>99999999900){el("withdrawError").textContent="Informe um valor maior que zero, com até duas casas decimais.";return}
try{
const latest=bankStore.read(),item=latest.find(x=>x.id===id),shown=items.find(x=>x.id===id);
if(!item){el("withdrawError").textContent="Esta conta não está mais disponível. Feche e selecione outra conta.";return}
if(!shown||item.cents!==shown.cents){items=latest;withdrawalPreview();el("withdrawError").textContent="O saldo foi atualizado em outra aba. Confira o novo valor e confirme novamente.";return}
const updated={...item,cents:item.cents-amount,updated:new Date().toISOString()};
if(!ReisBankCore.valid([updated])){el("withdrawError").textContent="O saldo resultante ultrapassa o limite permitido.";return}
items=latest;
if(persist(items.map(x=>x.id===id?updated:x))){el("withdrawModal").close();el("bankNotice").textContent="Retirada de "+cash(amount)+" registrada em "+item.bank+" · "+item.name+". Novo saldo: "+cash(updated.cents);}
else el("withdrawError").textContent="Não foi possível salvar a retirada. Tente novamente.";
}catch(err){el("withdrawError").textContent="Não foi possível registrar a retirada: "+err.message}
};
function show(bank){el("bankPanel").hidden=!bank;el("debtPanel").hidden=bank;el("new").hidden=bank;el("bankTab").setAttribute("aria-selected",String(bank));el("debtTab").setAttribute("aria-selected",String(!bank));el("bankTab").tabIndex=bank?0:-1;el("debtTab").tabIndex=bank?-1:0;}
el("bankTab").onclick=()=>show(true);el("debtTab").onclick=()=>show(false);
for(const id of ["bankTab","debtTab"])el(id).onkeydown=e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const bank=e.key==="End"?true:e.key==="Home"?false:id==="debtTab";show(bank);el(bank?"bankTab":"debtTab").focus()}};
ReisBankCore.types.forEach(type=>el("bankType").add(new Option(type,type)));
el("bankAdd").onclick=()=>open();el("bankClose").onclick=el("bankCancel").onclick=()=>el("bankModal").close();
el("bankForm").onsubmit=e=>{e.preventDefault();const item={id:editing||crypto.randomUUID(),bank:el("bankName").value.trim(),name:el("bankLabel").value.trim(),type:el("bankType").value,cents:Math.round(Number(el("bankAmount").value)*100),updated:new Date().toISOString()};if(!ReisBankCore.valid([item])){el("bankFormError").textContent="Confira o banco, o nome e o valor informado.";return}if(persist(editing?items.map(x=>x.id===editing?item:x):[...items,item]))el("bankModal").close();else el("bankFormError").textContent="Não foi possível salvar. Seus dados anteriores foram mantidos."};
el("bankExport").onclick=()=>{if(!bankStore)return;const url=URL.createObjectURL(new Blob([JSON.stringify({kind:"reis-cash-balances",version:1,balances:items},null,2)],{type:"application/json"})),a=make("a");a.href=url;a.download="reis-cash-saldos-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
el("bankImport").onclick=()=>el("bankBackup").click();el("bankBackup").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error();const backup=JSON.parse(await file.text());if(backup.kind!=="reis-cash-balances"||backup.version!==1||!ReisBankCore.valid(backup.balances))throw Error();if(confirm("Substituir apenas os saldos por este backup? As dívidas permanecem iguais."))persist(backup.balances)}catch{error("Backup de saldos inválido. Use um arquivo exportado nesta aba.")}e.target.value=""};
try{bankStore=ReisBankCore.create(localStorage);items=bankStore.read();ReisDrive.addStore({store:bankStore,key:ReisBankCore.STORE,prefix:"reis-cash-balance-event-v1-",version:1,check:ReisBankCore.checkEvent,update:next=>{items=next;render()}})}catch(e){error("Não foi possível carregar os saldos. "+e.message);["bankAdd","bankExport","bankImport"].forEach(id=>el(id).disabled=true)}
render();
})();
