"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Calendar, CheckCircle2, Clock3, Home, Radio, ShieldCheck } from "lucide-react";

import { apiRequest } from "@/lib/api";

interface Invitation {
  code: string;
  meeting_id: number;
  meeting_title: string;
  meeting_date: string;
  description: string;
  invited_email: string | null;
  invitation_status: string;
  lifecycle: "scheduled" | "live" | "ended";
  started_at: string | null;
  ended_at: string | null;
  requires_name: boolean;
  known_name: string | null;
  school_name: string;
}

const pad = (value: number) => value.toString().padStart(2, "0");

export default function PublicMeetingRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = String(params?.code || "").toUpperCase();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [present, setPresent] = useState(false);
  const enteringRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const data = await apiRequest(`/api/meetings/public/invitations/${code}`) as Invitation;
      setInvitation(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Meeting room unavailable");
    }
  }, [code]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), 2000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [refresh]);

  useEffect(() => {
    if (!invitation || invitation.lifecycle !== "live" || enteringRef.current || present) return;
    const savedName = invitation.requires_name ? localStorage.getItem(`meeting-name:${code}`)?.trim() : undefined;
    if (invitation.requires_name && !savedName) {
      router.replace(`/join/${code}`);
      return;
    }
    enteringRef.current = true;
    apiRequest(`/api/meetings/public/invitations/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ full_name: savedName || null }),
    })
      .then(() => setPresent(true))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not register attendance"))
      .finally(() => { enteringRef.current = false; });
  }, [code, invitation, present, router]);

  const countdown = useMemo(() => {
    if (!invitation) return null;
    const remaining = Math.max(0, new Date(invitation.meeting_date).getTime() - now);
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { remaining, days, hours, minutes, seconds };
  }, [invitation, now]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-6 py-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/settings/logo" alt="Starlight Secondary School" className="mx-auto h-auto max-h-28 w-auto max-w-[230px] object-contain" />
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Meeting Waiting Room</p>
        </header>

        <div className="p-6 sm:p-8">
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {!error && !invitation && <div className="py-12 text-center text-sm text-slate-500">Opening meeting room...</div>}

          {invitation && (
            <div className="space-y-6">
              <section className="rounded-xl bg-slate-50 p-5">
                <h1 className="text-2xl font-extrabold text-slate-950">{invitation.meeting_title}</h1>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Calendar size={16} />{new Date(invitation.meeting_date).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}</div>
                {invitation.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{invitation.description}</p>}
              </section>

              {invitation.lifecycle === "scheduled" && countdown && (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                  <Clock3 className="mx-auto text-blue-700" size={40}/>
                  {countdown.remaining > 0 ? <>
                    <h2 className="mt-3 text-lg font-extrabold text-slate-950">Meeting starts in</h2>
                    <div className="mt-5 grid grid-cols-4 gap-2">
                      {[[countdown.days, "Days"], [countdown.hours, "Hours"], [countdown.minutes, "Minutes"], [countdown.seconds, "Seconds"]].map(([value, label]) => <div key={String(label)} className="rounded-xl bg-white p-3 shadow-sm"><div className="font-mono text-2xl font-extrabold text-blue-800">{pad(Number(value))}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div></div>)}
                    </div>
                    <p className="mt-4 text-xs leading-5 text-slate-600">You are ready. This page will keep checking for the organiser automatically.</p>
                  </> : <>
                    <h2 className="mt-3 text-lg font-extrabold text-slate-950">Scheduled time reached</h2>
                    <p className="mt-2 text-sm text-slate-600">Waiting for the organiser to start the meeting. You do not need to refresh this page.</p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-blue-700"><span className="h-2 w-2 animate-pulse rounded-full bg-blue-600"/>Waiting for host</div>
                  </>}
                </section>
              )}

              {invitation.lifecycle === "live" && (
                <section className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                  {present ? <CheckCircle2 className="mx-auto text-green-600" size={46}/> : <Radio className="mx-auto animate-pulse text-green-600" size={46}/>} 
                  <h2 className="mt-3 text-2xl font-extrabold text-slate-950">Meeting is live</h2>
                  <p className="mt-2 text-sm text-slate-600">{present ? "You have been marked present automatically." : "Registering your presence…"}</p>
                </section>
              )}

              {invitation.lifecycle === "ended" && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                  <ShieldCheck className="mx-auto text-slate-500" size={42}/>
                  <h2 className="mt-3 text-xl font-extrabold text-slate-950">Meeting has ended</h2>
                  <p className="mt-2 text-sm text-slate-600">The organiser has closed this meeting.</p>
                </section>
              )}

              <Link href="/" className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-700"><Home size={14} />Return to Starlight Meetings</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
