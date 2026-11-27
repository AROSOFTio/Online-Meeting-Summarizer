/* Exercise built room UI and genuine browser media with a disposable in-memory signaling fixture. */
const {chromium}=require('/opt/arofi-homepage-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const origin=process.argv[2]||'http://127.0.0.1:19283';
const code='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const relay=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const peers=new Map(),queues=new Map();
let next=0;let infoFails=false;let locked=false;
const roster=id=>[...peers.values()].map(p=>({...p,is_self:p.peer_id===id}));
const fixture=async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
 const body=method==='POST'?req.postDataJSON():{};
 const send=(json,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
 if(path==='/api/meetings/public/invitations/'+code)return send({code,meeting_id:1,meeting_title:'Synthetic audio test',meeting_date:'2026-11-27T12:00:00',description:'',lifecycle:'live',requires_name:false,known_name:null});
 if(path==='/api/auth/me')return req.headers()['x-test-organizer']==='1'?send({id:1,email:'host@example.com',full_name:'Organizer',role:'admin',is_active:true,must_change_password:false}):send({},401);
 if(path==='/api/live-rooms/1/info')return infoFails?send({detail:'Synthetic transient metadata failure'},503):send({id:1,title:'Organizer audio test',description:'',date:'2026-11-27T12:00:00',owner_id:1,owner_name:'Organizer',status:'draft',lifecycle:'live',started_at:'2026-11-27T12:00:00',ended_at:null,is_moderator:true,recording:null,recovery_key:'synthetic-room-recovery-test'});
 if(path==='/api/meetings/1/start')return send({ok:true});
 if(path==='/api/meetings/1/attendance')return send([]);
 if(!path.startsWith('/api/live-rooms/'))return send([]);
 if(path.endsWith('/join')){
 const peer_id=String(++next).padStart(32,'0');
 peers.set(peer_id,{peer_id,name:body.full_name||'Test',role_title:'Participant',user_id:null,is_moderator:!body.invite_code,muted:!!body.muted,forced_muted:false,microphone_available:body.microphone_available,visual_mode:null});
 queues.set(peer_id,[]);
 return send({meeting_id:1,peer_id,session_key:'synthetic-fixture',is_moderator:!body.invite_code,participants:roster(peer_id),ice_servers:relay[next-1].ice_servers,ice_expires_at:relay[next-1].ice_expires_at});
 }
 const id=body.peer_id||url.searchParams.get('peer_id');
 if(!peers.has(id))return send({detail:'Live meeting session expired'},401);
 if(path.endsWith('/heartbeat')){Object.assign(peers.get(id),{muted:!!body.muted,visual_mode:body.visual_mode,microphone_available:body.microphone_available});return send({participants:roster(id),forced_muted:peers.get(id).forced_muted,locked});}
 if(path.endsWith('/moderate')){
  const p=peers.get(id);
  if(body.action==='raise-hand'){p.hand_raised=true;}
  else if(body.action==='lower-all'){for(const person of peers.values())person.hand_raised=false;}
  else if(body.action==='lock')locked=true;
  else if(body.action==='unlock')locked=false;
  else if(body.action==='lower-hand'){peers.get(body.target_id).hand_raised=false;}
  else for(const [k,person] of peers){
   if(k===id||!(body.target_id==='*'||body.target_id===k))continue;
   person.forced_muted=body.action==='mute';if(person.forced_muted)person.muted=true;
   queues.get(k).push({type:person.forced_muted?'force-mute':'release-mute',from_peer_id:id,payload:null});
  }
  return send({participants:roster(id),locked});
 }
 if(path.endsWith('/signal')){if(!peers.has(body.target_id))return send({delivered:false});queues.get(body.target_id).push({from_peer_id:id,type:body.type,payload:body.payload});return send({delivered:true});}
 if(path.endsWith('/signals')){const messages=queues.get(id).splice(0);return send({messages});}
 if(path.endsWith('/leave')){peers.delete(id);queues.delete(id);for(const q of queues.values())q.push({type:'peer-left',from_peer_id:id,payload:null});return send({});}
 return send({},404);
};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/sentinelx-cloud-core/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
 const pages=[];
 for(const [name,freq] of [['Organizer',440],['Guest A',660],['Guest B',880]]){
 const context=await b.newContext({viewport:{width:name==='Organizer'?1366:390,height:name==='Organizer'?900:844},extraHTTPHeaders:name==='Organizer'?{'x-test-organizer':'1'}:{}});
 await context.route('**/api/**',fixture);
 await context.addInitScript(({name,freq,code})=>{
  localStorage.setItem('meeting-name:'+code,name);
  window.testPCs=[];
  const NativePC=window.RTCPeerConnection;
  window.RTCPeerConnection=class extends NativePC{constructor(config){super({...config,iceServers:[],iceTransportPolicy:'all'});window.testPCs.push(this);}};
  const makeVideo=()=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');let tick=0;setInterval(()=>{ctx.fillStyle=tick++%2?'#ff0000':'#0000ff';ctx.fillRect(0,0,1280,720);},100);return canvas.captureStream(10);};
  navigator.mediaDevices.getDisplayMedia=async()=>makeVideo();
  navigator.mediaDevices.getUserMedia=async(options)=>{
   if(options?.video)return makeVideo();
   const ac=new AudioContext({sampleRate:48000});await ac.resume();const osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
   osc.frequency.value=freq;gain.gain.value=.2;osc.connect(gain).connect(dest);osc.start();window.syntheticSource={ac,osc,gain,dest};return dest.stream;
  };
 },{name,freq,code});
 const p=await context.newPage();p.on('pageerror',e=>console.log(name,'page error',e.message));
 if(name==='Organizer'){
 await p.goto(origin+'/meetings/1/live',{waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:'Continue Recording',exact:true}).click({timeout:15000});
 await p.locator('.ms-room-status').getByText('Live meeting',{exact:true}).waitFor({timeout:15000});
 }else{
 await p.goto(origin+'/join/'+code+'/room',{waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:'Join with microphone',exact:true}).click({timeout:15000});
 }
 pages.push({p,context,name,freq});
 }
 const sample=async ({p})=>p.evaluate(async()=>{
  const pcs=window.testPCs.filter(x=>x.connectionState!=='closed');
  const media=[...document.querySelectorAll('audio[data-meeting-remote-audio]')];
  const stats=[];for(const pc of pcs){const r=[...(await pc.getStats()).values()];const pair=r.find(x=>x.type==='candidate-pair'&&x.state==='succeeded'&&x.nominated);const local=r.find(x=>x.id===pair?.localCandidateId);const remote=r.find(x=>x.id===pair?.remoteCandidateId);for(const i of r.filter(x=>x.type==='inbound-rtp'&&x.kind==='audio'))stats.push({relay:local?.candidateType,remoteRelay:remote?.candidateType,protocol:local?.relayProtocol,state:pc.connectionState,bytes:i.bytesReceived,energy:i.totalAudioEnergy,lost:i.packetsLost,codec:r.find(c=>c.id===i.codecId)?.mimeType});}
  const tones=[];
  for(const el of media){if(!el.srcObject)continue;const ac=new AudioContext();await ac.resume();const src=ac.createMediaStreamSource(el.srcObject),an=ac.createAnalyser(),silent=ac.createGain();an.fftSize=8192;silent.gain.value=0;src.connect(an).connect(silent).connect(ac.destination);await new Promise(r=>setTimeout(r,500));const bins=new Float32Array(an.frequencyBinCount);an.getFloatFrequencyData(bins);let peak=0;for(let i=1;i<bins.length;i++)if(bins[i]>bins[peak])peak=i;tones.push({hz:Math.round(peak*ac.sampleRate/an.fftSize),db:Math.round(bins[peak]),playing:!el.paused&&!el.muted});await ac.close();}
  return {stats,tones,width:document.documentElement.scrollWidth,viewport:innerWidth};
 });
 async function check(label){
 let result;const expected=i=>pages.filter((_,j)=>i!==j).map(x=>x.freq);
 const good=(r,i)=>r.tones.length===2&&expected(i).every(f=>r.tones.some(x=>x.playing&&Math.abs(x.hz-f)<15&&x.db>-70))&&r.stats.filter(x=>x.state==='connected'&&x.energy>0).length===2;
 for(let n=0;n<12;n++){await new Promise(r=>setTimeout(r,1200));result=await Promise.all(pages.map(sample));if(result.every(good))break;}
 console.log(label,JSON.stringify(result));
 assert(result.every(good),label+' failed');
 }
 await check('Organizer and two guests initial media');
 const host=pages[0].p;
 await host.getByText('Local recording backup active',{exact:true}).waitFor({timeout:15000});
 const data=await host.evaluate(async()=>{
   const d=await new Promise((res,rej)=>{const q=indexedDB.open("minuteseal-recordings",1);q.onsuccess=()=>res(q.result);q.onerror=rej});
   return await new Promise((res,rej)=>{const t=d.transaction("parts","readonly"),q=t.objectStore("parts").getAll();q.onsuccess=()=>res(q.result.map(p=>({index:p.index,size:p.blob.size})));q.onerror=rej;t.oncomplete=()=>d.close()});
 });
 assert(data.length>0&&data[0].index===0&&data[0].size>0);
 console.log("PASS IndexedDB journal has actual MediaRecorder bytes",JSON.stringify(data));
 host.on('dialog',d=>d.accept());
 await host.reload({waitUntil:'domcontentloaded'});
 await host.getByText('Recoverable recording found on this browser',{exact:true}).waitFor({timeout:15000});
 assert(await host.getByRole('button',{name:'Download recording backup'}).isVisible());
 assert(await host.getByRole('button',{name:'Retry upload and process minutes'}).isVisible());
 assert(await host.getByRole('button',{name:'Continue Recording'}).count()===0);
 console.log("PASS recording survives reload; overwrite prevention, retry and download controls present");
 }finally{await b.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
