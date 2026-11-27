// Local-only WebRTC health classification. Silence is not a transmission fault.
export type AudioIssue = {code:string; title:string; detail:string; action:"mic"|"speaker"|"reconnect"|"none"; severity:"info"|"warning"|"error"};
export type PeerAudioSample = {id:string; label:string; state:string; ice:string; rx?:number; tx?:number; received?:number; lost?:number; rtt?:number; jitter?:number; remoteMuted:boolean; expectedRx:boolean; expectedTx:boolean; playback:"playing"|"paused"|"missing"|"muted"; age:number; txAge?:number; rxAge?:number; badQualityAge?:number; lastRx?:number; lastTx?:number; lastReceived?:number; lastLost?:number; sourceEnergy?:number; lastSourceEnergy?:number; sourceSilentAge?:number};
export type AudioHealthInput = {online:boolean; reconnecting:boolean; speaker:boolean; blocked:boolean; forced:boolean; localMuted:boolean; mic:"missing"|"ended"|"muted"|"live"; peers:PeerAudioSample[]; expectedPeers:number; statsAvailable:boolean};
export function classifyAudio(input:AudioHealthInput):AudioIssue[]{
 const issues:AudioIssue[]=[];
 const add=(code:string,title:string,detail:string,action:AudioIssue["action"],severity:AudioIssue["severity"]="warning")=>issues.push({code,title,detail,action,severity});
 if(!input.online){add("offline","Internet connection lost","Audio cannot travel while offline. Stay in the meeting; reconnect when internet returns.","none","error");return issues;}
 if(input.forced)add("moderated","Microphone muted by organizer","Wait until the organizer restores microphone permission.","none","info");
 else if(input.mic==="missing"||input.mic==="ended")add("microphone","Microphone not connected","Connect a microphone and allow browser microphone access.","mic","warning");
 else if(input.mic==="muted")add("device-muted","Microphone input interrupted","The browser or operating system is not supplying microphone input. Check the device or select another microphone.","mic","warning");
 else if(input.localMuted)add("self-muted","Your microphone is muted","Other participants cannot hear you until you unmute.","mic","info");
 if(!input.speaker)add("speaker-off","Speaker turned off","Enable meeting audio to hear participants.","speaker","info");
 else if(input.blocked)add("playback-blocked","Browser blocked audio playback","Tap Enable audio to allow the browser to play meeting sound.","speaker","error");
 if(input.reconnecting)add("reconnecting","Meeting connection interrupted","The room is recovering its connection. You can retry your own audio without ending the meeting.","reconnect");
 for(const p of input.peers){
  const prefix=p.label+": ";
  if(p.state!=="connected"&&p.age>=12000){
   const failed=p.state==="failed"||p.ice==="failed";
   add("link-"+p.id,prefix+(failed?"Media connection failed":"Media connection not ready"),"No working WebRTC link yet. Check your network or reconnect your audio.","reconnect",failed?"error":"warning");
   continue;
  }
  if(p.state!=="connected")continue;
  if(p.expectedRx&&(p.rxAge??0)>=12000)add("rx-"+p.id,prefix+"No incoming audio packets","Connected, but audio packets have not arrived for at least 12 seconds. The remote microphone or media path may be interrupted.","reconnect","error");
  if(p.expectedTx&&(p.txAge??0)>=12000)add("tx-"+p.id,prefix+"No outgoing audio packets","Your microphone is enabled, but outgoing audio packets are not increasing. Check the microphone or reconnect audio.","reconnect","error");
  if(input.speaker&&(p.playback==="paused"||p.playback==="muted"||p.playback==="missing")&&p.expectedRx&&(p.rx??0)>0&&p.age>=8000)add("play-"+p.id,prefix+"Audio received but not playing","Incoming media exists but the browser is not playing it. Enable audio.","speaker","error");
  if((p.badQualityAge??0)>=8000)add("quality-"+p.id,prefix+"Unstable audio connection","Sustained packet loss, delay or jitter may cause choppy sound. Consider turning off video or switching networks.","none");
  if(p.expectedTx&&(p.sourceSilentAge??0)>=20000)add("quiet-"+p.id,"No microphone sound detected","If you are speaking, check your microphone and input volume. Silence alone does not mean the microphone is broken.","mic","info");
 }
 if(input.expectedPeers>0&&!input.statsAvailable)add("stats","Audio statistics unavailable","This browser has not provided media statistics yet; audio status cannot be verified.","none","info");
 return issues.filter((issue,index,all)=>all.findIndex(x=>x.title===issue.title)===index);
}
