import type {ReactNode} from "react";
export default function PageHero({title,description,eyebrow,compact=false,home=false,heading="h1",image="/meeting.webp",children}: {title:string;description?:string;eyebrow?:string;compact?:boolean;home?:boolean;heading?:"h1"|"h2"|"p";image?:string;children?:ReactNode}) {
 const Heading=heading;
 return <section data-page-hero="true" aria-labelledby={home?"homepage-hero-title":undefined} className={"ms-public-hero"+(home?" ms-hero-home":compact?" ms-hero-compact":"")}>
  <img src={image} alt="" aria-hidden="true" fetchPriority={home?"high":undefined} className="ms-hero-image"/>
  <div aria-hidden="true" className="ms-hero-overlay"/>
  <div className="ms-hero-content">
    {eyebrow&&<p className="ms-hero-eyebrow">{eyebrow}</p>}
    <Heading id={home?"homepage-hero-title":undefined} className="ms-hero-title">{title}</Heading>
    {description&&<p className="ms-hero-description">{description}</p>}
    {children}
  </div>
 </section>;
}
