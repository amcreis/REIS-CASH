"use strict";
(function(){
const el=id=>document.getElementById(id),config=window.REIS_PLUGGY_CONFIG||{},make=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e},cash=c=>(c/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let token="",identity=null,busy=false,generation=0,initialized=false;
const configured=(()=>{try{const u=new URL(config.apiUrl);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==="/"}catch{return false}})();
const endpoint=configured?config.apiUrl.replace(/\/$/,""):"";
function status(text){el("pluggyStatus").textContent=text}
function controls(){el("pluggyConnect").hidden=!!token;el("pluggyConnect").disabled=!configured||busy;el("pluggyRefresh").hidden=!token;el("pluggyRefresh").disabled=busy;el("pluggyLogout").hidden=!token}
function logout(){generation++;token="";identity=null;el("pluggyCandidates").replaceChildren();el("pluggyConnections").replaceChildren();el("pluggyGoogle").replaceChildren();status("Consulta encerrada. Os últimos saldos continuam salvos.");controls()}
async function request(path,credential=token){
 const response=await fetch(endpoint+path,{method:"GET",credentials:"omit",cache:"no-store",redirect:"error",headers:{Authorization:"Bearer "+credential},signal:AbortSignal.timeout(60000)});
 const data=await response.json();
 if(!response.ok){if(response.status===401||response.status===403){logout();status(data.error||"Entre novamente para consultar os saldos.")}throw Error(data.error||"Não foi possível consultar os saldos.")}
 return data;
}
function checkOwner(owner){
 const bank=ReisBank.account(),debt=JSON.parse(localStorage.getItem(ReisSyncCore.STORE)||"null")?.account;
 if(!owner||typeof owner.sub!=="string"||typeof owner.email!=="string"||[bank,debt].some(x=>x&&x.sub!==owner.sub))throw Error("Entre com a mesma conta Google vinculada aos seus dados do REIS CASH.");
}
async function authorized(response){
 if(!response.credential||busy)return;
 const current=++generation;busy=true;controls();status("Validando sua conta Google…");
 try{
   const owner=await request("/session",response.credential);
   if(current!==generation)return;
   checkOwner(owner);if(!Number.isFinite(owner.expiresAt)||owner.expiresAt<=Date.now())throw Error("Entre novamente com sua conta Google.");
   token=response.credential;identity=owner;el("pluggyGoogle").replaceChildren();
 }catch(e){if(current===generation){token="";identity=null;status(e.message)}}finally{busy=false;controls()}
 if(token&&current===generation)await refresh();
}
el("pluggyConnect").onclick=()=>{
 if(!configured||!ReisBank.available())return;
 if(!window.google?.accounts?.id){status("O acesso do Google ainda está carregando. Tente novamente em instantes.");return}
 if(!initialized){google.accounts.id.initialize({client_id:config.googleClientId,callback:authorized,auto_select:false});initialized=true}
 el("pluggyGoogle").replaceChildren();google.accounts.id.renderButton(el("pluggyGoogle"),{type:"standard",theme:"outline",size:"large",text:"signin_with",locale:"pt-BR"});
 status("Entre com sua conta Google para consultar seus bancos.");
};
function candidates(accounts,owner){
 const list=el("pluggyCandidates");list.replaceChildren();
 const current=ReisBank.read();
 for(const account of accounts){
   const next=ReisPluggyCore.fromAccount(account,owner);
   if(current.some(x=>x.id===next.id))continue;
   const card=make("div","");card.className="bank-account";
   const info=make("div","");info.append(make("h3",next.bank+" · "+next.name),make("p",cash(next.cents)+" · "+next.type));
   const label=make("label","Adicionar ao controle"),select=document.createElement("select");
   select.add(new Option("Escolha como adicionar…",""));select.add(new Option("Criar uma nova conta","new"));
   for(const item of current)select.add(new Option("Substituir "+item.bank+" · "+item.name+" ("+cash(item.cents)+")",item.id));
   label.append(select);info.append(label);
   const add=make("button","Adicionar conta");add.className="central-toggle";add.disabled=true;select.onchange=()=>add.disabled=!select.value;
   add.onclick=()=>{
     try{
       checkOwner(owner);const latest=ReisBank.read(),target=select.value;
       if(latest.some(x=>x.id===next.id)){candidates(accounts,owner);return}
       const previous=latest.find(x=>x.id===target),shown=current.find(x=>x.id===target);
       if(target!=="new"&&(!previous||JSON.stringify(previous)!==JSON.stringify(shown)))throw Error("A conta escolhida mudou. Consulte novamente antes de substituir.");
       if(!confirm(target==="new"?"Adicionar "+next.bank+" · "+next.name+" com saldo de "+cash(next.cents)+"? Confira se este dinheiro já está em outra conta cadastrada.":"Substituir o registro de "+previous.bank+" · "+previous.name+" pelo saldo conectado de "+cash(next.cents)+"? As retiradas manuais deixarão de estar disponíveis nesta conta."))return;
       ReisBank.bind({sub:owner.sub,email:owner.email});
       if(!ReisBank.save([...latest.filter(x=>x.id!==target),next]))throw Error("Não foi possível salvar a conta.");
       candidates(accounts,owner);status("Conta adicionada. Conecte o Google Drive para sincronizá-la entre navegadores.");
     }catch(e){status(e.message)}
   };
   card.append(info,add);list.append(card);
 }
}
async function refresh(){
 if(busy||!token)return;
 if(!identity||Date.now()>=identity.expiresAt){logout();status("A sessão expirou. Entre novamente para consultar.");return}
 if(document.querySelector("dialog[open]")){status("Feche o formulário antes de consultar os saldos.");return}
 const current=generation;busy=true;controls();status("Consultando os últimos saldos disponíveis…");el("pluggyCandidates").replaceChildren();
 try{
   const data=await request("/balances");if(current!==generation)return;
   checkOwner(data.owner);if(data.owner.sub!==identity.sub||!Array.isArray(data.connections))throw Error("Resposta da consulta inválida.");
   const accounts=[];el("pluggyConnections").replaceChildren();
   for(const connection of data.connections){
     if(!Array.isArray(connection.accounts))throw Error("Resposta de contas inválida.");
     if(connection.status==="ok")accounts.push(...connection.accounts);
     if(connection.status!=="ok")el("pluggyConnections").append(make("p",connection.bank+": "+connection.message));
   }
   // Validar tudo antes de gravar qualquer saldo. Respostas vazias nunca excluem contas.
   for(const account of accounts)ReisPluggyCore.fromAccount(account,data.owner);
   const latest=ReisBank.read(),next=ReisPluggyCore.reconcile(latest,accounts,data.owner);
   if(JSON.stringify(latest)!==JSON.stringify(next)&&!ReisBank.save(next))throw Error("Não foi possível salvar os saldos recebidos.");
   candidates(accounts,data.owner);
   status("Consulta concluída às "+new Date().toLocaleTimeString("pt-BR")+". O Meu Pluggy atualiza os dados diariamente; consultar não força atualização no banco.");
 }catch(e){if(current===generation)status(e.message+" Os saldos anteriores foram mantidos.")}
 finally{busy=false;controls()}
}
el("pluggyRefresh").onclick=refresh;el("pluggyLogout").onclick=logout;
el("bankTab").addEventListener("click",()=>{if(token)refresh()});
el("pluggySetup").hidden=configured;
status(configured?"Entre para consultar. Seus saldos salvos permanecem disponíveis sem conexão.":"Aguardando configuração da conexão com o Meu Pluggy.");controls();
})();
