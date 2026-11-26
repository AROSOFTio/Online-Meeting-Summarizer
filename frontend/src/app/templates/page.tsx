"use client";
import Link from "next/link";
import PublicNav, { PublicFooter } from "@/components/PublicNav";
import PageHero from "@/components/PageHero";
import { useState } from "react";
import { formats } from "@/lib/minute-formats";
export default function TemplatesPage(){
  const [sector,setSector]=useState("All");
  const [search,setSearch]=useState("");
  const sectors=["All",...new Set(formats.map(f=>f.sector))];
  const visible=formats.filter(f=>(sector==="All"||f.sector===sector)&&[f.name,f.sector,f.description].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <main className="ms-page">
    <PublicNav active="/templates"/>
    <PageHero image="/images/heroes/templates.webp" title="Meeting templates" description="Browse and customize blank formats."/>
    <div className="ms-public-content py-4">
    <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><input aria-label="Search formats" placeholder="Search templates..." value={search} onChange={e=>setSearch(e.target.value)} className="col-span-2 min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"/><select aria-label="Organization type" value={sector} onChange={e=>setSector(e.target.value)} className="min-w-0 rounded-md border bg-white px-2 py-2 text-sm">{sectors.map(s=><option key={s}>{s}</option>)}</select><Link href="/templates/builder" className="rounded-md border border-blue-200 bg-white px-2 py-2 text-center text-xs font-semibold sm:text-sm text-blue-700">Create from scratch</Link></div>
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{visible.map(f=><article key={f.id} className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-3 sm:p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{f.sector}</p><h2 className="mt-2 text-sm font-bold break-words sm:text-base">{f.name}</h2><p className="mt-2 hidden flex-1 text-sm text-slate-600 sm:block">{f.description}</p><p className="mt-3 text-xs text-slate-600">{f.fields.length} configurable sections</p><Link href={"/templates/builder?format="+f.id} className="mt-3 rounded-md border border-blue-200 px-2 py-2 text-center text-xs sm:text-sm font-semibold text-blue-700 hover:bg-blue-50">Customize</Link></article>)}</div>
    {visible.length===0&&<p className="py-12 text-center text-slate-600">No matching formats.</p>}</div><PublicFooter/></main>;
}
