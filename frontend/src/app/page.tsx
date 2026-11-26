import type {Metadata} from "next";
import Link from "next/link";
import PublicNav,{PublicFooter} from "@/components/PublicNav";
import {ArrowRight,Mic,FileText,ListChecks,Layers,Download,Users,Building2,GraduationCap,Landmark,HeartPulse} from "lucide-react";
export const metadata:Metadata={title:"MinuteSeal | Meeting minutes and decisions",description:"Record meetings, prepare minutes and track actions."};
const features=[{icon:Mic,title:"Record meetings",text:"Record or upload audio.",href:"/login"},{icon:FileText,title:"Draft minutes",text:"Review structured minutes.",href:"/login"},{icon:ListChecks,title:"Track actions",text:"Assign and follow up.",href:"/login"},{icon:Layers,title:"Use templates",text:"Choose a meeting format.",href:"/templates"},{icon:Download,title:"Export minutes",text:"PDF and Word.",href:"/login"},{icon:Users,title:"Join meetings",text:"Use your invitation.",href:"/join-meeting"}];
const sectors=[{icon:Building2,title:"Companies"},{icon:GraduationCap,title:"Education"},{icon:Landmark,title:"Government"},{icon:Users,title:"NGOs"},{icon:HeartPulse,title:"Healthcare"}];
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
 <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:w-[88%] lg:px-0 lg:py-12">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Features</h2><Link href="/features" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 sm:text-sm">View all <ArrowRight size={15}/></Link></div>
  <div data-feature-grid="true" className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">{features.map(({icon:Icon,title,text,href})=><Link key={title} href={href} className="group flex min-w-0 flex-col rounded-md border border-slate-200 p-3 hover:border-blue-500 hover:bg-blue-50 sm:p-4"><Icon size={23} className="text-blue-700"/><h3 className="mt-2 text-sm font-semibold leading-snug sm:text-base">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">{text}</p><ArrowRight size={15} className="mt-2 self-end text-blue-700"/></Link>)}</div>
 </section>
 <section className="border-y border-slate-200 bg-slate-50"><div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:w-[88%] lg:px-0"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">How it works</h2><Link href="/how-it-works" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 sm:text-sm">View workflow <ArrowRight size={15}/></Link></div><div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">{[{icon:Mic,title:"Record"},{icon:FileText,title:"Review"},{icon:ListChecks,title:"Follow up"}].map(({icon:Icon,title},i)=><article key={title} className="flex flex-col items-start gap-2 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:p-4"><Icon size={21} className="shrink-0 text-blue-700"/><h3 className="text-xs font-semibold sm:text-base">{i+1}. {title}</h3></article>)}</div></div></section>
 <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:w-[88%] lg:px-0 lg:py-12"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold sm:text-2xl">Solutions</h2><Link href="/solutions" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 sm:text-sm">View all <ArrowRight size={15}/></Link></div><div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">{sectors.map(({icon:Icon,title})=><Link href="/solutions" key={title} className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 p-3 hover:bg-blue-50 sm:p-4"><Icon size={21} className="shrink-0 text-blue-700"/><h3 className="text-sm font-semibold">{title}</h3></Link>)}</div></section>
 <PublicFooter/>
 </main>;}
