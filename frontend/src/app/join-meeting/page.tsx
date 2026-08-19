"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Users } from "lucide-react";

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
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/starlight-logo.jpg" alt="Starlight Secondary School" className="mx-auto mb-3 h-28 w-28 object-contain" />
          <h1 className="text-xl font-bold text-slate-900">Join a Starlight Meeting</h1>
          <p className="mt-1 text-sm text-slate-500">Paste the invitation link or enter the meeting code.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Invitation link or code
            <input value={value} onChange={(event) => setValue(event.target.value)} autoCapitalize="characters" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900" placeholder="e.g. MHOM5Q or https://.../join/MHOM5Q" />
          </label>
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800"><Users size={17} />Continue <ArrowRight size={17} /></button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-400">STARLIGHT S.S · RISE AND SHINE</p>
      </div>
    </main>
  );
}
