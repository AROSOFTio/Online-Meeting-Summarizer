import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import PageHero from "./PageHero";

export default function AuthShell({children}: {children:ReactNode}) {
  return <main className="flex min-h-svh flex-col bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
      <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-950"><img src="/minuteseal.svg" alt="" className="size-8"/><span className="text-xl">Minute<span className="text-blue-700">Seal</span></span></Link>
      <Link href="/" className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-blue-700"><ArrowLeft size={16}/> Back to home</Link>
    </div></header>
    <div className="flex flex-1 items-center justify-center px-4 py-6 md:py-10">
      <section className="grid w-full max-w-[1040px] overflow-hidden rounded-lg border border-slate-200 bg-white md:grid-cols-[0.93fr_1.07fr]">
        <div className="md:hidden"><PageHero title="Meeting records done right." compact heading="p"/></div>
        <aside data-page-hero="true" className="relative isolate hidden min-h-[390px] flex-col justify-center overflow-hidden bg-[#123d91] p-9 text-white md:flex lg:p-12">
          <img src="/meeting.webp" alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover"/>
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#103a91]/85"/>
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.15em] text-blue-100">Every decision matters</p>
          <h2 className="max-w-sm text-3xl font-bold leading-tight lg:text-4xl">Meeting records done right.</h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-blue-50">Capture discussions, keep decisions on record and follow up on agreed actions.</p>
          <div className="mt-7 space-y-3 text-sm font-medium">{["Structured meeting minutes","Action points and decisions","Organization workspaces"].map(item=><p key={item} className="flex items-center gap-3"><CheckCircle2 size={18} className="shrink-0 text-blue-100"/>{item}</p>)}</div>
        </aside>
        <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:px-10 lg:py-8">{children}</div>
      </section>
    </div>
    <footer className="pb-5 text-center text-xs text-slate-600">MinuteSeal · Meetings, minutes and decisions</footer>
  </main>;
}
