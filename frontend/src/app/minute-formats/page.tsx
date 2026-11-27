"use client";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import {useAuth} from "@/context/AuthContext";
import {useQuery} from "@tanstack/react-query";
import {apiRequest} from "@/lib/api";

import {useState} from "react";
import {formats,type FormatField} from "@/lib/minute-formats";
import {FileText,Download,ArrowUpRight,Search,Plus} from "lucide-react";

export default function TemplatesPage(){
 const {user}=useAuth();
 const canEdit=user?.role==="admin"||user?.role==="minute_secretary";
 const saved=useQuery<{id:number;definition:{name:string;sector:string;fields:FormatField[]}}[]>({queryKey:["my-minute-formats",user?.id],queryFn:()=>apiRequest("/api/minute-formats/library"),enabled:canEdit,retry:false});
 const [sector,setSector]=useState("All");
 const [search,setSearch]=useState("");
 const sectors=["All",...new Set(formats.map(f=>f.sector))];
 const visible=formats.filter(f=>(sector==="All"||f.sector===sector)&&[f.name,f.sector,f.description].join(" ").toLowerCase().includes(search.toLowerCase()));
 return <DashboardLayout><div className="space-y-5">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Template library</h2><p className="mt-1 text-sm text-slate-600">{visible.length} templates</p></div>{canEdit&&<Link href="/minute-formats/builder" className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white"><Plus size={16}/> New template</Link>}</div>
   {canEdit&&<section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="font-semibold">My templates</h2>{saved.isError&&<p role="alert" className="mt-2 text-sm text-red-700">Unable to load saved templates.</p>}{saved.isLoading?<p className="text-sm">Loading...</p>:!saved.data?.length?<p className="mt-2 text-sm text-slate-600">Customize a template or create your own.</p>:<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{saved.data.map(t=><div key={t.id} className="rounded border p-3"><h3 className="font-semibold">{t.definition.name}</h3><p className="text-xs text-slate-600">{t.definition.sector} · {t.definition.fields.length} sections</p><div className="mt-3 flex flex-wrap gap-2"><Link href={"/create-meeting?saved="+t.id} className="rounded bg-blue-700 px-3 py-2 text-xs text-white">Use template</Link><Link href={"/minute-formats/builder?saved="+t.id} className="rounded border px-3 py-2 text-xs text-blue-700">Customize copy</Link></div></div>)}</div>}</section>}
   <h2 className="font-semibold">Ready-made templates</h2>
   <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]"><div className="relative"><Search size={17} className="absolute left-3 top-3 text-slate-500"/><input aria-label="Search formats" placeholder="Search templates" value={search} onChange={e=>setSearch(e.target.value)} className="w-full min-w-0 rounded-md border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm"/></div><select aria-label="Organization type" value={sector} onChange={e=>setSector(e.target.value)} className="min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">{sectors.map(s=><option key={s}>{s}</option>)}</select></div>
   <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">{visible.map(f=>{const base="/template-files/"+f.id;return <article key={f.id} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
    <a href={base+".pdf"} target="_blank" rel="noopener" aria-label={"Preview "+f.name+" PDF"} className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-slate-200 bg-[#edf1f6] p-3 sm:p-5">
     <img src={base+".webp"} loading="lazy" alt={f.name+" first-page document preview"} className="h-full max-w-full object-contain border border-slate-200 bg-white"/>
     <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-blue-700">PDF <ArrowUpRight size={12}/></span>
    </a>
    <div className="flex flex-1 flex-col p-3 sm:p-4"><p className="text-[11px] font-medium text-blue-700">{f.sector}</p><h3 className="mt-1 min-w-0 break-words text-sm font-semibold leading-snug sm:text-base">{f.name}</h3><p className="mt-1 text-xs text-slate-500">{f.fields.length} sections</p>
    <div className="mt-auto pt-4"><div className="grid grid-cols-2 gap-1.5"><a href={base+".pdf"} download className="flex min-w-0 items-center justify-center gap-1 rounded border border-slate-200 px-1 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileText size={14} className="shrink-0"/> PDF</a><a href={base+".docx"} download className="flex min-w-0 items-center justify-center gap-1 rounded border border-slate-200 px-1 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Download size={14} className="shrink-0"/> Word</a></div>{canEdit&&<div className="mt-2 grid gap-1.5 sm:grid-cols-2"><Link href={"/create-meeting?format="+f.id} className="rounded-md bg-blue-700 px-2 py-2 text-center text-xs font-semibold text-white">Use template</Link><Link href={"/minute-formats/builder?format="+f.id} className="rounded-md border px-2 py-2 text-center text-xs font-semibold text-blue-700">Customize</Link></div>}</div></div>
   </article>})}</div>
   {visible.length===0&&<p className="py-12 text-center text-slate-600">No matching formats.</p>}
  </div></DashboardLayout>;
}
