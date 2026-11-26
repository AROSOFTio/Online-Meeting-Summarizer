import type {Metadata} from "next";
import Link from "next/link";
import {Building2, GraduationCap, Landmark, Users, HeartPulse, ArrowRight} from "lucide-react";
import PageHero from "@/components/PageHero";
import PublicNav,{PublicFooter} from "@/components/PublicNav";
export const metadata:Metadata={title:"Solutions | MinuteSeal",description:"Meeting documentation for companies, education, public institutions, nonprofit and health organizations."};
const sectors=[
 {icon:Building2,title:"Companies and corporate teams",text:"Management meetings, project reviews and operational decisions.",examples:"Track assigned actions, decisions and project follow-up."},
 {icon:GraduationCap,title:"Schools and universities",text:"Academic meetings, committees and administration.",examples:"Use consistent formats for board and staff meeting records."},
 {icon:Landmark,title:"Public institutions",text:"Committee proceedings, administrative meetings and resolutions.",examples:"Prepare structured records of discussions and agreed decisions."},
 {icon:Users,title:"NGOs and associations",text:"Project reviews, governance and coordination meetings.",examples:"Document responsibilities and follow-up across teams."},
 {icon:HeartPulse,title:"Health organizations",text:"Administrative and operational meetings.",examples:"Organize nonclinical meeting records and team responsibilities."}
];
export default function SolutionsPage(){return <main className="min-h-screen bg-white text-slate-900"><PublicNav active="/solutions"/><PageHero image="/images/heroes/solutions.webp" eyebrow="Solutions" title="Meeting records for every kind of organization." description="Adapt your meeting documentation to your team’s needs with reusable templates and an organized workspace."/><section className="mx-auto max-w-7xl px-5 py-12"><h2 className="text-2xl font-bold">Find your organization type</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sectors.map(({icon:Icon,title,text,examples})=><article key={title} className="rounded-md border border-slate-200 p-6"><Icon size={28} className="text-blue-700"/><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p><p className="mt-4 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-700">{examples}</p></article>)}</div><Link href="/templates" className="mt-8 inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-3 text-sm font-bold text-white">Browse meeting formats <ArrowRight size={17}/></Link></section><PublicFooter/></main>;}
