import type {ReactNode} from "react";
import PageHero from "./PageHero";
import PublicNav,{PublicFooter} from "./PublicNav";
export default function AuthShell({children,image="/meeting.webp",heroTitle="MinuteSeal",active="",wide=false}: {children:ReactNode;image?:string;heroTitle?:string;active?:string;wide?:boolean}) {
 return <main className="ms-page ms-auth-page">
   <PublicNav active={active}/>
   <PageHero image={image} title={heroTitle} compact heading="p"/>
   <div className="ms-public-content ms-auth-content">
    <section className="ms-auth-split">
      <aside className="ms-auth-visual" aria-hidden="true"><img src={image} alt=""/><div><img className="ms-auth-logo" src="/minuteseal.svg" alt=""/><h2>Meetings made simple.</h2><p>Minutes, decisions and follow-up.</p></div></aside>
      <div className={"ms-auth-form"+(wide?" ms-auth-form-wide":"")}>{children}</div>
    </section>
   </div>
   <PublicFooter/>
 </main>;
}
