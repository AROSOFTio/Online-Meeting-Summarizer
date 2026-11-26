"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Users, Eye, EyeOff } from "lucide-react";
import AuthShell from "@/components/AuthShell";

import { useAuth } from "@/context/AuthContext";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(data.email.trim().toLowerCase(), data.password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <AuthShell>
    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Sign in to MinuteSeal</h1>
    <p className="mt-1 text-sm text-slate-600">Access your organization workspace.</p>
    {error && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-3">
      <label className="block text-sm font-medium text-slate-800">Email address<input type="email" autoComplete="username" {...register("email")} placeholder="name@organization.com" className="mt-1 w-full rounded-md border border-slate-500 bg-white px-3 py-2.5 text-sm text-slate-900"/></label>
      {errors.email && <p className="text-xs text-red-700">{errors.email.message}</p>}
      <div><label htmlFor="login-password" className="block text-sm font-medium text-slate-800">Password</label><div className="relative mt-1"><input id="login-password" type={showPassword?"text":"password"} autoComplete="current-password" {...register("password")} className="w-full rounded-md border border-slate-500 bg-white px-3 py-2.5 pr-12 text-sm text-slate-900"/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Hide password":"Show password"} aria-pressed={showPassword} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-700">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{errors.password && <p className="mt-1 text-xs text-red-700">{errors.password.message}</p>}</div>
      <button type="submit" disabled={isSubmitting} className="w-full rounded-md bg-blue-700 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{isSubmitting?"Signing in…":"Sign in"}</button>
    </form>
    <p className="mt-4 text-center text-sm text-slate-600">First time here? <Link href="/setup" className="font-semibold text-blue-700">Set up workspace</Link></p>
    <div className="mt-4 border-t border-slate-200 pt-4"><Link href="/join-meeting" className="flex items-center justify-center gap-2 rounded-md border border-blue-700 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"><Users size={17}/>Join an invited meeting</Link><p className="mt-2 text-center text-xs text-slate-600">Invitees do not need a staff login.</p></div>
  </AuthShell>;
}
