"use client";
import PageHero from "@/components/PageHero";
import PublicNav,{PublicFooter} from "@/components/PublicNav";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Calendar, Clock3, Radio, ShieldCheck } from "lucide-react";

import LiveAudioRoom from "@/components/LiveAudioRoom";
import { apiRequest } from "@/lib/api";

interface Invitation {
  code: string;
  meeting_id: number;
  meeting_title: string;
  meeting_date: string;
  description: string;
  lifecycle: "scheduled" | "live" | "ended";
  requires_name: boolean;
  known_name: string | null;
}

export default function PublicMeetingRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = String(params?.code || "").toUpperCase();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const data = (await apiRequest(`/api/meetings/public/invitations/${code}`)) as Invitation;
      setInvitation(data);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Meeting room unavailable");
    }
  }, [code]);

  useEffect(() => {
    const firstRefresh = window.setTimeout(() => void refresh(), 0);
    const firstClock = window.setTimeout(() => setNow(Date.now()), 0);
    const poll = window.setInterval(() => void refresh(), 2000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(firstRefresh);
      window.clearTimeout(firstClock);
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const savedName = useMemo(() => {
    if (typeof window === "undefined" || !code) return "";
    return localStorage.getItem(`meeting-name:${code}`)?.trim() || "";
  }, [code]);

  useEffect(() => {
    if (invitation?.lifecycle === "live" && invitation.requires_name && !savedName) {
      router.replace(`/join/${code}`);
    }
  }, [code, invitation, router, savedName]);

  const remainingSeconds = invitation && now !== null
    ? Math.max(0, Math.floor((new Date(invitation.meeting_date).getTime() - now) / 1000))
    : 0;
  const displayName = invitation?.known_name || savedName || "Guest";

  return (
    <main className="ms-page">
      <PublicNav active=""/>
      {invitation?.lifecycle!=="live"&&<PageHero image="/images/heroes/room.webp" title="Meeting room" eyebrow="MinuteSeal" compact heading="p"/>}
      <div className="mx-auto w-full max-w-[1680px] flex-1 px-2 py-3 sm:px-5">
      <div className={"mx-auto w-full space-y-3 "+(invitation?.lifecycle==="live"?"":"max-w-3xl")}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          

          <div className="p-6 sm:p-8">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
            )}
            {!invitation && !error && (
              <div className="py-12 text-center text-sm text-slate-600">Opening meeting room...</div>
            )}

            {invitation && (
              <div className="space-y-5">
                <div className="rounded-xl bg-slate-50 p-5">
                  <h1 className="text-2xl font-extrabold text-slate-950">{invitation.meeting_title}</h1>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                    <Calendar size={16} />
                    {new Date(invitation.meeting_date).toLocaleString(undefined, {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </div>
                  {invitation.description && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {invitation.description}
                    </p>
                  )}
                </div>

                {invitation.lifecycle === "scheduled" && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
                    <Clock3 className="mx-auto text-blue-700" size={38} />
                    <h2 className="mt-3 text-lg font-extrabold text-slate-950">
                      {remainingSeconds > 0 ? "Waiting for scheduled time" : "Waiting for organiser"}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      {remainingSeconds > 0
                        ? `Starts in about ${Math.ceil(remainingSeconds / 60)} minute(s).`
                        : "The scheduled time has arrived. The room opens when the organiser starts the meeting."}
                    </p>
                    <p className="mt-2 text-xs text-slate-600">This page updates automatically.</p>
                  </div>
                )}



                {invitation.lifecycle === "ended" && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                    <ShieldCheck className="mx-auto text-slate-600" size={40} />
                    <h2 className="mt-3 text-xl font-extrabold text-slate-950">Meeting has ended</h2>
                    <p className="mt-2 text-sm text-slate-600">The organiser has closed this meeting.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {invitation?.lifecycle === "live" && (!invitation.requires_name || savedName) && (
          <LiveAudioRoom
            meetingId={invitation.meeting_id}
            displayName={displayName}
            inviteCode={code}
            autoJoin={false}
          />
        )}
      </div>
      </div>
      <PublicFooter/>
    </main>
  );
}
