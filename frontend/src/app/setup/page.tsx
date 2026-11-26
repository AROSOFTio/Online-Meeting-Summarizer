"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, Info } from "lucide-react";
import { apiRequest } from "@/lib/api";

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const valid = password.length >= 8 && password.length <= 128 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const input = "mt-2 block w-full rounded-lg border border-slate-500 bg-white p-3 text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!/^[A-Za-z0-9_-]{43}$/.test(code.trim())) { setMessage("Enter the complete setup code from your administrator invitation."); return; }
    if (!valid) { setMessage("Use 8–128 characters, uppercase, lowercase and a special character."); return; }
    if (password !== confirmation) { setMessage("Passwords do not match."); return; }
    setBusy(true);
    try {
      await apiRequest("/api/auth/setup", {method:"POST", body:JSON.stringify({email:email.trim().toLowerCase(),code:code.trim(),password})});
      setCode(""); setPassword(""); setConfirmation(""); setDone(true);
    } catch(err) {
      setMessage(err instanceof Error ? err.message : "Setup could not be completed.");
    } finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900">
    <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3"><img src="/minuteseal.svg" alt="" className="h-10 w-10 rounded-lg"/><p className="text-sm font-bold tracking-wide text-blue-700">MINUTESEAL</p></div>
      <h1 className="mt-4 text-2xl font-bold text-slate-950">Set up your workspace</h1>
      {done ? <div className="mt-5 space-y-4"><p role="status" className="text-slate-700">Your administrator password has been set. Sign in to configure your organization.</p><Link href="/login" className="block rounded-lg bg-blue-700 p-3 text-center font-semibold text-white">Sign in</Link></div> :
        <form onSubmit={submit} className="mt-5 space-y-4">
          <p className="text-sm leading-6 text-slate-700">Already invited? Enter the administrator email and setup code from your invitation, then choose your password.</p>
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-5 text-slate-800"><Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700"/><p><strong>Where is my setup code?</strong> Your platform administrator issues this one-time code after workspace approval. It expires after one hour. If you have not received it, contact your platform administrator for a fresh invitation.</p></div>
          {message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
          <label className="block text-sm font-medium text-slate-800">Administrator email<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="name@organization.com" className={input}/></label>
          <label className="block text-sm font-medium text-slate-800">Setup code<input required type="password" maxLength={43} value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste your invitation code" className={input}/></label>
          <div><label htmlFor="new-password" className="block text-sm font-medium text-slate-800">New password</label><div className="relative"><input id="new-password" required type={showPassword?"text":"password"} minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" aria-describedby="password-rules" className={input+" pr-14"}/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Hide passwords":"Show passwords"} aria-pressed={showPassword} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-700 hover:bg-slate-100">{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div><p id="password-rules" className="mt-2 text-xs leading-5 text-slate-600">At least 8 characters, uppercase, lowercase and a special character. A longer unique password is recommended.</p></div>
          <label className="block text-sm font-medium text-slate-800">Confirm password<input required type={showPassword?"text":"password"} minLength={8} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="new-password" className={input}/></label>
          {confirmation && <p className={"text-xs "+(password===confirmation?"text-green-800":"text-red-800")}>{password===confirmation?"Passwords match.":"Passwords do not match."}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-blue-700 p-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy?"Setting password…":"Set administrator password"}</button>
          <Link href="/login" className="block text-center text-sm font-medium text-blue-700">Already activated? Sign in</Link>
        </form>}
    </section>
  </main>;
}
