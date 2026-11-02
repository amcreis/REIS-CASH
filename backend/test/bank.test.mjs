import test from 'node:test';
import assert from 'node:assert/strict';
import '../../pluggy-core.js';
import '../../bank-core.js';
const core=globalThis.ReisBankCore,pluggy=globalThis.ReisPluggyCore;
const owner={sub:'owner',email:'owner@gmail.com'};
const account={accountId:'20000000-0000-4000-8000-000000000000',itemId:'10000000-0000-4000-8000-000000000000',bank:'Itaú',name:'Corrente',type:'Conta corrente',currency:'BRL',cents:1292,sourceUpdatedAt:'2026-01-01T00:00:00Z'};
function setup(){const map=new Map([['unrelated-debts','preserve']]);return{map,store:core.create({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)})}}
test('manual records migrate unchanged; connected snapshots persist, export and merge',()=>{
 const {store,map}=setup(),manual={id:'manual',bank:'Banco',name:'Reserva',type:'Caixinha',cents:100,updated:'2026-01-01'};
 store.write([],[manual]);store.bind(owner);const connected=pluggy.fromAccount(account,owner);store.write([manual],[manual,connected]);
 assert.equal(store.read().length,2);assert.ok(core.valid(JSON.parse(JSON.stringify(store.read()))));assert.equal(map.get('unrelated-debts'),'preserve');
 const other=setup().store;other.merge(store.info().events);assert.deepEqual(other.read(),store.read());
});
test('source date wins over later device clock, equal/empty responses do not create changes',()=>{
 const {store}=setup(),old=pluggy.fromAccount(account,owner),fresh=pluggy.fromAccount({...account,cents:5000,sourceUpdatedAt:'2026-01-02'},owner);
 store.write([],[fresh]);store.merge([{id:'stale',clock:Date.now()+100000,changes:[{id:old.id,deleted:false,value:old}]}]);assert.equal(store.read()[0].cents,5000);
 assert.deepEqual(pluggy.reconcile([fresh],[],owner),[fresh]);assert.deepEqual(pluggy.reconcile([fresh],[account],owner),[fresh]);
 const count=store.pending().length;store.write(store.read(),pluggy.reconcile(store.read(),[account],owner));assert.equal(store.pending().length,count);
});
test('mapping replaces manual record once; deletion and restoration remain possible',()=>{
 const {store}=setup(),manual={id:'manual',bank:'Itaú',name:'Principal',type:'Conta corrente',cents:100,updated:'2026-01-01'},connected=pluggy.fromAccount(account,owner);
 store.write([],[manual]);store.write([manual],[connected]);assert.equal(store.read().length,1);assert.equal(store.read()[0].cents,1292);
 store.write([connected],[]);assert.deepEqual(store.read(),[]);store.write([],[connected]);assert.equal(store.read().length,1);
});
test('rejects wrong owner, invalid metadata, stripped connected metadata and invalid cents',()=>{
 const {store}=setup(),connected=pluggy.fromAccount(account,owner);store.bind({sub:'other',email:'other@gmail.com'});assert.throws(()=>store.write([],[connected]));
 assert.equal(core.valid([{...connected,source:undefined,pluggy:undefined}]),false);
 assert.equal(core.valid([{...connected,pluggy:{...connected.pluggy,sourceUpdatedAt:'bad'}}]),false);
 assert.throws(()=>pluggy.fromAccount({...account,cents:1.2},owner));
 assert.throws(()=>pluggy.reconcile([connected],[account],{sub:'other'}));
});
