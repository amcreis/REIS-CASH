"use strict";
(function(){
const el=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e},cash=n=>(n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let bankStore,items=[],editing=null;
function error(message){el("bankError").textContent=message;el("bankError").hidden=!message}
function render(){
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
