export type AudioProfile="voice"|"natural";
export function audioProfile():AudioProfile {
 try{return localStorage.getItem("minuteseal-audio-profile")==="natural"?"natural":"voice";}catch{return "voice";}
}
export async function openMicrophone(deviceId="",profile:AudioProfile=audioProfile()): Promise<MediaStream> {
 if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires a supported browser and HTTPS.");
 const device=deviceId?{deviceId:{exact:deviceId}}:{};
 const audio={...device,echoCancellation:true,noiseSuppression:profile==="voice",autoGainControl:false,sampleRate:{ideal:48000},channelCount:{ideal:1}};
 try{return await navigator.mediaDevices.getUserMedia({audio,video:false});}
 catch(e){
  // Retry without processing constraints, but never silently change the selected device.
  if(e instanceof Error && ["OverconstrainedError","NotSupportedError","NotReadableError","TrackStartError","AbortError","TypeError"].includes(e.name))
   return navigator.mediaDevices.getUserMedia({audio:deviceId?device:true,video:false});
  throw e;
 }
}
export function mediaError(e:unknown){
 if(e instanceof Error){
  if(["NotReadableError","TrackStartError","AbortError"].includes(e.name))return "The selected microphone could not start. Check Windows microphone permissions, reconnect your headset or select another input and retry.";
  if(["NotAllowedError","SecurityError"].includes(e.name))return "Allow microphone access in your browser and operating system, then retry.";
  if(["NotFoundError","DevicesNotFoundError","OverconstrainedError"].includes(e.name))return "The selected microphone is unavailable. Reconnect it or select another input.";
  return e.message;
 }
 return "Could not start the microphone.";
}


export function preferOpus(t:RTCRtpTransceiver){
 try{
  const codecs=RTCRtpReceiver.getCapabilities("audio")?.codecs||[];
  const opus=codecs.filter(c=>c.mimeType.toLowerCase()==="audio/opus");
  if(opus.length)t.setCodecPreferences([...opus,...codecs.filter(c=>c.mimeType.toLowerCase()!=="audio/opus")]);
 }catch{/* Browser default codec remains available. */}
}
export async function tuneAudioSender(sender:RTCRtpSender){
 try{
  const params=sender.getParameters();
  if(!params.encodings?.length)return;
  for(const encoding of params.encodings)encoding.maxBitrate=96000;
  await sender.setParameters(params);
 }catch{/* Browser/network congestion control is always authoritative. */}
}
