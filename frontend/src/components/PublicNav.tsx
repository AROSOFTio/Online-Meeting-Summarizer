"use client";
import Link from "next/link";
import {Menu,X} from "lucide-react";
import {useState} from "react";
const links=[["/","Home"],["/features","Features"],["/solutions","Solutions"],["/how-it-works","How it works"],["/templates","Templates"]] as const;
export default function PublicNav({active}: {active:string}) {
 const [open,setOpen]=useState(false);
 return <header className="relative z-20 border-b border-slate-200 bg-white">
  <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-3 py-3 sm:px-5 xl:w-[88%] xl:px-0">
   <Link href="/" className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2.5"><img src="/minuteseal.svg" alt="" className="size-8 sm:size-10"/><span className="text-lg font-bold leading-none tracking-tight text-slate-950 sm:text-2xl">Minute<span className="text-blue-700">Seal</span></span></Link>
   <nav aria-label="Main navigation" className="hidden items-center gap-x-5 text-sm font-medium text-slate-700 xl:flex">{links.map(([href,label])=><Link key={href} href={href} aria-current={active===href?"page":undefined} className={active===href?"font-bold text-blue-700":"hover:text-blue-700"}>{label}</Link>)}</nav>
   <div className="flex shrink-0 items-center gap-2"><Link href="/login" className="rounded-md border border-blue-700 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 sm:text-sm">Sign in</Link><Link href="/setup" className="hidden rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 xl:block">Set up workspace</Link><button type="button" aria-label={open?"Close navigation":"Open navigation"} aria-expanded={open} aria-controls="public-mobile-navigation" onClick={()=>setOpen(v=>!v)} className="flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-800 xl:hidden">{open?<X size={21}/>:<Menu size={21}/>}</button></div>
  </div>
  {open&&<nav id="public-mobile-navigation" aria-label="Mobile navigation" className="absolute inset-x-0 top-full grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-4 text-sm xl:hidden">{links.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)} aria-current={active===href?"page":undefined} className={"rounded-md px-3 py-3 "+(active===href?"bg-blue-50 font-bold text-blue-700":"text-slate-800 hover:bg-slate-50")}>{label}</Link>)}<Link href="/setup" onClick={()=>setOpen(false)} className="rounded-md bg-blue-700 px-3 py-3 text-center font-semibold text-white">Set up workspace</Link></nav>}
 </header>;
}
export function PublicFooter(){
 return <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-slate-600 sm:text-sm lg:w-[88%] lg:px-0"><span>© {new Date().getFullYear()} MinuteSeal</span><nav aria-label="Footer navigation" className="flex flex-wrap gap-x-4 gap-y-2">{links.slice(1).map(([href,label])=><Link key={href} href={href} className="hover:text-blue-700">{label}</Link>)}<Link href="/join-meeting">Join a meeting</Link><Link href="/login">Sign in</Link></nav></div></footer>;
}
