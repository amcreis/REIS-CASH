import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { createWorker, verifyIdentity, normalizeAccount } from '../worker.mjs';

const itemId='10000000-0000-4000-8000-000000000000',accountId='20000000-0000-4000-8000-000000000000';
const env={ALLOWED_ORIGIN:'https://amcreis.github.io',GOOGLE_CLIENT_ID:'client',GOOGLE_ALLOWED_EMAIL:'owner@gmail.com',PLUGGY_CLIENT_ID:'fake-id',PLUGGY_CLIENT_SECRET:'fake-secret',PLUGGY_ITEMS:JSON.stringify([{id:itemId,bank:'Itaú'}])};
const owner={sub:'owner-id',email:'owner@gmail.com'},token='example.token.for.mock.tests';
const request=(path='/balances',opts={})=>new Request('https://example.workers.dev'+path,{headers:{Origin:env.ALLOWED_ORIGIN,Authorization:'Bearer '+token},...opts});
const item={id:itemId,status:'UPDATED',executionStatus:'SUCCESS',lastUpdatedAt:'2026-01-01T12:00:00Z'};
const account={id:accountId,itemId,type:'BANK',subtype:'CHECKING_ACCOUNT',currencyCode:'BRL',balance:12.92,name:'Conta principal',taxNumber:'private',bankData:{automaticallyInvestedBalance:12.92,overdraftContractedLimit:500}};
const reply=data=>Response.json(data);

test('Google identity checks real signed tokens, audience, issuer, expiry and personal allowlist',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test';const keys=createLocalJWKSet({keys:[jwk]});
 const sign=(payload={},aud='client',iss='https://accounts.google.com',exp='1h')=>new SignJWT({email:'owner@gmail.com',email_verified:true,...payload}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('owner-id').setAudience(aud).setIssuer(iss).setIssuedAt().setExpirationTime(exp).sign(privateKey);
 assert.equal((await verifyIdentity(await sign(),env,keys)).sub,'owner-id');
 for(const jwt of [await sign({email:'other@gmail.com'}),await sign({email_verified:false}),await sign({},'wrong'),await sign({},'client','https://evil.example'),await sign({},'client','https://accounts.google.com','-1h')])await assert.rejects(verifyIdentity(jwt,env,keys));
 await assert.rejects(verifyIdentity(await sign(),{...env,GOOGLE_ALLOWED_SUB:'other-sub'},keys));
});
test('rejects anonymous, foreign origin, unauthorized, methods and caller-specified IDs before Pluggy access',async()=>{
 let calls=0;const worker=createWorker({fetcher:async()=>{calls++;throw Error()},verify:async()=>{throw Error()}});
 assert.equal((await worker.fetch(request('/balances',{headers:{Origin:env.ALLOWED_ORIGIN}}),env)).status,401);
 assert.equal((await worker.fetch(request('/balances',{headers:{Origin:'https://evil.example'}}),env)).status,403);
 assert.equal((await worker.fetch(request(),env)).status,401);
 assert.equal((await worker.fetch(request('/balances',{method:'POST'}),env)).status,405);
 assert.equal((await worker.fetch(request('/balances?itemId=other'),env)).status,404);assert.equal(calls,0);
});
test('returns only sanitized BRL bank balances; does not add automatic investment or overdraft; cache and pagination',async()=>{
 const urls=[];const worker=createWorker({verify:async()=>owner,fetcher:async(url,options)=>{urls.push(url);if(url.endsWith('/auth'))return reply({apiKey:'private-api-key'});assert.equal(options.headers['X-API-KEY'],'private-api-key');if(url.includes('/items/'))return reply(item);return reply({results:[account,{...account,id:'30000000-0000-4000-8000-000000000000',type:'CREDIT'},{...account,id:'40000000-0000-4000-8000-000000000000',currencyCode:'USD'}],totalPages:1})}});
 const response=await worker.fetch(request(),env),data=await response.json();assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(data.connections[0].accounts.length,1);assert.equal(data.connections[0].accounts[0].cents,1292);
 const body=JSON.stringify(data);for(const secret of ['taxNumber','private-api-key','fake-secret','overdraftContractedLimit'])assert.ok(!body.includes(secret));
 await worker.fetch(request(),env);assert.equal(urls.length,3);
});
test('empty, expired, partial failure and upstream error never turn into zero balances',async()=>{
 for(const scenario of ['empty','expired','partial','failure']){
 const worker=createWorker({verify:async()=>owner,fetcher:async url=>{if(url.endsWith('/auth'))return reply({apiKey:'key'});if(scenario==='failure')return new Response('',{status:500});if(url.includes('/items/'))return reply({...item,...(scenario==='expired'?{consentExpiresAt:'2020-01-01T00:00:00Z'}:{}),...(scenario==='partial'?{executionStatus:'PARTIAL_SUCCESS',statusDetail:{accounts:{isUpdated:false}}}:{})});return reply({results:[],totalPages:0})}});
 const data=await(await worker.fetch(request(),env)).json();assert.notEqual(data.connections[0].status,'ok');assert.deepEqual(data.connections[0].accounts,[]);
 }
});
test('invalid amounts rejected, negative balances retained, unknown source date rejected',()=>{
 const connection={id:itemId,bank:'Itaú'};assert.equal(normalizeAccount({...account,balance:-13},item,connection).cents,-1300);
 for(const balance of [null,'12.92',NaN,Infinity,1e15])assert.throws(()=>normalizeAccount({...account,balance},item,connection));
 assert.throws(()=>normalizeAccount(account,{...item,lastUpdatedAt:null},connection));
});
test('multiple pages and per-bank failure isolation',async()=>{
 let pages=0;const second='50000000-0000-4000-8000-000000000000';
 const worker=createWorker({verify:async()=>owner,fetcher:async url=>{if(url.endsWith('/auth'))return reply({apiKey:'key'});if(url.includes(second))return new Response('',{status:503});if(url.includes('/items/'))return reply(item);pages++;return reply({results:[{...account,id:pages===1?accountId:'60000000-0000-4000-8000-000000000000'}],totalPages:2})}});
 const data=await(await worker.fetch(request(),{...env,PLUGGY_ITEMS:JSON.stringify([{id:itemId,bank:'Itaú'},{id:second,bank:'Outro'}])})).json();assert.equal(pages,2);assert.equal(data.connections[0].accounts.length,2);assert.equal(data.connections[1].status,'unavailable');
});
