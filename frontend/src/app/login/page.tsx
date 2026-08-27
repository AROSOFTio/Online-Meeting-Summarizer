"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";
import { Users } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
interface PublicBranding { product_name:string; product_logo_url:string; organization_name:string; organization_logo_url:string; organization_motto:string; }

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const brandingQuery = useQuery<PublicBranding>({queryKey:["public-branding"],queryFn:()=>apiRequest("/api/settings/branding"),staleTime:5*60*1000});
  const branding = brandingQuery.data || {product_name:"ConveneCore",product_logo_url:"/convenecore-logo.svg",organization_name:"Organization",organization_logo_url:"/api/settings/logo",organization_motto:""};

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.product_logo_url} alt={branding.product_name} className="mx-auto mb-5 h-16 w-auto max-w-[260px] object-contain" />
          <div className="mx-auto mb-3 flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={branding.organization_logo_url} alt={branding.organization_name} className="h-12 w-12 rounded bg-white object-contain" />
            <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Organization workspace</div><div className="max-w-[230px] truncate text-sm font-extrabold text-slate-900">{branding.organization_name}</div>{branding.organization_motto&&<div className="max-w-[230px] truncate text-xs text-slate-500">{branding.organization_motto}</div>}</div>
          </div>
          <p className="text-sm font-medium text-slate-600">Meeting intelligence, professional minutes and action management.</p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Email Address
            <input type="email" autoComplete="username" {...register("email")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="name@organization.org" />
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
        <p className="mt-3 text-center text-[11px] text-slate-400">Powered by {branding.product_name}</p>
      </div>
    </main>
  );
}
