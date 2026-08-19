"use client";

import React, { useEffect, useState } from "react";
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
  status: string;
  school_name: string;
}

const roles = ["Member", "Staff", "Support Staff", "Secretary", "Chairperson", "Vice Chairperson", "Headteacher", "Treasurer", "Other"];

export default function PublicJoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = String(params?.code || "").toUpperCase();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Member");
  const [otherRole, setOtherRole] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let active = true;
    apiRequest(`/api/meetings/public/invitations/${code}`)
      .then((data: Invitation) => {
        if (!active) return;
        setInvitation(data);
        if (data.invited_email) setEmail(data.invited_email);
      })
      .catch((error) => active && setLoadError(error instanceof Error ? error.message : "Invitation not found"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [code]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invitation) return;
    const title = role === "Other" ? otherRole.trim() : role;
    if (!title) {
      setSubmitError("Please enter your title or position.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiRequest(`/api/meetings/public/invitations/${code}/join`, {
        method: "POST",
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim() || null, role_title: title }),
      });
      router.push(`/join/${code}/room`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not join the meeting.");
      setSubmitting(false);
    }
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
          {loading && <div className="py-12 text-center text-sm text-slate-500">Opening invitation...</div>}
          {loadError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><b>Invitation unavailable.</b><br />{loadError}</div>}

          {invitation && (
            <>
              <div className="mb-6 rounded-xl bg-blue-50 p-4">
                <h2 className="text-xl font-extrabold text-slate-950">{invitation.meeting_title}</h2>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Calendar size={16} />{new Date(invitation.meeting_date).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}</div>
                {invitation.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{invitation.description}</p>}
              </div>

              <div className="mb-4 flex items-center gap-2"><UserCheck className="text-blue-700" size={20} /><h3 className="font-bold text-slate-900">Confirm once, then enter the meeting</h3></div>
              <form onSubmit={submit} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">Full name
                  <input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900" placeholder="Your full name" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Email {invitation.invited_email ? "" : "(optional)"}
                  <input type="email" required={Boolean(invitation.invited_email)} readOnly={Boolean(invitation.invited_email)} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 read-only:bg-slate-100" placeholder="name@example.com" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Title / position
                  <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900">{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                </label>
                {role === "Other" && <label className="block text-sm font-medium text-slate-700">Specify title / position
                  <input required value={otherRole} onChange={(event) => setOtherRole(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900" placeholder="e.g. PTA Representative" />
                </label>}
                {submitError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
                <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"><DoorOpen size={18} />{submitting ? "Joining..." : "Confirm & Enter Meeting"}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
