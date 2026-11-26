"use client";
import Link from "next/link";
import PublicNav,{PublicFooter} from "@/components/PublicNav";
import PageHero from "@/components/PageHero";
import {useState} from "react";
import {formats} from "@/lib/minute-formats";
import {FileText,Download,ArrowUpRight,Search,Plus} from "lucide-react";

export default function TemplatesPage(){
 const [sector,setSector]=useState("All");
 const [search,setSearch]=useState("");
 const sectors=["All",...new Set(formats.map(f=>f.sector))];
 const visible=formats.filter(f=>(sector==="All"||f.sector===sector)&&[f.name,f.sector,f.description].join(" ").toLowerCase().includes(search.toLowerCase()));
 return <main className="ms-page">
  <PublicNav active="/templates"/>
  <PageHero image="/images/heroes/templates.webp" title="Meeting templates" description="Preview, download or customize a meeting format."/>
  <div className="ms-public-content flex-1 py-6 sm:py-9">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Template library</h2><p className="mt-1 text-sm text-slate-600">{visible.length} templates</p></div><Link href="/templates/builder" className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white"><Plus size={16}/> New template</Link></div>
   <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]"><div className="relative"><Search size={17} className="absolute left-3 top-3 text-slate-500"/><input aria-label="Search formats" placeholder="Search templates" value={search} onChange={e=>setSearch(e.target.value)} className="w-full min-w-0 rounded-md border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm"/></div><select aria-label="Organization type" value={sector} onChange={e=>setSector(e.target.value)} className="min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">{sectors.map(s=><option key={s}>{s}</option>)}</select></div>
   <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">{visible.map(f=>{const base="/template-files/"+f.id;return <article key={f.id} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
    <a href={base+".pdf"} target="_blank" rel="noopener" aria-label={"Preview "+f.name+" PDF"} className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-slate-200 bg-[#edf1f6] p-3 sm:p-5">
     <img src={base+".webp"} loading="lazy" alt={f.name+" first-page document preview"} className="h-full max-w-full object-contain border border-slate-200 bg-white"/>
     <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-blue-700">PDF <ArrowUpRight size={12}/></span>
    </a>
    <div className="flex flex-1 flex-col p-3 sm:p-4"><p className="text-[11px] font-medium text-blue-700">{f.sector}</p><h3 className="mt-1 min-w-0 break-words text-sm font-semibold leading-snug sm:text-base">{f.name}</h3><p className="mt-1 text-xs text-slate-500">{f.fields.length} sections</p>
    <div className="mt-auto pt-4"><div className="grid grid-cols-2 gap-1.5"><a href={base+".pdf"} download className="flex min-w-0 items-center justify-center gap-1 rounded border border-slate-200 px-1 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileText size={14} className="shrink-0"/> PDF</a><a href={base+".docx"} download className="flex min-w-0 items-center justify-center gap-1 rounded border border-slate-200 px-1 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Download size={14} className="shrink-0"/> Word</a></div><Link href={"/templates/builder?format="+f.id} className="mt-2 block rounded-md bg-blue-700 px-2 py-2 text-center text-xs font-semibold text-white hover:bg-blue-800 sm:text-sm">Customize</Link></div></div>
   </article>})}</div>
   {visible.length===0&&<p className="py-12 text-center text-slate-600">No matching formats.</p>}
  </div><PublicFooter/>
 </main>;
}
