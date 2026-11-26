"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
export default function SetupPage(){
  const [email,setEmail]=useState("");
  const [code,setCode]=useState("");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();if(password!==confirmation){setMessage("Passwords do not match.");return;}setBusy(true);setMessage("");try{await apiRequest("/api/auth/setup",{method:"POST",body:JSON.stringify({email:email.trim().toLowerCase(),code:code.trim(),password})});setCode("");setPassword("");setConfirmation("");setDone(true);}catch(err){setMessage(err instanceof Error?err.message:"Setup could not be completed.");}finally{setBusy(false);}}
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-xl border bg-white p-7 shadow-sm"><p className="text-sm font-bold text-blue-700">CONVENECORE</p><h1 className="mt-3 text-2xl font-bold">Set up your workspace</h1>{done?<div className="mt-5 space-y-4"><p role="status">Your administrator password has been set. Sign in to configure your organization and invite your team.</p><Link className="block rounded-lg bg-blue-700 p-3 text-center font-semibold text-white" href="/login">Sign in</Link></div>:<form onSubmit={submit} className="mt-5 space-y-4"><p className="text-sm text-slate-600">Use the single-use setup code sent to your verified administrator email.</p>{message&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}{[["Administrator email",email,setEmail,"email",254],["Setup code",code,setCode,"password",43],["New password",password,setPassword,"password",128],["Confirm password",confirmation,setConfirmation,"password",128]].map(([label,value,setter,type,max])=><label key={String(label)} className="block text-sm font-medium">{String(label)}<input required type={String(type)} maxLength={Number(max)} value={String(value)} onChange={e=>(setter as (v:string)=>void)(e.target.value)} autoComplete={label==="Administrator email"?"email":label==="Setup code"?"off":"new-password"} className="mt-1 block w-full rounded-lg border p-3"/></label>)}<p className="text-xs text-slate-500">12–128 characters, uppercase, lowercase and a special character.</p><button disabled={busy} className="w-full rounded-lg bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">{busy?"Setting password…":"Set administrator password"}</button><Link href="/login" className="block text-center text-sm text-blue-700">Already activated? Sign in</Link></form>}</section></main>;
}
