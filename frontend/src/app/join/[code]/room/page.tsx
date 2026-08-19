"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Calendar, CheckCircle2, DoorOpen, Home, ShieldCheck } from "lucide-react";

import { apiRequest } from "@/lib/api";

interface Invitation {
  code: string;
  meeting_id: number;
  meeting_title: string;
  meeting_date: string;
  description: string;
  invited_email: string | null;
  status: string;
  school_name: string;
}

export default function PublicMeetingRoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code || "").toUpperCase();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    apiRequest(`/api/meetings/public/invitations/${code}`)
      .then((data: Invitation) => setInvitation(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Meeting room unavailable"));
  }, [code]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-6 py-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/settings/logo" alt="Starlight Secondary School" className="mx-auto h-auto max-h-28 w-auto max-w-[230px] object-contain" />
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Meeting Room</p>
        </header>

        <div className="p-6 sm:p-8">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          {!error && !invitation && <div className="py-12 text-center text-sm text-slate-500">Opening meeting room...</div>}

          {invitation && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
                <CheckCircle2 className="mx-auto text-green-600" size={46} />
                <h1 className="mt-3 text-2xl font-extrabold text-slate-950">You are in the meeting</h1>
                <p className="mt-2 text-sm text-slate-600">Your attendance is confirmed. No staff account or password is required.</p>
              </div>

              <section className="rounded-xl bg-slate-50 p-5">
                <h2 className="text-xl font-extrabold text-slate-950">{invitation.meeting_title}</h2>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Calendar size={16} />{new Date(invitation.meeting_date).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}</div>
                {invitation.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{invitation.description}</p>}
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <DoorOpen className="text-blue-700" size={20} />
                  <h3 className="mt-2 text-sm font-bold text-slate-900">Stay on this page</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">The organizer controls the meeting recording and minutes. You have already joined successfully.</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <ShieldCheck className="text-slate-600" size={20} />
                  <h3 className="mt-2 text-sm font-bold text-slate-900">Nothing else to configure</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">There are no extra login steps, setup screens or meeting codes after this point.</p>
                </div>
              </section>

              <Link href="/" className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-700"><Home size={14} />Return to Starlight Meetings</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
