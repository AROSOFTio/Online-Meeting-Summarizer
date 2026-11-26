import type {ReactNode} from "react";

export default function PageHero({title,description,eyebrow,compact=false,heading="h1",image="/meeting.webp",children}: {title:string;description?:string;eyebrow?:string;compact?:boolean;heading?:"h1"|"h2"|"p";image?:string;children?:ReactNode}) {
 const Heading=heading;
 return <section data-page-hero="true" className="relative isolate w-full overflow-hidden bg-[#103a91] text-white">
  <img src={image} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-[center_44%]"/>
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[#103a91]/85"/>
  <div className={compact?"relative mx-auto max-w-7xl px-5 py-4 sm:px-6 sm:py-5":"relative mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9"}>
    {eyebrow&&<p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-blue-100">{eyebrow}</p>}
    <Heading className={compact?"text-xl font-bold leading-tight text-white sm:text-2xl":"max-w-3xl text-2xl font-bold leading-tight tracking-tight text-white sm:text-4xl"}>{title}</Heading>
    {description&&<p className="mt-2 max-w-2xl text-sm leading-5 text-blue-50">{description}</p>}
    {children}
  </div>
 </section>;
}
