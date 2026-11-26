import type {Metadata} from "next";
import Link from "next/link";
import {Mic, FileText, ListChecks, Layers, Download, ShieldCheck, ArrowRight} from "lucide-react";
import PageHero from "@/components/PageHero";
import PublicNav,{PublicFooter} from "@/components/PublicNav";
export const metadata:Metadata={title:"Features | MinuteSeal",description:"Explore MinuteSeal meeting capture, structured minutes, decision and action tracking, custom formats and exports."};
const items=[
 {icon:Mic,title:"Record meetings",description:"Record or upload audio."},
 {icon:FileText,title:"Draft minutes",description:"Review and edit drafts."},
 {icon:ListChecks,title:"Track actions",description:"Assign tasks and deadlines."},
 {icon:Layers,title:"Use templates",description:"Choose or customize formats."},
 {icon:Download,title:"Export minutes",description:"Download PDF or Word."},
 {icon:ShieldCheck,title:"Manage access",description:"Manage staff and records."}
];
export default function FeaturesPage(){return <main className="min-h-screen bg-white text-slate-900"><PublicNav active="/features"/><PageHero image="/images/heroes/features.webp" title="Meeting features" description="Record, review and follow up."><Link href="/templates" className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-blue-800">Explore templates <ArrowRight size={17}/></Link></PageHero><section className="mx-auto max-w-7xl px-4 py-7 sm:py-10"><h2 className="text-2xl font-bold">Core capabilities</h2><div data-feature-grid="true" className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">{items.map(({icon:Icon,title,description})=><article key={title} className="min-w-0 rounded-md border border-slate-200 bg-white p-3 sm:p-4"><Icon size={28} className="text-blue-700"/><h3 className="mt-2 text-sm font-semibold sm:text-base">{title}</h3><p className="mt-1 text-xs leading-5 sm:text-sm text-slate-600">{description}</p></article>)}</div><Link href="/how-it-works" className="mt-5 inline-flex items-center gap-2 font-semibold text-blue-700">See the meeting workflow <ArrowRight size={17}/></Link></section><PublicFooter/></main>;}
