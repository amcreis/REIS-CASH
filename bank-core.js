"use strict";
(function(root){
const STORE="reis-cash-balances-v1",types=["Conta corrente","Poupança","Caixinha","Investimento"];
const clone=x=>JSON.parse(JSON.stringify(x));
function valid(items){return Array.isArray(items)&&items.length<=10000&&new Set(items.map(x=>x?.id)).size===items.length&&items.every(x=>x&&typeof x.id==="string"&&x.id.length>0&&x.id.length<=150&&["bank","name"].every(k=>typeof x[k]==="string"&&x[k].trim().length>0&&x[k].length<=100)&&types.includes(x.type)&&Number.isSafeInteger(x.cents)&&Math.abs(x.cents)<=99999999900&&typeof x.updated==="string"&&!isNaN(Date.parse(x.updated)))}
function checkEvent(e){if(!e||typeof e.id!=="string"||!e.id||e.id.length>150||!Number.isSafeInteger(e.clock)||e.clock<0||!Array.isArray(e.changes)||e.changes.length>10000)throw Error("Histórico de saldos inválido.");
for(const c of e.changes)if(!c||typeof c.id!=="string"||!c.id||c.id.length>150||typeof c.deleted!=="boolean"||(!c.deleted&&(!c.value||c.value.id!==c.id||!valid([c.value]))))throw Error("Registro de saldo inválido.");return e}
function union(...lists){const map=new Map();for(const list of lists)for(const e of list){checkEvent(e);if(map.has(e.id)&&JSON.stringify(map.get(e.id))!==JSON.stringify(e))throw Error("Histórico de saldos inconsistente.");map.set(e.id,e)}return [...map.values()].sort((a,b)=>a.clock-b.clock||a.id.localeCompare(b.id))}
function replay(events){const records=new Map();for(const e of union(events))for(const c of e.changes){if(c.deleted)records.delete(c.id);else records.set(c.id,clone(c.value))}const items=[...records.values()];if(!valid(items))throw Error("Saldos inválidos.");return items}
function create(storage,uuid=()=>crypto.randomUUID(),now=()=>Date.now()){
let state;
function load(){const raw=storage.getItem(STORE);if(!raw)return null;const s=JSON.parse(raw);if(s.version!==1||!Array.isArray(s.events)||!Array.isArray(s.uploaded)||s.uploaded.some(x=>typeof x!=="string")||(s.account!==null&&(!s.account||typeof s.account.sub!=="string"||typeof s.account.email!=="string")))throw Error("Armazenamento de saldos inválido.");replay(s.events);return s}
function refresh(){const s=load();if(s){if(state?.account&&s.account&&state.account.sub!==s.account.sub)throw Error("A conta dos saldos foi alterada em outra aba.");state={...s,events:union(state?.events||[],s.events),uploaded:[...new Set([...(state?.uploaded||[]),...s.uploaded])]}}}
function commit(s){const items=replay(s.events);storage.setItem(STORE,JSON.stringify(s));state=s;return items}
state=load();if(!state){state={version:1,account:null,events:[],uploaded:[],lastSync:null};commit(state)}
return {
read(){refresh();return replay(state.events)},
write(before,after){if(!valid(before)||!valid(after))throw Error("Confira os dados do saldo.");const old=new Map(before.map(x=>[x.id,x])),next=new Map(after.map(x=>[x.id,x])),changes=[];
for(const [id,value] of next)if(JSON.stringify(old.get(id))!==JSON.stringify(value))changes.push({id,deleted:false,value:clone(value)});
for(const [id] of old)if(!next.has(id))changes.push({id,deleted:true});
refresh();if(!changes.length)return replay(state.events);return commit({...state,events:union(state.events,[{id:uuid(),clock:state.events.reduce((n,e)=>Math.max(n,e.clock+1),now()),changes}])})},
merge(events,uploaded=[]){events.forEach(checkEvent);refresh();return commit({...state,events:union(state.events,events),uploaded:[...new Set([...state.uploaded,...uploaded])]})},
bind(account){refresh();if(state.account&&state.account.sub!==account.sub)throw Error("Os saldos pertencem à conta "+state.account.email);commit({...state,account})},
info(){refresh();return clone(state)},pending(){refresh();return state.events.filter(e=>!state.uploaded.includes(e.id))},
synced(){refresh();commit({...state,lastSync:new Date().toISOString()})}
}
}
root.ReisBankCore={STORE,types,valid,checkEvent,union,replay,create};
})(typeof window==="undefined"?globalThis:window);
