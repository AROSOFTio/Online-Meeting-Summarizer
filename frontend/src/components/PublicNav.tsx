import Link from "next/link";

const links=[["/","Home"],["/features","Features"],["/solutions","Solutions"],["/how-it-works","How it works"],["/templates","Templates"]] as const;
export default function PublicNav({active}: {active:string}) {
 return <header className="border-b border-slate-200 bg-white">
  <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 xl:w-[88%] xl:px-0">
   <Link href="/" className="flex shrink-0 items-center gap-2.5"><img src="/minuteseal.svg" alt="" className="size-10"/><div><span className="block text-2xl font-bold leading-none tracking-tight text-slate-950">Minute<span className="text-blue-700">Seal</span></span><span className="mt-1 block text-[10px] font-medium text-slate-600">Meetings · Minutes · Decisions</span></div></Link>
   <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-3 text-sm font-medium text-slate-700 xl:order-none xl:w-auto">{links.map(([href,label])=><Link key={href} href={href} aria-current={active===href?"page":undefined} className={active===href?"font-bold text-blue-700":"hover:text-blue-700"}>{label}</Link>)}</nav>
   <div className="flex flex-wrap items-center gap-2"><Link href="/login" className="rounded-md border border-blue-700 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Sign in</Link><Link href="/setup" className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Set up workspace</Link></div>
  </div>
 </header>;
}

export function PublicFooter(){
 return <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-slate-600 lg:w-[88%] lg:px-0"><span>© {new Date().getFullYear()} MinuteSeal</span><nav aria-label="Footer navigation" className="flex flex-wrap gap-4">{links.slice(1).map(([href,label])=><Link key={href} href={href} className="hover:text-blue-700">{label}</Link>)}<Link href="/join-meeting">Join a meeting</Link><Link href="/login">Sign in</Link></nav></div></footer>;
}
