"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Users } from "lucide-react";

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
  const [logoFailed, setLogoFailed] = useState(false);

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

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg className="login-wave login-wave-top absolute -left-[12%] top-[5%] h-[38%] w-[125%] text-blue-700/10" viewBox="0 0 1440 320" fill="none" preserveAspectRatio="none">
          <path d="M-70 210 C170 50 310 300 570 155 S1000 45 1510 170" stroke="currentColor" strokeWidth="2" />
          <path d="M-70 238 C170 78 310 328 570 183 S1000 73 1510 198" stroke="currentColor" strokeWidth="1.5" />
          <path d="M-70 267 C170 107 310 357 570 212 S1000 102 1510 227" stroke="currentColor" strokeWidth="1" />
        </svg>
        <svg className="login-wave login-wave-bottom absolute -right-[14%] bottom-[2%] h-[42%] w-[130%] text-sky-700/10" viewBox="0 0 1440 320" fill="none" preserveAspectRatio="none">
          <path d="M-70 140 C230 310 470 5 760 165 S1130 300 1510 95" stroke="currentColor" strokeWidth="2" />
          <path d="M-70 170 C230 340 470 35 760 195 S1130 330 1510 125" stroke="currentColor" strokeWidth="1.5" />
          <path d="M-70 200 C230 370 470 65 760 225 S1130 360 1510 155" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white/95 p-7 shadow-[0_16px_50px_rgba(15,23,42,0.07)] sm:p-8">
        <div className="mb-7 text-center">
          {!logoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/settings/logo?v=official" alt="Starlight Secondary School" onError={() => setLogoFailed(true)} className="mx-auto mb-4 h-28 w-28 object-contain" />
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-800 text-xl font-black tracking-tight text-white shadow-sm">SS</div>
          )}
          <h1 className="text-xl font-extrabold text-slate-950">STARLIGHT SECONDARY SCHOOL</h1>
          <p className="mt-1 text-sm text-slate-500">Meeting Summarizer</p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Email Address
            <input type="email" autoComplete="username" {...register("email")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="name@starlightsecondaryschool.com" />
            {errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span>}
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input type="password" autoComplete="current-password" {...register("password")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="••••••••" />
            {errors.password && <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>}
          </label>
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-blue-700 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{isSubmitting ? "Signing in..." : "Sign In"}</button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" /></div>
        <Link href="/join-meeting" className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 hover:bg-blue-100"><Users size={17} />Join an Invited Meeting</Link>
        <p className="mt-2 text-center text-xs text-slate-400">Invitees do not need a staff login.</p>
      </div>
    </main>
  );
}
