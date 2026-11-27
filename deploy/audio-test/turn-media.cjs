/* Synthetic media only; no customer audio or credentials. */
const {chromium}=require('/opt/arofi-homepage-browser-check/node_modules/playwright');
const assert=require('node:assert/strict');
const configs=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const mode=process.argv[2]||'udp';
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/sentinelx-cloud-core/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
 const p=await b.newPage();
 const result=await p.evaluate(async(configs)=>{
 const ac=new AudioContext({sampleRate:48000});await ac.resume();
 const a=new RTCPeerConnection(configs[0]),b=new RTCPeerConnection(configs[1]),remote=[];
 function source(f){const o=ac.createOscillator(),g=ac.createGain(),d=ac.createMediaStreamDestination();o.frequency.value=f;g.gain.value=.2;o.connect(g).connect(d);o.start();return d.stream.getAudioTracks()[0];}
 for(const pc of [a,b])pc.ontrack=e=>{if(e.track.kind!=='audio')return;const el=document.createElement('audio');el.autoplay=true;el.srcObject=new MediaStream([e.track]);document.body.append(el);el.play().catch(()=>{});remote.push({pc,track:e.track,el});};
 const prefer=t=>{const codecs=RTCRtpReceiver.getCapabilities('audio').codecs;t.setCodecPreferences([...codecs.filter(c=>c.mimeType==='audio/opus'),...codecs.filter(c=>c.mimeType!=='audio/opus')]);};
 const ta=a.addTransceiver('audio',{direction:'sendrecv'});prefer(ta);await ta.sender.replaceTrack(source(440));
 a.addTransceiver('video',{direction:'sendrecv'});
 const queuedA=[],queuedB=[];
 a.onicecandidate=e=>{if(e.candidate){if(b.remoteDescription)b.addIceCandidate(e.candidate);else queuedB.push(e.candidate);}};
 b.onicecandidate=e=>{if(e.candidate){if(a.remoteDescription)a.addIceCandidate(e.candidate);else queuedA.push(e.candidate);}};
 await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);
 for(const c of queuedB)await b.addIceCandidate(c);
 const tb=b.getTransceivers().find(t=>t.receiver.track.kind==='audio');tb.direction='sendrecv';prefer(tb);await tb.sender.replaceTrack(source(660));
 await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);
 for(const c of queuedA)await a.addIceCandidate(c);
 for(let n=0;n<40 && (a.connectionState!=="connected"||b.connectionState!=="connected");n++)await new Promise(r=>setTimeout(r,500));
 for(const s of [ta.sender,tb.sender]){const p=s.getParameters();if(p.encodings.length){p.encodings[0].maxBitrate=96000;await s.setParameters(p);}}
 await new Promise(r=>setTimeout(r,3000));
 const out=[];
 for(const pc of [a,b]){
 const r=remote.find(x=>x.pc===pc);
 if(!r){out.push({state:pc.connectionState,missingTrack:true});continue;}
 const an=ac.createAnalyser();an.fftSize=8192;
 const src=ac.createMediaStreamSource(new MediaStream([r.track]));
 const silent=ac.createGain();silent.gain.value=0;src.connect(an).connect(silent).connect(ac.destination);
 await new Promise(r=>setTimeout(r,500));
 const bins=new Float32Array(an.frequencyBinCount);an.getFloatFrequencyData(bins);
 let peak=0;for(let i=1;i<bins.length;i++)if(bins[i]>bins[peak])peak=i;
 const stats=[...(await pc.getStats()).values()];const i=stats.find(s=>s.type==='inbound-rtp'&&s.kind==='audio');
 const pair=stats.find(s=>s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated);const local=stats.find(s=>s.id===pair?.localCandidateId),far=stats.find(s=>s.id===pair?.remoteCandidateId);
 out.push({relayType:local?.candidateType,remoteType:far?.candidateType,relayProtocol:local?.relayProtocol,rttMs:Math.round((pair?.currentRoundTripTime||0)*1000),state:pc.connectionState,hz:Math.round(peak*ac.sampleRate/an.fftSize),db:Math.round(bins[peak]),playing:!r.el.paused,energy:i?.totalAudioEnergy,seconds:i?.totalSamplesDuration,bytes:i?.bytesReceived,lost:i?.packetsLost,codec:stats.find(s=>s.id===i?.codecId)?.mimeType});
 src.disconnect();silent.disconnect();
 }
 a.close();b.close();await ac.close();return out;
 },configs);
 console.log(mode,JSON.stringify(result));
 for(const [i,r] of result.entries()){
 assert(r.relayType==='relay'&&r.remoteType==='relay','not a relay-to-relay connection');
 assert(r.state==='connected'&&r.playing&&r.energy>0&&r.bytes>1000&&r.codec==='audio/opus');
 assert(Math.abs(r.hz-[660,440][i])<15,'remote tone not distinguishable from local microphone');
 }
 console.log('PASS: decoded two-way Opus audio, distinct remote frequencies; no local tone loopback in synthetic test');
 }finally{await b.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
