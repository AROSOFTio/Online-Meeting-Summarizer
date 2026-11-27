/* Exercise built room UI and genuine browser media with a disposable in-memory signaling fixture. */
const {chromium}=require('/opt/arofi-homepage-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const origin=process.argv[2]||'http://127.0.0.1:19283';
const code='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const relay=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const peers=new Map(),queues=new Map();
let next=0;let infoFails=false;
const roster=id=>[...peers.values()].map(p=>({...p,is_self:p.peer_id===id}));
const fixture=async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
 const body=method==='POST'?req.postDataJSON():{};
 const send=(json,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
 if(path==='/api/meetings/public/invitations/'+code)return send({code,meeting_id:1,meeting_title:'Synthetic audio test',meeting_date:'2026-11-27T12:00:00',description:'',lifecycle:'live',requires_name:false,known_name:null});
 if(path==='/api/auth/me')return req.headers()['x-test-organizer']==='1'?send({id:1,email:'host@example.com',full_name:'Organizer',role:'admin',is_active:true,must_change_password:false}):send({},401);
 if(path==='/api/live-rooms/1/info')return infoFails?send({detail:'Synthetic transient metadata failure'},503):send({id:1,title:'Organizer audio test',description:'',date:'2026-11-27T12:00:00',owner_id:1,owner_name:'Organizer',status:'draft',lifecycle:'live',started_at:'2026-11-27T12:00:00',ended_at:null,is_moderator:true,recording:null});
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
 if(path.endsWith('/heartbeat')){Object.assign(peers.get(id),{muted:!!body.muted,visual_mode:body.visual_mode,microphone_available:body.microphone_available});return send({participants:roster(id),forced_muted:peers.get(id).forced_muted});}
 if(path.endsWith('/moderate')){
  if(!peers.get(id).is_moderator)return send({},403);
  for(const [k,p] of peers){
   if(k===id||!(body.target_id==='*'||body.target_id===k))continue;
   p.forced_muted=body.action==='mute';
   if(p.forced_muted)p.muted=true;
   queues.get(k).push({type:p.forced_muted?'force-mute':'release-mute',from_peer_id:id,payload:null});
  }
  return send({participants:roster(id)});
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
 const context=await b.newContext({viewport:{width:390,height:844},extraHTTPHeaders:name==='Organizer'?{'x-test-organizer':'1'}:{}});
 await context.route('**/api/**',fixture);
 await context.addInitScript(({name,freq,code})=>{
  localStorage.setItem('meeting-name:'+code,name);
  window.testPCs=[];
  const NativePC=window.RTCPeerConnection;
  window.RTCPeerConnection=class extends NativePC{constructor(config){super({...config,iceServers:[],iceTransportPolicy:'all'});window.testPCs.push(this);}};
  navigator.mediaDevices.getUserMedia=async()=>{
   const ac=new AudioContext({sampleRate:48000});await ac.resume();const osc=ac.createOscillator(),gain=ac.createGain(),dest=ac.createMediaStreamDestination();
   osc.frequency.value=freq;gain.gain.value=.2;osc.connect(gain).connect(dest);osc.start();window.syntheticSource={ac,osc,gain,dest};return dest.stream;
  };
 },{name,freq,code});
 const p=await context.newPage();p.on('pageerror',e=>console.log(name,'page error',e.message));
 if(name==='Organizer'){
 await p.goto(origin+'/meetings/1/live',{waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:'Continue Recording',exact:true}).click({timeout:15000});
 await p.getByText('Live meeting',{exact:true}).waitFor({timeout:15000});
 }else{
 await p.goto(origin+'/join/'+code+'/room',{waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:'Join with microphone',exact:true}).click({timeout:15000});
 }
 pages.push({p,context,name,freq});
 }
 const host=pages[0].p;
 const health=host.getByLabel('Live audio health',{exact:true});
 await health.getByText('Media links active',{exact:true}).waitFor({timeout:20000});
 await host.getByRole('button',{name:'Speaker',exact:true}).click();
 await health.getByText('Speaker turned off',{exact:true}).waitFor({timeout:8000});
 await health.getByRole('button',{name:'Enable audio',exact:true}).click();
 await health.getByText('Media links active',{exact:true}).waitFor({timeout:8000});
 await host.getByRole('button',{name:'Mute',exact:true}).click();
 await health.getByText('Your microphone is muted',{exact:true}).waitFor({timeout:8000});
 await health.getByRole('button',{name:'Fix microphone',exact:true}).click();
 await health.getByText('Media links active',{exact:true}).waitFor({timeout:8000});
 // Fault injection: freeze the browser statistics to exercise the real monitoring loop.
 await host.evaluate(async()=>{for(const pc of window.testPCs.filter(x=>x.connectionState==='connected')){const snapshot=await pc.getStats();pc.getStats=async()=>snapshot;}});
 await health.getByText(/No incoming audio packets/).first().waitFor({timeout:24000});
 await health.getByText(/No outgoing audio packets/).first().waitFor({timeout:8000});
 console.log('PASS: healthy live media, speaker disabled/recovery, deliberate mute/recovery, stalled RX/TX alerts');
 }finally{await b.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
