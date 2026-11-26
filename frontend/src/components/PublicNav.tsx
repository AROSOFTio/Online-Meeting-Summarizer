const links=[["/","Home"],["/features","Features"],["/solutions","Solutions"],["/how-it-works","How it works"],["/templates","Templates"]] as const;
export default function PublicNav({active}: {active:string}) {
 return <header className="ms-header">
  <div className="ms-shell-inner ms-header-row">
   <a href="/" className="ms-brand"><img src="/minuteseal.svg" alt="" width="40" height="40"/><span>Minute<b>Seal</b></span></a>
   <nav aria-label="Main navigation" className="ms-primary-nav">{links.map(([href,label])=><a key={href} href={href} aria-current={active===href?"page":undefined}>{label}</a>)}</nav>
   <div className="ms-header-actions"><a href="/login" className="ms-button ms-button-outline">Sign in</a><a href="/register/" className="ms-button ms-register-desktop">Register organization</a>
    <details className="ms-mobile-menu"><summary className="ms-menu-toggle" aria-label="Toggle navigation"><svg className="ms-menu-open-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><svg className="ms-menu-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></summary><button type="button" className="ms-menu-backdrop" aria-label="Close navigation" tabIndex={-1}/><nav className="ms-mobile-links" aria-label="Mobile navigation"><div className="ms-drawer-brand"><img src="/minuteseal.svg" alt=""/><span>Minute<b>Seal</b></span></div>{links.map(([href,label])=><a key={href} href={href} aria-current={active===href?"page":undefined}>{label}</a>)}<a href="/register/" className="ms-button">Register organization</a><a href="/setup" className="ms-drawer-secondary">Activate workspace</a></nav></details>
   </div>
  </div>
 </header>;
}
export function PublicFooter(){
 return <footer className="ms-footer"><div className="ms-shell-inner ms-footer-row"><span>© {new Date().getFullYear()} MinuteSeal</span><nav className="ms-footer-nav" aria-label="Footer navigation">{links.slice(1).map(([href,label])=><a key={href} href={href}>{label}</a>)}<a href="/register/">Register organization</a><a href="/join-meeting">Join a meeting</a><a href="/login">Sign in</a></nav></div></footer>;
}
