"use client";
import Link from "next/link";
import { useState } from "react";
import { formats } from "@/lib/minute-formats";
export default function TemplatesPage(){
  const [sector,setSector]=useState("All");
  const [search,setSearch]=useState("");
  const sectors=["All",...new Set(formats.map(f=>f.sector))];
  const visible=formats.filter(f=>(sector==="All"||f.sector===sector)&&[f.name,f.sector,f.description].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4"><Link href="/" className="text-xl font-bold text-blue-800">MinuteSeal</Link><nav className="flex items-center gap-4 text-sm"><Link href="/templates/builder" className="font-semibold text-blue-700">Format builder</Link><Link href="/login" className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Sign in</Link></nav></div></header>
    <div className="mx-auto max-w-7xl px-5 py-10"><p className="text-sm font-semibold text-blue-700">PUBLIC TEMPLATE LIBRARY</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Meeting minutes for every organization</h1><p className="mt-3 max-w-2xl text-slate-600">Browse professional formats, customize fields and create a reusable structure. No sign-in required. This library contains blank formats only.</p>
    <div className="my-6 flex flex-wrap gap-3"><input aria-label="Search formats" placeholder="Search templates..." value={search} onChange={e=>setSearch(e.target.value)} className="min-w-48 flex-1 rounded-lg border bg-white px-4 py-3"/><select aria-label="Organization type" value={sector} onChange={e=>setSector(e.target.value)} className="rounded-lg border bg-white px-4 py-3">{sectors.map(s=><option key={s}>{s}</option>)}</select><Link href="/templates/builder" className="rounded-lg border border-blue-200 bg-white px-4 py-3 font-semibold text-blue-700">Create from scratch</Link></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(f=><article key={f.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{f.sector}</p><h2 className="mt-2 text-lg font-bold">{f.name}</h2><p className="mt-2 flex-1 text-sm text-slate-600">{f.description}</p><p className="mt-5 text-xs text-slate-600">{f.fields.length} configurable sections</p><Link href={"/templates/builder?format="+f.id} className="mt-3 rounded-lg border border-blue-200 px-4 py-2 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50">Preview & customize</Link></article>)}</div>
    {visible.length===0&&<p className="py-12 text-center text-slate-600">No matching formats.</p>}</div></main>;
}
