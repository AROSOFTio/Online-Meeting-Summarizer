import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, CheckCircle2, ShieldCheck, Mic, ListChecks, Layers, Download, CalendarDays, Building2, GraduationCap, Landmark, HeartPulse, Users } from "lucide-react";

export const metadata:Metadata={title:"MinuteSeal | Meeting minutes and decisions",description:"Capture meetings, prepare structured minutes and track agreed actions in one organization workspace."};
const features=[
 {icon:Mic,title:"Record or upload",description:"Capture a meeting or upload an existing recording."},
 {icon:FileText,title:"Structured minutes",description:"Prepare formal minutes from meeting discussions using AI-assisted workflows."},
 {icon:ListChecks,title:"Actions and decisions",description:"Keep track of decisions, assigned responsibilities and follow-up."},
 {icon:Layers,title:"Meeting templates",description:"Choose a format for your sector or build a custom minutes template."},
 {icon:Download,title:"Export documents",description:"Review finalized minutes and export them in PDF or Word."},
 {icon:ShieldCheck,title:"Organization workspaces",description:"Keep your team's records and account access organized."}
];
const sectors=[{icon:Building2,title:"Corporate teams",text:"Management, operations and project meetings."},{icon:GraduationCap,title:"Education",text:"Academic, administrative and board meetings."},{icon:Landmark,title:"Public institutions",text:"Committee meetings, proceedings and resolutions."},{icon:Users,title:"NGOs and associations",text:"Project reviews, governance and action tracking."},{icon:HeartPulse,title:"Health organizations",text:"Administrative and operational team meetings."}];
export default function Home(){
 return <main className="bg-white text-slate-900">
  <header className="border-b border-slate-200 bg-white">
   <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:w-[88%] lg:px-0">
    <Link href="/" className="flex shrink-0 items-center gap-2.5"><img src="/minuteseal.svg" alt="" className="size-10"/><div><span className="block text-2xl font-bold leading-none tracking-tight text-slate-950">Minute<span className="text-blue-700">Seal</span></span><span className="mt-1 block text-[10px] font-medium text-slate-600">Meetings · Minutes · Decisions</span></div></Link>
    <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-slate-700 md:order-none md:w-auto"><Link href="/" aria-current="page" className="text-blue-700">Home</Link><a href="#features" className="hover:text-blue-700">Features</a><a href="#solutions" className="hover:text-blue-700">Solutions</a><Link href="/templates" className="hover:text-blue-700">Templates</Link></nav>
    <div className="flex flex-wrap items-center gap-2"><Link href="/login" className="rounded-md border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Sign in</Link><Link href="/setup" className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Set up workspace</Link></div>
   </div>
  </header>
  <section aria-labelledby="homepage-hero-title" className="relative isolate w-full overflow-hidden bg-[#103a91] text-white">
   <img src="/meeting.webp" alt="" aria-hidden="true" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_44%]"/>
   <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#103a91]/85"/>
   <div className="mx-auto flex min-h-[420px] max-w-[1440px] flex-col justify-center px-5 py-12 sm:px-8 lg:min-h-[490px] lg:w-[88%] lg:px-0 lg:py-16">
    <div className="max-w-[760px]">
     <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-blue-100">Meeting documentation, simplified</p>
     <h1 id="homepage-hero-title" className="max-w-[720px] text-[clamp(2.25rem,4vw,3.6rem)] font-bold leading-[1.12] tracking-tight text-white">Professional meeting minutes, decisions and follow-up.</h1>
     <p className="mt-5 max-w-[600px] text-base leading-7 text-white/95 lg:text-lg">Capture discussions, prepare structured minutes and track agreed actions in one organized workspace.</p>
     <div className="mt-7 flex flex-wrap items-center gap-3"><Link href="/templates" className="inline-flex items-center gap-3 rounded-md bg-white px-5 py-3 text-sm font-bold text-blue-800 hover:bg-blue-50">Explore templates <ArrowRight size={18}/></Link><Link href="/login" className="rounded-md border border-white px-6 py-3 text-sm font-bold text-white hover:bg-white/10">Sign in</Link></div>
     <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-white">{[{icon:FileText,label:"AI-assisted minutes"},{icon:CheckCircle2,label:"Action tracking"},{icon:ShieldCheck,label:"Organized records"}].map(({icon:Icon,label})=><span key={label} className="flex items-center gap-2"><Icon size={19} className="text-blue-100"/>{label}</span>)}</div>
    </div>
   </div>
  </section>
  <section id="features" className="mx-auto max-w-[1440px] scroll-mt-8 px-5 py-14 lg:w-[88%] lg:px-0 lg:py-20">
   <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Core features</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Everything you need after a meeting.</h2>
   <div className="mt-8 grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">{features.map(({icon:Icon,title,description})=><article key={title} className="bg-white p-6"><Icon size={26} className="text-blue-700"/><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></article>)}</div>
  </section>
  <section className="border-y border-slate-200 bg-slate-50"><div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-12 lg:w-[88%] lg:grid-cols-[0.8fr_1.2fr] lg:px-0"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">How it works</p><h2 className="mt-3 text-3xl font-bold">From meeting to action.</h2></div><div className="grid gap-5 sm:grid-cols-3">{[{icon:Mic,title:"01. Capture",text:"Record a discussion or upload audio."},{icon:FileText,title:"02. Prepare",text:"Generate and review structured minutes."},{icon:CalendarDays,title:"03. Follow up",text:"Finalize, export and track actions."}].map(({icon:Icon,title,text})=><article key={title}><Icon size={24} className="text-blue-700"/><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div></div></section>
  <section id="solutions" className="mx-auto max-w-[1440px] scroll-mt-8 px-5 py-14 lg:w-[88%] lg:px-0 lg:py-20"><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Solutions</p><h2 className="mt-3 text-3xl font-bold">Built for different organizations.</h2><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{sectors.map(({icon:Icon,title,text})=><article key={title} className="rounded-md border border-slate-200 p-5"><Icon size={25} className="text-blue-700"/><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div></section>
  <section className="relative isolate overflow-hidden bg-[#123d91] text-white"><img src="/meeting.webp" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-10"/><div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-6 px-5 py-12 lg:w-[88%] lg:flex-row lg:items-center lg:px-0"><div><h2 className="text-2xl font-bold sm:text-3xl">Ready to organize your meeting records?</h2><p className="mt-2 text-sm leading-6 text-blue-50">Explore meeting formats, or activate your approved workspace.</p></div><div className="flex flex-wrap gap-3"><Link href="/templates" className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-blue-800">Explore templates</Link><Link href="/setup" className="rounded-md border border-white px-5 py-3 text-sm font-semibold text-white">Workspace setup</Link></div></div></section>
  <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-slate-600 lg:w-[88%] lg:px-0"><span>© {new Date().getFullYear()} MinuteSeal</span><div className="flex flex-wrap gap-5"><Link href="/templates">Meeting templates</Link><Link href="/join-meeting">Join a meeting</Link><Link href="/login">Sign in</Link></div></footer>
 </main>;
}
