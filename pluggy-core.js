"use strict";
(function(root){
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function validSource(x){return x&&uuid.test(x.accountId)&&uuid.test(x.itemId)&&typeof x.ownerSub==="string"&&x.ownerSub.length>0&&x.ownerSub.length<=100&&x.currency==="BRL"&&typeof x.sourceUpdatedAt==="string"&&Number.isFinite(Date.parse(x.sourceUpdatedAt))}
function fromAccount(account,owner){
 const source={accountId:account.accountId,itemId:account.itemId,ownerSub:owner.sub,currency:account.currency,sourceUpdatedAt:account.sourceUpdatedAt};
 const item={id:"pluggy-"+account.accountId,bank:account.bank,name:account.name,type:account.type,cents:account.cents,updated:account.sourceUpdatedAt,source:"pluggy",pluggy:source};
 if(!validSource(source)||!root.ReisBankCore.valid([item]))throw Error("Saldo bancário recebido é inválido.");
 return item;
}
function reconcile(items,accounts,owner){
 const incoming=new Map(accounts.map(a=>{const x=fromAccount(a,owner);return [x.id,x]}));
 if(incoming.size!==accounts.length)throw Error("Contas duplicadas na consulta.");
 return items.map(x=>{
   const next=incoming.get(x.id);
   if(x.source!=="pluggy"||!next)return x;
   if(x.pluggy.ownerSub!==owner.sub)throw Error("Os saldos pertencem a outra conta Google.");
   // A data do banco, não a hora da consulta, determina qual saldo é mais recente.
   return Date.parse(next.pluggy.sourceUpdatedAt)>Date.parse(x.pluggy.sourceUpdatedAt)?next:x;
 });
}
root.ReisPluggyCore={validSource,fromAccount,reconcile};
})(typeof window==="undefined"?globalThis:window);
