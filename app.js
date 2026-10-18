"use strict";
const $=id=>document.getElementById(id), KEY="reis-cash-v1", cats=["Alimentação","Moradia","Transporte","Saúde","Educação","Lazer","Compras","Serviços","Outros"];
const money=n=>(n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
function addMonth(date,offset){const [y,m,d]=date.split("-").map(Number),n=new Date(y,m-1+offset,1);n.setDate(Math.min(d,new Date(n.getFullYear(),n.getMonth()+1,0).getDate()));return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0")}
function installments(item,month){
if(item.recurring){
if(typeof month!=="string"||!validMonth(month)||month<item.date.slice(0,7)||(item.recurringEnd&&month>item.recurringEnd))return [];
const [y,m]=month.split("-").map(Number),[sy,sm]=item.date.slice(0,7).split("-").map(Number),index=(y-sy)*12+m-sm;
return [{item,index,date:addMonth(item.date,index),cents:item.cents,paid:(item.recurringPaid||[]).includes(month)}];
}
const base=Math.floor(item.cents/item.parts),extra=item.cents%item.parts;return Array.from({length:item.parts},(_,i)=>({item,index:i,date:addMonth(item.date,i),cents:base+(i<extra?1:0),paid:item.paid.includes(i)}))}
function validMonth(s){return typeof s==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(s)&&s>="1900-01"&&s<="2200-12"}
function validRecurrence(x){return (x.recurring===undefined||typeof x.recurring==="boolean")&&(!x.recurring||x.parts===1)&&(x.recurringEnd===undefined||x.recurringEnd===""||(validMonth(x.recurringEnd)&&x.recurringEnd>=x.date.slice(0,7)))&&(x.recurringPaid===undefined||(Array.isArray(x.recurringPaid)&&x.recurringPaid.every(validMonth)))}

function valid(items){return Array.isArray(items)&&items.length<=10000&&new Set(items.map(x=>x?.id)).size===items.length&&items.every(x=>x&&typeof x.id==="string"&&typeof x.description==="string"&&x.description.trim()&&x.description.length<=100&&validRecurrence(x)&&(x.creditor===undefined||(typeof x.creditor==="string"&&x.creditor.length<=100))&&cats.includes(x.category)&&Number.isSafeInteger(x.cents)&&x.cents>0&&x.cents<=99999999900&&Number.isInteger(x.parts)&&x.parts>=1&&x.parts<=120&&x.cents>=x.parts&&typeof x.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.date>="1900-01-01"&&x.date<="2200-12-31"&&(()=>{const d=new Date(x.date+"T12:00:00");return !isNaN(d)&&d.getDate()===Number(x.date.slice(8))&&d.getMonth()+1===Number(x.date.slice(5,7))})()&&Array.isArray(x.paid)&&x.paid.every(i=>Number.isInteger(i)&&i>=0&&i<x.parts))}
let data=[],editing=null,timer,storageBlocked=false,ledger;
function toast(s){$("toast").textContent=s;$("toast").hidden=false;clearTimeout(timer);timer=setTimeout(()=>$("toast").hidden=true,5000)}
try{ledger=ReisSyncCore.create(localStorage,valid);data=ledger.read()}catch{storageBlocked=true;toast("Não foi possível carregar os dados locais. Exporte uma cópia antes de limpar o navegador.");document.querySelector(".local").textContent="Armazenamento indisponível"}
function save(next){if(storageBlocked||!ledger){toast("Armazenamento indisponível. Os dados existentes não foram alterados.");return false}try{data=ledger.write(data,next);render();ReisDrive.changed();return true}catch(e){toast("Não foi possível salvar: "+e.message);return false}}

cats.forEach(c=>{$("category").add(new Option(c,c))});$("categoryFilter").add(new Option("Todas as categorias",""));cats.forEach(c=>$("categoryFilter").add(new Option(c,c)));
$("month").value=today().slice(0,7);
function state(r){return r.paid?"paid":r.date<today()?"late":"pending"}
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
function render(){
renderCentralizer();
if($("futureDialog").open)renderFuture();
const month=$("month").value,all=data.flatMap(item=>installments(item,month)),rows=all.filter(r=>r.date.slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date));
const total=rows.reduce((s,r)=>s+r.cents,0),paid=rows.filter(r=>r.paid).reduce((s,r)=>s+r.cents,0),future=futureSummary(data,month).total;
$("total").textContent=money(total);$("paid").textContent=money(paid);$("pending").textContent=money(total-paid);$("future").textContent=money(future);
$("paidNote").textContent=rows.filter(r=>r.paid).length+" conta(s) em dia";$("pendingNote").textContent=rows.filter(r=>state(r)==="late").length+" conta(s) em atraso";$("count").textContent=rows.length+" lançamento(s)";
const filtered=rows.filter(r=>(!$("categoryFilter").value||r.item.category===$("categoryFilter").value)&&(r.item.description+" "+(r.item.creditor||"")).toLocaleLowerCase("pt-BR").includes($("search").value.toLocaleLowerCase("pt-BR"))&&(!$("statusFilter").value||($("statusFilter").value==="pending"?!r.paid:state(r)===$("statusFilter").value)));
$("rows").replaceChildren();$("table").hidden=!filtered.length;$("empty").hidden=!!filtered.length;$("emptyTitle").textContent=rows.length?"Nenhum gasto encontrado":"Um novo mês, tudo organizado";$("emptyText").textContent=rows.length?"Experimente outra busca ou altere os filtros.":"Adicione seu primeiro gasto e acompanhe tudo por aqui.";$("emptyAdd").hidden=!!rows.length;
filtered.forEach(r=>{const tr=node("tr"),desc=node("td");desc.append(node("strong",r.item.description),node("small",(r.item.creditor||"Credor não informado")+" · "+r.item.category+" · "+(r.item.recurring?"Conta fixa mensal":r.item.parts===1?"À vista":"Parcela "+(r.index+1)+"/"+r.item.parts)));tr.append(desc,node("td",r.date.split("-").reverse().join("/")),node("td",money(r.cents)));const status=node("td"),b=node("button",r.paid?"✓ Pago":state(r)==="late"?"Atrasado":"Em aberto","status "+(r.paid?"paid":state(r)==="late"?"late":""));b.title=r.paid?"Marcar como em aberto":"Marcar como pago";b.setAttribute("aria-label",b.title+": "+r.item.description+" parcela "+(r.index+1));b.onclick=()=>{const next=structuredClone(data),item=next.find(x=>x.id===r.item.id);if(item.recurring){const month=r.date.slice(0,7);item.recurringPaid=r.paid?(item.recurringPaid||[]).filter(m=>m!==month):[...(item.recurringPaid||[]),month]}else item.paid=r.paid?item.paid.filter(i=>i!==r.index):[...item.paid,r.index];if(save(next))toast(r.paid?"Conta reaberta.":"Pagamento registrado.")};status.append(b);const actions=node("td"),edit=node("button","✎","edit"),del=node("button","×","delete");edit.setAttribute("aria-label","Editar "+r.item.description);del.setAttribute("aria-label","Excluir "+r.item.description);edit.onclick=()=>openForm(r.item);del.onclick=()=>{if(confirm(r.item.recurring?"Excluir toda a conta fixa "+r.item.description+", incluindo seu histórico? Para parar só os próximos meses, edite e informe o último mês.":"Excluir "+r.item.description+" e todas as suas parcelas?"))if(save(data.filter(x=>x.id!==r.item.id)))toast("Gasto excluído.")};actions.append(edit,del);tr.append(status,actions);$("rows").append(tr)});
$("categories").replaceChildren();if(!rows.length)$("categories").append(node("p","As categorias aparecerão assim que você adicionar um gasto.","hint"));cats.map(c=>({name:c,value:rows.filter(r=>r.item.category===c).reduce((s,r)=>s+r.cents,0)})).filter(x=>x.value).sort((a,b)=>b.value-a.value).forEach(c=>{const d=node("div",undefined,"category"),line=node("div",undefined,"line"),track=node("div",undefined,"track"),bar=node("span");line.append(node("span",c.name),node("strong",money(c.value)));bar.style.width=c.value/total*100+"%";track.append(bar);d.append(line,track);$("categories").append(d)})}
function modeChange(){
const recurring=$("recurring").checked;if(recurring)$("mode").value="cash";$("mode").disabled=recurring;$("recurringEndLabel").hidden=!recurring;$("valueLabel").textContent=recurring?"Valor mensal (R$)":"Valor total (R$)";
$("partsLabel").hidden=$("mode").value==="cash";$("parts").required=$("mode").value!=="cash";$("installmentHint").textContent=recurring?"O mesmo valor será lançado todo mês. Cada mês começa em aberto. Deixe o último mês vazio para repetir sem data final.":$("mode").value==="cash"?"Você pode marcar cada conta como paga depois.":"Informe o valor TOTAL da compra. Cada parcela terá seu próprio status de pagamento."}
function openForm(item=null){editing=item?.id||null;$("form").reset();$("recurring").checked=!!item?.recurring;$("recurring").disabled=!!item?.recurring;$("recurringEnd").value=item?.recurringEnd||"";$("recurringEditNote").hidden=!item?.recurring;$("error").textContent="";$("date").value=item?.date||today();$("description").value=item?.description||"";$("creditor").value=item?.creditor||"";$("category").value=item?.category||cats[0];$("value").value=item?item.cents/100:"";$("mode").value=item&&item.parts>1?"installments":"cash";$("parts").value=item?.parts>1?item.parts:2;$("initialStatus").value=(item?.recurring?(item.recurringPaid||[]).includes(item.date.slice(0,7)):item?.paid.includes(0))?"paid":"pending";$("dialogTitle").textContent=item?"Editar gasto":"Adicionar gasto";modeChange();$("modal").showModal()}
$("new").onclick=()=>openForm();$("emptyAdd").onclick=()=>openForm();$("close").onclick=$("cancel").onclick=()=>$("modal").close();$("mode").onchange=modeChange;$("recurring").onchange=modeChange;
$("form").onsubmit=e=>{e.preventDefault();const old=data.find(x=>x.id===editing),parts=$("mode").value==="cash"?1:Number($("parts").value),cents=Math.round(Number($("value").value)*100);const item={id:editing||crypto.randomUUID(),description:$("description").value.trim(),creditor:$("creditor").value.trim(),category:$("category").value,cents,parts,date:$("date").value,recurring:$("recurring").checked,recurringEnd:$("recurring").checked?$("recurringEnd").value:"",recurringPaid:old?.recurringPaid||[],paid:old?old.paid.filter(i=>i<parts&&i!==0):[]};if(item.recurring){const first=item.date.slice(0,7);item.paid=[];item.recurringPaid=item.recurringPaid.filter(m=>m!==first);if($("initialStatus").value==="paid")item.recurringPaid.push(first)}else if($("initialStatus").value==="paid")item.paid.push(0);if(!item.creditor){$("error").textContent="Informe a quem você deve.";return}if(!valid([item])){$("error").textContent="Confira os campos. O último mês não pode ser anterior ao primeiro vencimento, e cada parcela deve ter ao menos R$ 0,01.";return}if(old?.recurring&&(old.cents!==cents||old.date!==item.date)&&!confirm("Alterar o valor ou vencimento modifica toda a série, inclusive meses anteriores. Para preservar os valores antigos, cancele, defina o último mês e cadastre uma nova conta fixa. Continuar?"))return;if(old&&old.paid.length&&(old.parts!==parts||old.cents!==cents||old.date!==item.date)&&!confirm("Esta alteração recalcula as parcelas, inclusive as já pagas. Continuar?"))return;const next=editing?data.map(x=>x.id===editing?item:x):[...data,item];if(save(next)){$("month").value=item.date.slice(0,7);render();$("modal").close();toast(editing?"Gasto atualizado.":"Gasto adicionado.")}};
["search","categoryFilter","statusFilter","month"].forEach(id=>$(id).addEventListener("input",()=>{if($("month").value)render()}));$("prev").onclick=()=>shift(-1);$("next").onclick=()=>shift(1);function shift(n){$("month").value=addMonth(($("month").value||today().slice(0,7))+"-01",n).slice(0,7);render()}
$("export").onclick=()=>{if(storageBlocked){toast("Os dados não puderam ser carregados; exportação indisponível.");return}const blob=new Blob([JSON.stringify({version:1,expenses:data},null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=node("a");a.href=url;a.download="reis-cash-backup-"+today()+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("Backup exportado.")};
$("import").onclick=()=>$("backupFile").click();$("backupFile").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error();const backup=JSON.parse(await file.text());if(backup.version!==1||!valid(backup.expenses))throw Error();if(confirm("Restaurar este backup? Os dados atuais serão substituídos.")){const blocked=storageBlocked;storageBlocked=false;if(save(backup.expenses)){toast("Backup restaurado.")}else storageBlocked=blocked}}catch{toast("Backup inválido. Selecione um arquivo exportado pelo REIS CASH.")}e.target.value=""};
render();

if(ledger)ReisDrive.start(ledger,items=>{data=items;render()});

function creditorKey(description){return description.normalize("NFC").trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR")||"__sem_credor__"}
function creditorSummary(items,month,key){
const rows=items.filter(item=>creditorKey(item.creditor||"")===key).flatMap(item=>installments(item,month)).filter(r=>r.date.slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date)||a.item.description.localeCompare(b.item.description,"pt-BR"));
const total=rows.reduce((sum,r)=>sum+r.cents,0),paid=rows.filter(r=>r.paid).reduce((sum,r)=>sum+r.cents,0);
return {rows,total,paid,pending:total-paid};
}
function renderCentralizer(){
const select=$("creditorSelect"),previous=select.value,creditors=new Map();
data.forEach(item=>{const key=creditorKey(item.creditor||"");if(!creditors.has(key))creditors.set(key,(item.creditor||"").trim().replace(/\s+/g," ")||"Credor não informado")});
select.replaceChildren(new Option("Selecione um credor",""));
[...creditors].sort((a,b)=>a[1].localeCompare(b[1],"pt-BR")).forEach(([key,label])=>select.add(new Option(label,key)));
select.value=creditors.has(previous)?previous:"";
const month=$("month").value;
$("centralMonth").textContent=month?new Date(month+"-01T12:00:00").toLocaleDateString("pt-BR",{month:"long",year:"numeric"}):"Selecione o mês";
$("centralResults").hidden=!select.value;$("centralPrompt").hidden=!!select.value;
$("centralPrompt").textContent=creditors.size?"Selecione um credor para ver o resumo.":"Cadastre um gasto para começar a centralizar por credor.";
$("creditorRows").replaceChildren();
if(!select.value)return;
const summary=creditorSummary(data,month,select.value);
$("creditorTotal").textContent=money(summary.total);$("creditorPaid").textContent=money(summary.paid);$("creditorPending").textContent=money(summary.pending);
$("creditorTable").hidden=!summary.rows.length;$("creditorEmpty").hidden=!!summary.rows.length;
summary.rows.forEach(r=>{const tr=node("tr"),desc=node("td");desc.append(node("strong",r.item.description),node("small",r.item.recurring?"Conta fixa mensal":r.item.parts===1?"À vista":"Parcela "+(r.index+1)+" de "+r.item.parts));const status=node("td");status.append(node("span",r.paid?"Pago":state(r)==="late"?"Atrasado":"Em aberto","status "+(r.paid?"paid":state(r)==="late"?"late":"")));tr.append(desc,node("td",r.date.split("-").reverse().join("/")),node("td",money(r.cents)),status);$("creditorRows").append(tr)});
}
$("centralToggle").onclick=()=>{const open=$("centralPanel").hidden;$("centralPanel").hidden=!open;$("centralToggle").setAttribute("aria-expanded",String(open));if(open){renderCentralizer();$("creditorSelect").focus()}};
$("centralClose").onclick=()=>{$("centralPanel").hidden=true;$("centralToggle").setAttribute("aria-expanded","false");$("centralToggle").focus()};
$("creditorSelect").onchange=renderCentralizer;

function futureSummary(items,month){
const rows=items.filter(item=>item.parts>1&&!item.recurring).flatMap(item=>installments(item,month)).filter(r=>!r.paid&&r.date.slice(0,7)>month).sort((a,b)=>a.date.localeCompare(b.date)||(a.item.creditor||"").localeCompare(b.item.creditor||"","pt-BR")||a.item.description.localeCompare(b.item.description,"pt-BR"));
const months=new Map();
for(const row of rows){const key=row.date.slice(0,7);if(!months.has(key))months.set(key,{month:key,total:0,rows:[]});const group=months.get(key);group.rows.push(row);group.total+=row.cents}
return {total:rows.reduce((sum,row)=>sum+row.cents,0),rows,months:[...months.values()]};
}
function monthLabel(month){return new Date(month+"-01T12:00:00").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}
function renderFuture(){
const summary=futureSummary(data,$("month").value);
$("futureReference").textContent="Parcelas em aberto após "+monthLabel($("month").value)+".";
$("futureTotal").textContent=money(summary.total);
$("futureCount").textContent=summary.rows.length+" parcela(s) em "+summary.months.length+" mês(es)";
$("futureEmpty").hidden=!!summary.rows.length;
$("futureMonths").replaceChildren();
for(const group of summary.months){
const section=node("section",undefined,"future-month"),heading=node("div",undefined,"future-heading");
heading.append(node("h3",monthLabel(group.month)),node("strong",money(group.total)));
section.append(heading);
for(const row of group.rows){
const line=node("div",undefined,"future-row"),details=node("div");
details.append(node("strong",(row.item.creditor||"").trim()||"Credor não informado"),node("span",row.item.description,"future-description"),node("small","Parcela "+(row.index+1)+" de "+row.item.parts+" · Vence em "+row.date.split("-").reverse().join("/")));
line.append(details,node("strong",money(row.cents),"future-value"));section.append(line);
}
$("futureMonths").append(section);
}
}
$("futureToggle").onclick=()=>{renderFuture();$("futureDialog").showModal()};
$("futureClose").onclick=()=>$("futureDialog").close();
