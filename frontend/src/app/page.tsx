import type {Metadata} from "next";
import Link from "next/link";
import PublicNav,{PublicFooter} from "@/components/PublicNav";
import {ArrowRight,Mic,FileText,ListChecks,Layers,Download,Users,Building2,GraduationCap,Landmark,HeartPulse,ArrowUpRight,Check} from "lucide-react";
export const metadata:Metadata={title:"MinuteSeal | Meeting minutes and decisions",description:"Record meetings, prepare minutes and track actions."};
const features=[
 {icon:Mic,title:"Record meetings",text:"Capture or upload audio.",href:"/login",tag:"01"},
 {icon:FileText,title:"Draft minutes",text:"Review structured minutes.",href:"/login",tag:"02"},
 {icon:ListChecks,title:"Track actions",text:"Assign tasks and follow up.",href:"/login",tag:"03"},
 {icon:Layers,title:"Use templates",text:"Start with a ready format.",href:"/templates",tag:"04"},
 {icon:Download,title:"Export minutes",text:"Download PDF or Word.",href:"/login",tag:"05"},
 {icon:Users,title:"Join meetings",text:"Open your invitation.",href:"/join-meeting",tag:"06"}
];
const steps=[{icon:Mic,title:"Capture",text:"Record or upload your meeting."},{icon:FileText,title:"Review",text:"Prepare and approve the minutes."},{icon:ListChecks,title:"Act",text:"Assign responsibilities and follow up."}];
const sectors=[{icon:Building2,title:"Companies"},{icon:GraduationCap,title:"Education"},{icon:Landmark,title:"Government"},{icon:Users,title:"NGOs"},{icon:HeartPulse,title:"Healthcare"}];
const content="mx-auto w-[92%] max-w-[1280px] md:w-[85%] xl:w-[82%]";
export default function Home(){return <main className="bg-white text-slate-900">
 <PublicNav active="/"/>
 <section aria-labelledby="homepage-hero-title" className="relative isolate w-full overflow-hidden bg-[#103a91] text-white">
  <img src="/meeting.webp" alt="" aria-hidden="true" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_44%]"/>
  <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#103a91]/85"/>
  <div className="mx-auto flex min-h-[250px] max-w-[1440px] flex-col justify-center px-4 py-8 sm:min-h-[320px] sm:px-8 lg:min-h-[390px] lg:w-[88%] lg:px-0 lg:py-12">
   <h1 id="homepage-hero-title" className="max-w-[680px] text-[clamp(1.8rem,4vw,3.4rem)] font-bold leading-[1.12] tracking-tight text-white">Meetings. Minutes. Actions.</h1>
   <p className="mt-3 max-w-[520px] text-sm leading-6 text-blue-50 sm:text-lg">Record meetings, prepare minutes and track decisions.</p>
   <div className="mt-5 flex flex-wrap gap-2.5"><Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-50">Sign in <ArrowRight size={16}/></Link><Link href="/templates" className="rounded-md border border-white px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Templates</Link></div>
  </div>
 </section>
 <div data-home-content="true" className={content+" space-y-10 py-8 sm:space-y-14 sm:py-12 lg:space-y-16 lg:py-16"}>
  <section aria-labelledby="home-features">
   <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
    <div><p className="text-[11px] font-bold uppercase tracking-[0.17em] text-blue-700">Your workspace</p><h2 id="home-features" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Everything in one place.</h2></div>
    <Link href="/features" className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:border-blue-500 sm:text-sm">All features <ArrowRight size={15}/></Link>
   </div>
   <div data-feature-grid="true" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4">
    {features.map(({icon:Icon,title,text,href,tag},i)=><Link key={title} href={href} className={"group flex min-w-0 flex-col rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-blue-500 hover:bg-blue-50 sm:p-5 lg:p-6 "+(i===0||i===4?"bg-[#f4f7fc]":"bg-white")}>
     <div className="flex items-start justify-between gap-2"><span className={"flex size-10 shrink-0 items-center justify-center rounded-md sm:size-12 "+(i===0?"bg-[#103a91] text-white":"bg-blue-50 text-blue-700")}><Icon size={22} strokeWidth={1.8}/></span><span aria-hidden="true" className="text-[11px] font-semibold tabular-nums text-slate-400">{tag}</span></div>
     <h3 className="mt-4 text-sm font-bold leading-snug sm:text-lg">{title}</h3>
     <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">{text}</p>
     <span className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-[11px] font-semibold text-blue-700 sm:text-xs">Open <ArrowUpRight size={15}/></span>
    </Link>)}
   </div>
  </section>
  <section aria-labelledby="home-workflow" className="grid overflow-hidden rounded-xl border border-slate-200 bg-[#f6f8fc] md:grid-cols-[0.88fr_1.12fr]">
   <div className="relative min-h-[160px] overflow-hidden bg-[#103a91] sm:min-h-[220px] md:min-h-full">
    <img src="/images/heroes/workflow.webp" alt="Colleagues working together in a meeting" className="absolute inset-0 h-full w-full object-cover"/>
    <div className="absolute inset-0 bg-[#103a91]/45"/>
    <div className="relative flex h-full min-h-[160px] flex-col justify-end p-5 text-white sm:min-h-[220px] sm:p-7 md:min-h-[340px]"><span className="w-fit rounded-sm bg-[#103a91] px-2.5 py-1.5 text-xs font-semibold">From discussion to action</span></div>
   </div>
   <div className="p-5 sm:p-7 lg:p-9">
    <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-blue-700">Simple workflow</p><h2 id="home-workflow" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Make meetings count.</h2>
    <ol className="mt-5 divide-y divide-slate-200">{steps.map(({icon:Icon,title,text},i)=><li key={title} className="flex items-center gap-3 py-3 first:pt-0 sm:gap-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-sm font-bold text-blue-700">{i+1}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold sm:text-base">{title}</h3><p className="mt-0.5 text-xs text-slate-600 sm:text-sm">{text}</p></div><Icon size={21} className="shrink-0 text-blue-700"/></li>)}</ol>
    <Link href="/how-it-works" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700">See how it works <ArrowRight size={16}/></Link>
   </div>
  </section>
  <section aria-labelledby="home-solutions">
   <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7"><div><p className="text-[11px] font-bold uppercase tracking-[0.17em] text-blue-700">For every team</p><h2 id="home-solutions" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Built for your organization.</h2></div><Link href="/solutions" className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:border-blue-500 sm:text-sm">Solutions <ArrowRight size={15}/></Link></div>
   <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">{sectors.map(({icon:Icon,title},i)=><Link key={title} href="/solutions" className={"group flex min-w-0 flex-col items-center justify-center gap-3 bg-white px-3 py-5 text-center hover:bg-blue-50 sm:py-7 "+(i===4?"col-span-2 sm:col-span-1":"")}><span className="flex size-11 items-center justify-center rounded-full bg-[#eff4fc] text-blue-700"><Icon size={24} strokeWidth={1.7}/></span><span className="text-xs font-semibold sm:text-sm">{title}</span></Link>)}</div>
  </section>
  <section aria-labelledby="home-start" className="flex flex-col gap-4 rounded-lg border border-blue-100 bg-[#eff4fc] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
   <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#103a91] text-white"><Check size={22}/></span><div><h2 id="home-start" className="text-base font-bold sm:text-xl">Already invited to a meeting?</h2><p className="mt-1 text-sm text-slate-600">Join with your meeting code.</p></div></div><Link href="/join-meeting" className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md bg-[#103a91] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Join meeting <ArrowRight size={16}/></Link>
  </section>
 </div>
 <PublicFooter/>
 </main>;}
