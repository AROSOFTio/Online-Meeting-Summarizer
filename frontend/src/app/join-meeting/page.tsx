"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Users } from "lucide-react";

export default function JoinMeetingPage() {
  const router = useRouter();
  const [value, setValue] = useState("");

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
          <img src="/api/settings/logo" alt="Starlight Secondary School" className="mx-auto mb-4 h-auto max-h-32 w-auto max-w-[220px] object-contain" />
          <h1 className="text-xl font-extrabold text-slate-950">Join Meeting</h1>
          <p className="mt-1 text-sm text-slate-500">Paste your invitation link or enter the code from the invitation.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Meeting link or code
            <input value={value} onChange={(event) => setValue(event.target.value)} autoCapitalize="characters" autoFocus className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="Example: ABCD1234" />
          </label>
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800"><Users size={17} />Continue <ArrowRight size={17} /></button>
        </form>

        <Link href="/login" className="mt-5 flex items-center justify-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft size={13} />Back to staff sign in</Link>
      </div>
    </main>
  );
}
