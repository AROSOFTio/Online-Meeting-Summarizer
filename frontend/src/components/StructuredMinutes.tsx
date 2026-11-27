"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {formats,type FormatField} from "@/lib/minute-formats";
type Definition={name:string;sector:string;fields:FormatField[]};
type Stored={id:number;definition:Definition};
type Snapshot={definition:Definition;values:Record<string,string>;status:string;missing_required:string[]};
function fieldColumns(f:FormatField):string[]{
  if(f.columns?.length)return f.columns;
  const source=f.source||f.id;
  return ({attendance:["Name","Role","Status"],actions:["Action","Responsible person","Due date","Status"],motions:["Motion","Proposer","Seconder","Outcome"],risks:["Risk","Mitigation","Responsible person"]} as Record<string,string[]>)[source]||["Details","Notes"];
}
function TableEditor({field,value,onChange,disabled}:{field:FormatField;value:string;onChange:(v:string)=>void;disabled:boolean}){
 const cols=fieldColumns(field);
 const rows=value?value.split("\n").map(line=>line.split("\t")):[];
 function update(next:string[][]){onChange(next.map(row=>cols.map((_,i)=>(row[i]||"").replace(/[\t\r\n]/g," ")).join("\t")).join("\n"));}
 return <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr>{cols.map((c,i)=><th key={i} className="border bg-slate-100 p-2 text-left">{c}</th>)}{!disabled&&<th className="border p-2">Remove</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{cols.map((c,j)=><td key={j} className="border p-1"><input aria-label={c+" row "+(i+1)} disabled={disabled} value={row[j]||""} onChange={e=>update(rows.map((r,k)=>k===i?cols.map((_,l)=>l===j?e.target.value:r[l]||""):r))} className="w-full min-w-24 rounded border p-2"/></td>)}{!disabled&&<td className="border p-1"><button type="button" onClick={()=>update(rows.filter((_,k)=>k!==i))} className="text-red-700">Remove</button></td>}</tr>)}</tbody></table>{!disabled&&<button type="button" onClick={()=>onChange([value,cols.map(()=>"").join("\t")].filter(Boolean).join("\n"))} className="mt-2 rounded border px-3 py-1 text-sm text-blue-700">Add row</button>}</div>;
}
export default function StructuredMinutes({meetingId,status,canManage,isAdmin,children}:{meetingId:number;status:string;canManage:boolean;isAdmin:boolean;children:ReactNode}){
 const qc=useQueryClient();
 const key=["structured-minutes",meetingId];
 const base="/api/minute-formats/meeting/"+meetingId;
 const current=useQuery<Snapshot|null>({queryKey:key,queryFn:()=>apiRequest(base),retry:false,refetchInterval:status==="processing"?2000:false});
 const library=useQuery<Stored[]>({queryKey:["my-minute-formats"],queryFn:()=>apiRequest("/api/minute-formats/library"),enabled:canManage,retry:false});
 const [selected,setSelected]=useState("");
 const [edits,setEdits]=useState<Record<string,string>|null>(null);
 const [message,setMessage]=useState("");
 const [editing,setEditing]=useState(false);
 const mutation=useMutation({mutationFn:({path,method,body}:{path:string;method:string;body?:unknown})=>apiRequest(path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})}),onSuccess:async()=>{setEdits(null);setEditing(false);setMessage("Saved successfully.");await qc.invalidateQueries({queryKey:key});},onError:e=>setMessage(e instanceof Error?e.message:"Request failed")});
 const snapshot=current.data;
 const disabled=mutation.isPending||!canManage||status==="processing"||snapshot?.status==="final";
 if(current.isLoading)return <p className="p-4 text-sm">Loading minute format...</p>;
 if(current.isError)return <p role="alert" className="rounded border border-red-200 bg-red-50 p-4">Unable to load minute format. {current.error?.message}</p>;
 if(!snapshot)return <>{canManage&&<section className="mb-4 rounded-lg border bg-white p-5"><h2 className="font-bold">Choose a professional minute format</h2><p className="mt-1 text-sm text-slate-600">Create a format in the builder, save to your account, then attach it to this meeting. Existing standard minutes remain available until you select a format.</p><div className="mt-3 flex flex-wrap gap-2"><select aria-label="Saved minute format" value={selected} onChange={e=>setSelected(e.target.value)} className="rounded border px-3 py-2"><option value="">Select a format</option>{formats.map(t=><option key={t.id} value={"preset:"+t.id}>{t.name}</option>)}{library.data?.map(t=><option value={t.id} key={t.id}>{t.definition.name}</option>)}</select><button disabled={!selected||disabled} onClick={()=>mutation.mutate({path:base+"/format",method:"PUT",body:selected.startsWith("preset:")?{definition:(({name,sector,fields})=>({name,sector,fields}))(formats.find(t=>t.id===selected.slice(7))!)}:{format_id:Number(selected)}})} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Apply format</button><Link href="/minute-formats" className="rounded border px-3 py-2 text-sm text-blue-700">Browse formats</Link></div>{library.isError&&<p role="alert" className="text-red-700">{library.error?.message}</p>}{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</section>}{children}</>;
 const values=edits||snapshot.values;
 const missing=snapshot.definition.fields.filter(f=>f.required&&!values[f.id]?.trim()).map(f=>f.label);
 function change(id:string,value:string){setEdits(old=>({...(old||snapshot!.values),[id]:value}));}
 const busy=mutation.isPending;
 return <section className="space-y-5 rounded-lg border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{snapshot.definition.name}</h2><p className="text-sm text-slate-600">{snapshot.definition.sector} · {snapshot.status==="final"?"Final record":status==="completed"?"Generated meeting minutes":"Meeting minutes"}</p></div><div className="flex flex-wrap gap-2">{canManage&&snapshot.status!=="final"&&<><button disabled={busy||status!=="completed"||!!edits} onClick={()=>{if(window.confirm("Generate sections from the transcript? Saved draft values may be replaced."))mutation.mutate({path:base+"/generate",method:"POST"});}} className="rounded border px-3 py-2 text-sm text-blue-700 disabled:opacity-50">Regenerate minutes</button><button disabled={disabled} onClick={()=>setEditing(v=>!v)} className="rounded border px-3 py-2 text-sm text-blue-700">{editing?"Close editor":"Edit minutes"}</button>{editing&&<button disabled={!edits||disabled} onClick={()=>mutation.mutate({path:base+"/values",method:"PUT",body:{values}})} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">Save minutes</button>}{isAdmin&&<button disabled={busy||!!edits||missing.length>0||status!=="completed"} onClick={()=>{if(window.confirm("Finalize the reviewed minutes? The record will be locked."))mutation.mutate({path:"/api/meetings/"+meetingId+"/finalize?share=false",method:"POST"});}} className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50">Finalize</button>}</>}</div></div>
 {message&&<p role="status" className="rounded border p-3 text-sm">{message}</p>}
 {editing&&missing.length>0&&<p className="text-xs text-slate-600">Unrecorded required fields: {missing.join(", ")}</p>}
 {edits&&<p className="text-xs text-amber-800">Unsaved changes. Save before generating or exporting.</p>}
 {!editing&&snapshot.definition.fields.map((f,i)=>{const value=values[f.id]?.trim();return <section key={f.id} className="border-t pt-4"><h3 className="mb-2 text-sm font-bold">{i+1}. {f.label}</h3>{f.kind==="table"&&value?<div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr>{fieldColumns(f).map(c=><th key={c} className="border bg-slate-100 p-2 text-left">{c}</th>)}</tr></thead><tbody>{value.split("\n").map((line,j)=><tr key={j}>{line.split("\t").map((c,k)=><td key={k} className="border p-2 align-top">{c||"Not recorded"}</td>)}</tr>)}</tbody></table></div>:<p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{value||(f.kind==="signature"?"Signature not yet recorded.":"Not recorded in the available meeting record.")}</p>}</section>;})}
 {editing&&snapshot.definition.fields.map((f,i)=><div key={f.id} className="border-t pt-4"><label className="mb-2 block text-sm font-bold" htmlFor={"minute-"+f.id}>{i+1}. {f.label}{f.required?" *":""}</label>{f.hint&&<p className="mb-2 text-xs text-slate-600">{f.hint}</p>}{f.kind==="table"?<TableEditor field={f} value={values[f.id]||""} disabled={disabled} onChange={v=>change(f.id,v)}/>:f.kind==="paragraph"||f.kind==="list"?<textarea id={"minute-"+f.id} disabled={disabled} rows={f.kind==="paragraph"?5:3} value={values[f.id]||""} onChange={e=>change(f.id,e.target.value)} className="w-full rounded border p-3 text-sm"/>:<input id={"minute-"+f.id} disabled={disabled} type={f.kind==="date"?"date":f.kind==="time"?"time":"text"} value={values[f.id]||""} onChange={e=>change(f.id,e.target.value)} className="w-full rounded border p-3 text-sm"/>}</div>)}
 <div className="flex flex-wrap gap-2 border-t pt-4">{!edits&&["pdf","docx","txt"].map(f=><a key={f} href={"/api/meetings/"+meetingId+"/export?format="+f} className="rounded border px-4 py-2 text-sm font-semibold text-blue-700">{f==="docx"?"Word":f.toUpperCase()}</a>)}{snapshot.status==="final"&&<a href={"/api/meetings/"+meetingId+"/final-minutes"} className="rounded border px-4 py-2 text-sm text-blue-700">Download finalized PDF</a>}</div></section>;
}
