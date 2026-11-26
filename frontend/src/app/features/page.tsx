import type {Metadata} from "next";
import Link from "next/link";
import {Mic, FileText, ListChecks, Layers, Download, ShieldCheck, ArrowRight} from "lucide-react";
import PageHero from "@/components/PageHero";
import PublicNav,{PublicFooter} from "@/components/PublicNav";
export const metadata:Metadata={title:"Features | MinuteSeal",description:"Explore MinuteSeal meeting capture, structured minutes, decision and action tracking, custom formats and exports."};
const items=[
 {icon:Mic,title:"Meeting capture",description:"Create a meeting, record a discussion or upload audio for processing. Keep the meeting record together with its supporting material."},
 {icon:FileText,title:"Structured meeting minutes",description:"Use AI-assisted drafting when AI services are configured. Review the generated content and edit it before finalizing."},
 {icon:ListChecks,title:"Decisions and action tracking",description:"Document agreed decisions, assign responsibilities and review outstanding actions."},
 {icon:Layers,title:"Reusable meeting formats",description:"Browse blank meeting formats for different organizations or customize the structure in the format builder."},
 {icon:Download,title:"Document exports",description:"Export reviewed meeting minutes to PDF or Word for filing and distribution."},
 {icon:ShieldCheck,title:"Organization workspace",description:"Manage staff access and organize meeting records within your own workspace."}
];
export default function FeaturesPage(){return <main className="min-h-screen bg-white text-slate-900"><PublicNav active="/features"/><PageHero eyebrow="Features" title="Everything you need for professional meeting records." description="From capturing discussions to tracking agreed actions, MinuteSeal brings the meeting documentation workflow into one workspace."><Link href="/templates" className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-blue-800">Explore templates <ArrowRight size={17}/></Link></PageHero><section className="mx-auto max-w-7xl px-5 py-12"><h2 className="text-2xl font-bold">Core capabilities</h2><div className="mt-6 grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">{items.map(({icon:Icon,title,description})=><article key={title} className="bg-white p-6"><Icon size={28} className="text-blue-700"/><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></article>)}</div><Link href="/how-it-works" className="mt-8 inline-flex items-center gap-2 font-semibold text-blue-700">See the meeting workflow <ArrowRight size={17}/></Link></section><PublicFooter/></main>;}
