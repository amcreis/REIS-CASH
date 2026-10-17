"use strict";
// Immutable change batches are merged rather than overwriting a shared Drive file.
(function(root){
const STORE="reis-cash-sync-v2",FIELDS=["description","category","cents","parts","date"];
const cmp=(a,b)=>a.clock-b.clock || a.id.localeCompare(b.id);
function union(...lists){const map=new Map();for(const list of lists)for(const e of list){if(map.has(e.id)&&JSON.stringify(map.get(e.id))!==JSON.stringify(e))throw Error("Histórico inconsistente.");map.set(e.id,e)}return [...map.values()].sort(cmp)}
function replay(events,valid){
const records=new Map();
for(const event of [...events].sort(cmp))for(const c of event.changes){
const r=records.get(c.id)||{id:c.id,deleted:false,payments:{}};
if(c.details)Object.assign(r,c.details);
if(c.deleted!==undefined)r.deleted=c.deleted;
Object.assign(r.payments,c.payments||{});records.set(c.id,r);
}
const items=[...records.values()].filter(r=>!r.deleted).map(r=>({id:r.id,...Object.fromEntries(FIELDS.map(f=>[f,r[f]])),paid:Object.keys(r.payments).filter(i=>r.payments[i]&&Number(i)<r.parts).map(Number).sort((a,b)=>a-b)}));
if(!valid(items))throw Error("Dados sincronizados inválidos.");return items
}
function checkEvent(e,valid){
if(!e||typeof e.id!=="string"||e.id.length>150||!Number.isSafeInteger(e.clock)||e.clock<0||!Array.isArray(e.changes)||e.changes.length>10000)throw Error("Histórico inválido.");
for(const c of e.changes){
if(!c||typeof c.id!=="string"||c.id.length>150||!c.id||c.deleted!==undefined&&typeof c.deleted!=="boolean")throw Error("Registro inválido.");
if(c.details&&(!valid([{id:c.id,...c.details,paid:[]}])||Object.keys(c.details).some(k=>!FIELDS.includes(k))))throw Error("Gasto inválido.");
if(c.payments&&(typeof c.payments!=="object"||Array.isArray(c.payments)||Object.entries(c.payments).some(([k,v])=>!/^\d+$/.test(k)||Number(k)>=120||typeof v!=="boolean")))throw Error("Pagamento inválido.");
}
return e
}
function diff(before,after){
const changes=[],old=new Map(before.map(x=>[x.id,x])),next=new Map(after.map(x=>[x.id,x]));
for(const [id,a] of next){const b=old.get(id),change={id};if(!b||FIELDS.some(f=>a[f]!==b[f]))change.details=Object.fromEntries(FIELDS.map(f=>[f,a[f]]));
if(!b)change.deleted=false;
const payments={};for(let i=0;i<Math.max(a.parts,b?.parts||0);i++)if(!b||a.paid.includes(i)!==b.paid.includes(i))payments[i]=a.paid.includes(i);
if(Object.keys(payments).length)change.payments=payments;
if(Object.keys(change).length>1)changes.push(change)}
for(const [id] of old)if(!next.has(id))changes.push({id,deleted:true});return changes
}
function create(storage,valid,uuid=()=>crypto.randomUUID(),now=()=>Date.now()){
let state;
function load(){const raw=storage.getItem(STORE);if(!raw)return null;const s=JSON.parse(raw);if(s.version!==2||!Array.isArray(s.events)||!Array.isArray(s.uploaded)||s.account!==null&&(!s.account||typeof s.account.sub!=="string"||typeof s.account.email!=="string"))throw Error("Armazenamento inválido.");s.events.forEach(e=>checkEvent(e,valid));replay(s.events,valid);return s}
function commit(s){replay(s.events,valid);storage.setItem(STORE,JSON.stringify(s));state=s;return replay(s.events,valid)}
function refresh(){const s=load();if(s){if(state&&state.account&&s.account&&state.account.sub!==s.account.sub)throw Error("A conta foi alterada em outra aba.");state={...s,events:union(state?.events||[],s.events),uploaded:[...new Set([...(state?.uploaded||[]),...s.uploaded])]}}}
state=load();if(!state){const legacy=JSON.parse(storage.getItem("reis-cash-v1")||"[]");if(!valid(legacy))throw Error("Backup local inválido.");state={version:2,account:null,events:legacy.length?[{id:uuid(),clock:0,changes:diff([],legacy)}]:[],uploaded:[],lastSync:null};commit(state)}
return {
read(){refresh();return replay(state.events,valid)},
write(before,after){if(!valid(after))throw Error("Gasto inválido.");const changes=diff(before,after);refresh();if(!changes.length)return replay(state.events,valid);const clock=Math.max(now(),...state.events.map(e=>e.clock+1));return commit({...state,events:union(state.events,[{id:uuid(),clock,changes}])})},
merge(events,uploaded=[]){events.forEach(e=>checkEvent(e,valid));refresh();return commit({...state,events:union(state.events,events),uploaded:[...new Set([...state.uploaded,...uploaded])]})},
bind(account){refresh();if(state.account&&state.account.sub!==account.sub)throw Error("Este navegador está vinculado a "+state.account.email+". Conecte essa mesma conta para evitar misturar seus dados.");commit({...state,account})},
info(){refresh();return structuredClone(state)},
pending(){refresh();return state.events.filter(e=>!state.uploaded.includes(e.id))},
synced(){refresh();commit({...state,lastSync:new Date().toISOString()})}
}
}
root.ReisSyncCore={create,replay,diff,union,checkEvent,STORE};
})(typeof window==="undefined"?globalThis:window);
