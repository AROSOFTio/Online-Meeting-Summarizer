"use client";
import {useEffect,useRef,useState} from "react";
import {openMicrophone,mediaError} from "@/lib/meeting-media";
export default function MicrophoneSetup({value,onChange,disabled=false,onTestingChange}:{value:string;onChange:(id:string)=>void;disabled?:boolean;onTestingChange?:(busy:boolean)=>void}){
 const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[level,setLevel]=useState(0);
 const stopRef=useRef<()=>void>(()=>{}),generation=useRef(0);
 async function refresh(){try{setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="audioinput"&&d.deviceId));}catch{}}
 useEffect(()=>{void refresh();navigator.mediaDevices?.addEventListener("devicechange",refresh);return()=>{navigator.mediaDevices?.removeEventListener("devicechange",refresh);generation.current++;stopRef.current();};},[]);
 useEffect(()=>{if(disabled){generation.current++;stopRef.current();setBusy(false);onTestingChange?.(false);setLevel(0);}},[disabled]);
 async function test(){stopRef.current();const id=++generation.current;setBusy(true);onTestingChange?.(true);setMessage("");let stream:MediaStream|null=null;let context:AudioContext|null=null;
 try{stream=await openMicrophone(value);if(id!==generation.current){stream.getTracks().forEach(t=>t.stop());return;}await refresh();if(id!==generation.current){stream.getTracks().forEach(t=>t.stop());return;}
 context=new AudioContext();await context.resume();if(id!==generation.current){stream.getTracks().forEach(t=>t.stop());void context.close();return;}
 const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();source.connect(analyser);const samples=new Uint8Array(analyser.fftSize);
 setMessage("Speak into your microphone to test the input.");
 const timer=window.setInterval(()=>{analyser.getByteTimeDomainData(samples);let total=0;for(const n of samples)total+=((n-128)/128)**2;setLevel(Math.min(100,Math.round(Math.sqrt(total/samples.length)*600)));},100);
 const end=window.setTimeout(()=>{stopRef.current();setBusy(false);onTestingChange?.(false);setLevel(0);setMessage("Microphone test finished.");},6000);
 stopRef.current=()=>{window.clearInterval(timer);window.clearTimeout(end);stream?.getTracks().forEach(t=>t.stop());if(context?.state!=="closed")void context?.close();};
 }catch(e){stream?.getTracks().forEach(t=>t.stop());if(context?.state!=="closed")void context?.close();if(id===generation.current){setMessage(mediaError(e));setBusy(false);onTestingChange?.(false);}}
 }
 return <div className="mx-auto mt-5 max-w-xl rounded-lg border border-slate-200 p-4 text-left"><label className="block text-sm font-semibold">Microphone input<select disabled={disabled||busy} value={value} onChange={e=>{onChange(e.target.value);setMessage("");}} className="mt-2 block w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm"><option value="">System default microphone</option>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Microphone ${i+1}`}</option>)}</select></label><div className="mt-3 flex items-center gap-3"><button type="button" disabled={disabled||busy} onClick={()=>void test()} className="rounded-md border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700">{busy?"Testing...":"Test microphone"}</button><div role="meter" aria-label="Input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level} className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div style={{width:level+"%"}} className="h-full bg-green-500 motion-safe:transition-all"/></div></div>{message&&<p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}</div>;
}
