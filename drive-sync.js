"use strict";
(function(){
const CLIENT_ID="687529913098-i781gt7qhdd56bkc0qjpn9pm57bml3oj.apps.googleusercontent.com";
const SCOPE="https://www.googleapis.com/auth/drive.appdata";
const API="https://www.googleapis.com/drive/v3";
let channels=[],store,onData,token="",expiry=0,busy=false,client,scheduled,blockedUntil=0,failures=0,session=0;
const el=id=>document.getElementById(id);
function status(text){el("syncStatus").textContent=text;document.querySelector(".local").textContent=text}
function paint(){if(!store)return;const s=store.info(),pending=channels.reduce((sum,c)=>sum+c.store.pending().length,0);
el("syncAccount").textContent=s.account?s.account.email:"Conecte a mesma conta Google em cada navegador.";
el("syncNow").hidden=!token;el("disconnectDrive").hidden=!token;el("connectDrive").hidden=!!token;
el("connectDrive").textContent=s.account?"Reconectar Google Drive":"Conectar Google Drive";
if(!token)status(s.account?"Reconecte para sincronizar"+(pending?" · "+pending+" alteração(ões) pendente(s)":""):"Salvo neste navegador");
else if(pending)status("Salvo neste navegador · sincronização pendente");
else status(s.lastSync?"Sincronizado às "+new Date(s.lastSync).toLocaleTimeString("pt-BR"):"Conectado ao Google Drive");
}
async function request(url,options={}){
if(!token||Date.now()>=expiry){token="";paint();throw Error("Sua conexão expirou. Clique em Reconectar Google Drive.")}
const result=await fetch(url,{...options,headers:{...options.headers,Authorization:"Bearer "+token},signal:AbortSignal.timeout(25000)});
if(result.status===401){token="";paint();throw Error("Sua conexão expirou. Reconecte o Google Drive.")}
if(result.status===403)throw Error("O Google recusou o acesso. Verifique a API do Drive e a permissão solicitada.");
if(result.status===429)throw Error("Limite temporário do Google. Tentaremos novamente em alguns instantes.");
if(!result.ok)throw Error("Não foi possível sincronizar (erro "+result.status+"). Os dados locais foram mantidos.");
return result
}
async function listFiles(channel){
let page="",files=[];do{const q=new URLSearchParams({spaces:"appDataFolder",q:"trashed = false and name contains '"+channel.prefix+"'",fields:"nextPageToken,files(id,name)",pageSize:"1000"});if(page)q.set("pageToken",page);
const r=await(await request(API+"/files?"+q)).json();if(!Array.isArray(r.files))throw Error("Resposta inesperada do Drive.");files.push(...r.files);page=r.nextPageToken||""}while(page);return files
}
async function upload(event,channel){
const boundary="reis_cash_"+crypto.randomUUID();
const metadata={name:channel.prefix+event.id+".json",parents:["appDataFolder"],mimeType:"application/json"};
const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify({version:channel.version,event})+"\r\n--"+boundary+"--";
await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body});
}
async function sync(manual=false){
if(!store||!token||busy||(!manual&&Date.now()<blockedUntil)||document.getElementById("modal").open||document.getElementById("bankModal")?.open)return;
if(!navigator.onLine){status("Sem conexão · alterações salvas neste navegador");return}
busy=true;el("syncNow").disabled=true;el("disconnectDrive").disabled=true;status("Sincronizando…");const currentSession=session;
try{
for(const channel of channels){
const store=channel.store;
const files=await listFiles(channel),local=store.info(),known=new Map(local.events.map(e=>[e.id,e])),downloaded=[],present=[];
for(const file of files){
if(session!==currentSession)throw Error("Conexão encerrada.");
if(!file.name.startsWith(channel.prefix)||!file.name.endsWith(".json"))continue;
const id=file.name.slice(channel.prefix.length,-5);present.push(id);
if(!known.has(id)){const res=await request(API+"/files/"+encodeURIComponent(file.id)+"?alt=media");const raw=await res.text();if(raw.length>10000000)throw Error("Arquivo do Drive muito grande.");const payload=JSON.parse(raw);if(payload.version!==channel.version||payload.event?.id!==id)throw Error("Arquivo do REIS CASH inválido no Drive.");channel.check(payload.event);downloaded.push(payload.event);known.set(id,payload.event)}
}
channel.update(store.merge(downloaded,present));
for(const event of store.pending()){if(session!==currentSession)throw Error("Conexão encerrada.");await upload(event,channel);store.merge([],[event.id])}
store.synced();}
failures=0;blockedUntil=0;paint();
}catch(e){failures++;blockedUntil=Date.now()+Math.min(300000,15000*2**Math.min(failures,5));status(e.message||"Falha de conexão · dados mantidos neste navegador");if(!token){el("connectDrive").hidden=false;el("syncNow").hidden=true;el("disconnectDrive").hidden=true}}
finally{busy=false;el("syncNow").disabled=false;el("disconnectDrive").disabled=false}
}
function changed(){paint();clearTimeout(scheduled);scheduled=setTimeout(()=>sync(),1200)}
async function authorized(response){
if(response.error){status("A conexão não foi autorizada. Seus dados continuam neste navegador.");return}
if(!google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE,"openid","email")){status("Autorize as permissões para sincronizar com o Drive.");return}
token=response.access_token;expiry=Date.now()+Number(response.expires_in||3600)*1000-30000;
try{
const account=await(await request("https://openidconnect.googleapis.com/v1/userinfo")).json();
if(typeof account.sub!=="string"||typeof account.email!=="string")throw Error("Não foi possível identificar sua conta Google.");
for(const c of channels){const bound=c.store.info().account;if(bound&&bound.sub!==account.sub)throw Error("Conecte a mesma conta Google usada nos seus dados: "+bound.email)}
for(const c of channels)c.store.bind({sub:account.sub,email:account.email});session++;paint();await sync(true)
}catch(e){token="";expiry=0;paint();status(e.message)}
}
function connect(){
if(!store){status("Corrija o armazenamento local antes de conectar.");return}
if(!window.google?.accounts?.oauth2){status("O acesso do Google ainda não carregou. Verifique sua conexão e tente novamente.");return}
if(!client)client=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:"openid email "+SCOPE,include_granted_scopes:false,callback:authorized,error_callback:()=>{status("A janela do Google foi fechada ou bloqueada. Tente conectar novamente.")}});
client.requestAccessToken({prompt:"select_account"});
}
window.ReisDrive={
start(localStore,update){store=localStore;onData=update;channels=[{store,update,key:ReisSyncCore.STORE,prefix:"reis-cash-event-v2-",version:2,check:e=>ReisSyncCore.checkEvent(e,valid)}];el("connectDrive").onclick=connect;el("syncNow").onclick=()=>sync(true);el("disconnectDrive").onclick=()=>{token="";expiry=0;session++;paint()};paint();
setInterval(()=>{if(!document.hidden)sync()},30000);
window.addEventListener("online",()=>sync(true));document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
window.addEventListener("storage",e=>{for(const c of channels)if(e.key===c.key){try{c.update(c.store.read());changed()}catch(err){status(err.message)}}});
},addStore(channel){channels.push(channel);paint()},changed};
})();
