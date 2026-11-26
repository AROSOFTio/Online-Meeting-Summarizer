import type {Metadata} from "next";
import Link from "next/link";
import {Building2, GraduationCap, Landmark, Users, HeartPulse, ArrowRight} from "lucide-react";
import PageHero from "@/components/PageHero";
import PublicNav,{PublicFooter} from "@/components/PublicNav";
export const metadata:Metadata={title:"Solutions | MinuteSeal",description:"Meeting documentation for companies, education, public institutions, nonprofit and health organizations."};
const sectors=[
 {icon:Building2,title:"Companies",text:"Management and project meetings.",examples:"Track assigned actions, decisions and project follow-up."},
 {icon:GraduationCap,title:"Education",text:"Board and staff meetings.",examples:"Use consistent formats for board and staff meeting records."},
 {icon:Landmark,title:"Public institutions",text:"Committees and resolutions.",examples:"Prepare structured records of discussions and agreed decisions."},
 {icon:Users,title:"NGOs",text:"Projects and governance.",examples:"Document responsibilities and follow-up across teams."},
 {icon:HeartPulse,title:"Healthcare",text:"Operations meetings.",examples:"Organize nonclinical meeting records and team responsibilities."}
];
export default function SolutionsPage(){return <main className="min-h-screen bg-white text-slate-900"><PublicNav active="/solutions"/><PageHero image="/images/heroes/solutions.webp" title="Meeting solutions" description="Choose a format for your organization."/><section className="mx-auto max-w-7xl px-4 py-7 sm:py-10"><h2 className="text-2xl font-bold">Organization types</h2><div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">{sectors.map(({icon:Icon,title,text})=><article key={title} className="min-w-0 rounded-md border border-slate-200 p-3 sm:p-4"><Icon size={28} className="text-blue-700"/><h3 className="mt-2 text-sm font-semibold sm:text-base">{title}</h3><p className="mt-1 text-xs leading-5 sm:text-sm text-slate-600">{text}</p></article>)}</div><Link href="/templates" className="mt-8 inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-3 text-sm font-bold text-white">Browse meeting formats <ArrowRight size={17}/></Link></section><PublicFooter/></main>;}
