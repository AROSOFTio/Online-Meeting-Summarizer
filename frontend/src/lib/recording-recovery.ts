// Browser-local recording journal. Key is supplied by the authenticated tenant API.
type Part={scope:string;index:number;blob:Blob;created:number};
const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{
 const req=indexedDB.open("minuteseal-recordings",1);
 req.onupgradeneeded=()=>{const store=req.result.createObjectStore("parts",{keyPath:["scope","index"]});store.createIndex("scope","scope");};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function transaction<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
 const db=await open();try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction("parts",mode);let value:T;
  tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  try{fn(tx.objectStore("parts"),v=>{value=v;});}catch(e){tx.abort();reject(e);}
 });}finally{db.close();}
}
export const savePart=(scope:string,index:number,blob:Blob)=>transaction<void>("readwrite",(store,done)=>{store.put({scope,index,blob,created:Date.now()} satisfies Part);done();});
export const getParts=(scope:string)=>transaction<Part[]>("readonly",(store,done)=>{const r=store.index("scope").getAll(scope);r.onsuccess=()=>done((r.result as Part[]).sort((a,b)=>a.index-b.index));});
export async function recoverRecording(scope:string){const parts=await getParts(scope);const contiguous:Part[]=[];for(const part of parts){if(part.index!==contiguous.length)break;contiguous.push(part);}return contiguous.length?new Blob(contiguous.map(p=>p.blob),{type:contiguous[0].blob.type||"audio/webm"}):null;}
export const clearRecording=(scope:string)=>transaction<void>("readwrite",(store,done)=>{const r=store.index("scope").openKeyCursor(scope);r.onsuccess=()=>{const c=r.result;if(c){store.delete(c.primaryKey);c.continue();}else done();};});


import {apiRequest,ApiError} from "./api";
const partSize=1024*1024;
async function retry<T>(work:()=>Promise<T>):Promise<T>{
 let last:unknown;
 for(let i=0;i<3;i++){try{return await work();}catch(e){last=e;if(e instanceof ApiError&&e.status<500&&e.status!==429)throw e;if(i<2)await new Promise(r=>setTimeout(r,800*(i+1)));}}
 throw last;
}
export async function uploadRecording(meetingId:number,source:Blob,filename:string,onProgress:(p:number)=>void){
 if(source.size>500*partSize)throw new Error("Recording exceeds the 500 MB upload limit. Download the backup before leaving this page.");
 const edge=new Blob([source.slice(0,65536),source.slice(-65536),String(source.size),filename.split(".").pop()||""]);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await edge.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
 const base="/api/recordings/resume/"+meetingId+"/"+hash;
 const count=Math.ceil(source.size/partSize);
 if(!count)throw new Error("The recording is empty.");
 const state=await retry(()=>apiRequest(base));
 if(state.completed){onProgress(100);return;}
 const stored=new Set<number>(state.parts||[]);
 for(let index=0;index<count;index++){
  if(!stored.has(index)){
   const body=new FormData();body.append("file",source.slice(index*partSize,(index+1)*partSize),"part");
   await retry(()=>apiRequest(base+"/"+index,{method:"PUT",body}));
  }
  onProgress(Math.round(100*(index+1)/count));
 }
 return retry(()=>apiRequest(base+"/complete?count="+count+"&filename="+encodeURIComponent(filename),{method:"POST"}));
}
