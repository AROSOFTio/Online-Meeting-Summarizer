/* Exercise built room UI and genuine browser media with a disposable in-memory signaling fixture. */
const {chromium}=require('/opt/arofi-homepage-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const origin=process.argv[2]||'http://127.0.0.1:19283';
const code='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const relay=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const peers=new Map(),queues=new Map();
let next=0;
const roster=id=>[...peers.values()].map(p=>({...p,is_self:p.peer_id===id}));
const fixture=async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
 const body=method==='POST'?req.postDataJSON():{};
 const send=(json,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
 if(path==='/api/meetings/public/invitations/'+code)return send({code,meeting_id:1,meeting_title:'Synthetic audio test',meeting_date:'2026-11-27T12:00:00',description:'',lifecycle:'live',requires_name:false,known_name:null});
 if(path==='/api/auth/me')return send({},401);
 if(path.endsWith('/join')){
 const peer_id=String(++next).padStart(32,'0');
 peers.set(peer_id,{peer_id,name:body.full_name||'Test',role_title:'Participant',user_id:null,is_moderator:false,muted:!!body.muted,forced_muted:false,microphone_available:body.microphone_available,visual_mode:null});
 queues.set(peer_id,[]);
 return send({meeting_id:1,peer_id,session_key:'synthetic-fixture',is_moderator:false,participants:roster(peer_id),ice_servers:relay[next-1].ice_servers,ice_expires_at:relay[next-1].ice_expires_at});
 }
 const id=body.peer_id||url.searchParams.get('peer_id');
 if(!peers.has(id))return send({detail:'Live meeting session expired'},401);
 if(path.endsWith('/heartbeat')){Object.assign(peers.get(id),{muted:!!body.muted,visual_mode:body.visual_mode,microphone_available:body.microphone_available});return send({participants:roster(id),forced_muted:false});}
 if(path.endsWith('/signal')){if(!peers.has(body.target_id))return send({delivered:false});queues.get(body.target_id).push({from_peer_id:id,type:body.type,payload:body.payload});return send({delivered:true});}
 if(path.endsWith('/signals')){const messages=queues.get(id).splice(0);return send({messages});}
 if(path.endsWith('/leave')){peers.delete(id);queues.delete(id);for(const q of queues.values())q.push({type:'peer-left',from_peer_id:id,payload:null});return send({});}
 return send({},404);
};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/sentinelx-cloud-core/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
 const pages=[];
 for(const [name,freq] of [['Alpha',440],['Bravo',660]]){
 const context=await b.newContext({viewport:{width:390,height:844}});
 await context.route('**/api/**',fixture);
 await context.addInitScript(({name,freq,code})=>{
  localStorage.setItem('meeting-name:'+code,name);
  window.testPCs=[];
  const NativePC=window.RTCPeerConnection;
  window.RTCPeerConnection=class extends NativePC{constructor(config){super({...config,iceTransportPolicy:'relay'});window.testPCs.push(this);}};
  navigator.mediaDevices.getUserMedia=async()=>{
   const ac=new AudioContext({sampleRate:48000});await ac.resume();const osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
   osc.frequency.value=freq;gain.gain.value=.2;osc.connect(gain).connect(dest);osc.start();window.syntheticSource={ac,osc,gain,dest};return dest.stream;
  };
 },{name,freq,code});
 const p=await context.newPage();p.on('pageerror',e=>console.log(name,'page error',e.message));
 await p.goto(origin+'/join/'+code+'/room',{waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:'Join with microphone',exact:true}).click({timeout:15000});
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
 let result;
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,1200));result=await Promise.all(pages.map(sample));if(result.every((r,i)=>r.tones.some(x=>x.playing&&Math.abs(x.hz-pages[1-i].freq)<15&&x.db>-70)&&r.stats.some(x=>x.state==='connected'&&x.energy>0&&x.relay==='relay'&&x.remoteRelay==='relay')))break;}
 console.log(label,JSON.stringify(result));
 for(let i=0;i<2;i++){assert(result[i].tones.length===1,'duplicate or missing remote audio element');assert(result[i].tones.some(x=>x.playing&&Math.abs(x.hz-pages[1-i].freq)<15&&x.db>-70),'missing distinct remote audio');assert(result[i].stats.some(x=>x.state==='connected'&&x.energy>0&&x.relay==='relay'&&x.remoteRelay==='relay'));assert(result[i].width<=result[i].viewport,'mobile horizontal overflow');}
 }
 await check('Initial actual UI audio');
 // Simulate loss of the second client's session, without network access to a real meeting.
 const old=[...peers.keys()][1];peers.delete(old);queues.delete(old);
 for(const q of queues.values())q.push({type:'peer-left',from_peer_id:old,payload:null});
 await check('Recovered actual UI audio');
 assert(peers.size===2&&next>=3);
 console.log('PASS: two isolated browser room clients, remote tones, one playback element per peer, recovery and mobile width');
 }finally{await b.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
