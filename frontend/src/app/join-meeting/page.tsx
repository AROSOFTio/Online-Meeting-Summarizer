"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Users } from "lucide-react";

import { apiRequest } from "@/lib/api";

interface PublicBranding { product_name:string; product_logo_url:string; organization_name:string; organization_logo_url:string; organization_motto:string; }

export default function JoinMeetingPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const brandingQuery = useQuery<PublicBranding>({queryKey:["public-branding"],queryFn:()=>apiRequest("/api/settings/branding"),staleTime:5*60*1000});
  const branding = brandingQuery.data || {product_name:"ConveneCore",product_logo_url:"/convenecore-logo.svg",organization_name:"Organization",organization_logo_url:"/api/settings/logo",organization_motto:""};

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    const match = raw.match(/\/join\/([A-Za-z0-9]+)/i);
    const code = (match?.[1] || raw).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (code) router.push(`/join/${code}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.organization_logo_url} alt={branding.organization_name} className="mx-auto mb-3 h-auto max-h-24 w-auto max-w-[200px] object-contain" />
          <div className="text-sm font-extrabold text-slate-950">{branding.organization_name}</div>
          {branding.organization_motto&&<div className="mt-0.5 text-xs text-slate-500">{branding.organization_motto}</div>}
          <h1 className="mt-5 text-xl font-extrabold text-slate-950">Join Meeting</h1>
          <p className="mt-1 text-sm text-slate-500">Paste your invitation link or enter the code from the invitation.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Meeting link or code
            <input value={value} onChange={(event) => setValue(event.target.value)} autoCapitalize="characters" autoFocus className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="Example: ABCD1234" />
          </label>
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800"><Users size={17} />Continue <ArrowRight size={17} /></button>
        </form>

        <Link href="/login" className="mt-5 flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft size={13} />Back to staff sign in</Link>
        <p className="mt-3 text-center text-[11px] text-slate-400">Powered by {branding.product_name}</p>
      </div>
    </main>
  );
}
