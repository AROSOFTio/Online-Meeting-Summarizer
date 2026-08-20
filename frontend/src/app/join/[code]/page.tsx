"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Calendar, DoorOpen, UserCheck } from "lucide-react";

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
  requires_name: boolean;
  known_name: string | null;
  known_position: string | null;
  known_group: string | null;
  school_name: string;
}

export default function PublicJoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = String(params?.code || "").toUpperCase();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autoAttempted, setAutoAttempted] = useState(false);

  useEffect(() => {
    if (!code) return;
    let active = true;
    apiRequest(`/api/meetings/public/invitations/${code}`)
      .then((data: Invitation) => active && setInvitation(data))
      .catch((error) => active && setLoadError(error instanceof Error ? error.message : "Invitation not found"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [code]);

  const enterMeeting = useCallback(async (name?: string) => {
    if (!code) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiRequest(`/api/meetings/public/invitations/${code}/join`, {
        method: "POST",
        body: JSON.stringify({ full_name: name?.trim() || null }),
      });
      if (name?.trim()) localStorage.setItem(`meeting-name:${code}`, name.trim());
      router.replace(`/join/${code}/room`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not open the meeting.");
      setSubmitting(false);
    }
  }, [code, router]);

  useEffect(() => {
    if (!invitation || autoAttempted || invitation.lifecycle === "ended") return;
    if (!invitation.requires_name) {
      setAutoAttempted(true);
      void enterMeeting();
      return;
    }
    const savedName = localStorage.getItem(`meeting-name:${code}`)?.trim();
    if (savedName) {
      setAutoAttempted(true);
      setFullName(savedName);
      void enterMeeting(savedName);
    }
  }, [autoAttempted, code, enterMeeting, invitation]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) return;
    await enterMeeting(fullName);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-6 py-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/settings/logo" alt="Starlight Secondary School" className="mx-auto h-auto max-h-32 w-auto max-w-[240px] object-contain" />
          <h1 className="mt-3 text-lg font-extrabold text-blue-950">STARLIGHT SECONDARY SCHOOL</h1>
        </header>

        <div className="p-6 sm:p-8">
          {loading && <div className="py-12 text-center text-sm text-slate-500">Opening meeting link...</div>}
          {loadError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><b>Meeting link unavailable.</b><br />{loadError}</div>}

          {invitation && (
            <>
              <div className="mb-6 rounded-xl bg-blue-50 p-4">
                <h2 className="text-xl font-extrabold text-slate-950">{invitation.meeting_title}</h2>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Calendar size={16} />{new Date(invitation.meeting_date).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}</div>
                {invitation.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{invitation.description}</p>}
              </div>

              {invitation.lifecycle === "ended" ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-600"><b>This meeting has ended.</b><div className="mt-1 text-xs">The join link is no longer active.</div></div> : !invitation.requires_name ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center">
                  <UserCheck className="mx-auto text-blue-700" size={34}/>
                  <h3 className="mt-2 font-extrabold text-slate-900">Welcome, {invitation.known_name}</h3>
                  <p className="mt-1 text-xs text-slate-600">Your personal link identified you automatically. Opening the waiting room…</p>
                  {submitting && <div className="mt-3 text-xs font-semibold text-blue-700">Connecting…</div>}
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-2"><UserCheck className="text-blue-700" size={20} /><h3 className="font-bold text-slate-900">Enter your full name once</h3></div>
                  <p className="mb-4 text-xs leading-5 text-slate-500">You are not in the staff directory, so we only need your full name. There is no accept/decline step and no email or position form.</p>
                  <form onSubmit={submit} className="space-y-4">
                    <label className="block text-sm font-medium text-slate-700">Full name
                      <input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900" placeholder="Your full name" />
                    </label>
                    {submitError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
                    <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"><DoorOpen size={18} />{submitting ? "Opening..." : "Continue to Meeting"}</button>
                  </form>
                </>
              )}

              {submitError && !invitation.requires_name && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
