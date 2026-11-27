"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import AuthShell from "@/components/AuthShell";
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
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const valid = password.length >= 8 && password.length <= 128 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const input = "mt-1 block w-full rounded-md border border-slate-500 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  async function requestCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setMessage("Enter your administrator email first."); return; }
    setSending(true); setMessage(""); setNotice("");
    try {
      const result = await apiRequest("/api/auth/setup/request-code",{method:"POST",body:JSON.stringify({email:email.trim().toLowerCase()})});
      setNotice(typeof result?.detail === "string" ? result.detail : "Check your inbox for a verification code.");
    } catch(err) { setMessage(err instanceof Error ? err.message : "Could not request a verification code."); }
    finally { setSending(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!/^(?:[0-9]{6}|[A-Za-z0-9_-]{43})$/.test(code.trim())) { setMessage("Enter your six-digit email verification code or existing invitation code."); return; }
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
  return <AuthShell image="/images/heroes/setup.webp" heroTitle="Create your password" active="/setup" wide>
    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Create your password</h1>
    {done ? <div className="mt-4 space-y-4"><p role="status" className="text-sm text-slate-700">Your administrator password has been set.</p><Link href="/login" className="block rounded-md bg-blue-700 p-3 text-center text-sm font-semibold text-white">Sign in</Link></div> :
      <>
        <p className="mt-1 text-sm leading-6 text-slate-600">Verify your email and choose a password.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          {message && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{message}</p>}
          <label htmlFor="setup-email" className="block text-sm font-medium text-slate-800">Administrator email</label>
          <div className="!mt-1 flex flex-col gap-2 sm:flex-row sm:items-start"><input id="setup-email" required type="email" maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);setCode("");setNotice("");}} autoComplete="email" placeholder="name@organization.com" className={input+" !mt-0 min-w-0 flex-1"}/><button type="button" onClick={requestCode} disabled={sending||busy} className="shrink-0 rounded-md border border-blue-700 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{sending?"Sending…":"Send code"}</button></div>
          {notice && <p role="status" className="rounded border border-blue-200 bg-blue-50 p-2 text-xs leading-5 text-slate-800">{notice}</p>}
          <label className="block text-sm font-medium text-slate-800">Email verification code<input required type="text" maxLength={43} value={code} onChange={e=>setCode(e.target.value)} autoComplete="one-time-code" spellCheck={false} placeholder="Enter six-digit code" className={input}/></label>
          <p className="!mt-1 text-xs leading-5 text-slate-600">Code expires after 10 minutes. Check your inbox and spam folder.</p>
          <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="new-password" className="block text-sm font-medium text-slate-800">New password</label><div className="relative"><input id="new-password" required type={showPassword?"text":"password"} minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" aria-describedby="password-rules" className={input+" pr-12"}/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Hide passwords":"Show passwords"} aria-pressed={showPassword} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-700">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><p id="password-rules" className="mt-1 text-xs leading-5 text-slate-600">At least 8 characters, uppercase, lowercase and a special character.</p></div>
          <label className="block text-sm font-medium text-slate-800">Confirm password<input required type={showPassword?"text":"password"} minLength={8} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="new-password" className={input}/></label></div>
          {confirmation && <p className={"text-xs "+(password===confirmation?"text-green-800":"text-red-800")}>{password===confirmation?"Passwords match.":"Passwords do not match."}</p>}
          <button disabled={busy} className="w-full rounded-md bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{busy?"Setting password…":"Set administrator password"}</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">Already registered? <Link href="/login" className="font-semibold text-blue-700">Sign in</Link></p>
      </>}
  <p className="mt-3 text-center text-sm text-slate-600">New organization? <a href="/register/" className="font-semibold text-blue-700">Register</a></p>
    </AuthShell>;
}
