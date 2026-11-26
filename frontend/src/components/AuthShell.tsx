import type { ReactNode } from "react";
import PageHero from "./PageHero";
import PublicNav,{PublicFooter} from "./PublicNav";
export default function AuthShell({children,image="/meeting.webp",heroTitle="Your workspace",active="",wide=false}: {children:ReactNode;image?:string;heroTitle?:string;active?:string;wide?:boolean}) {
 return <main className="ms-page">
   <PublicNav active={active}/>
   <PageHero image={image} title={heroTitle} compact heading="p"/>
   <div className="ms-public-content flex flex-1 items-start justify-center py-5 sm:py-8">
     <section className={"w-full min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-7 "+(wide?"max-w-[680px]":"max-w-[490px]")}>{children}</section>
   </div>
   <PublicFooter/>
 </main>;
}
