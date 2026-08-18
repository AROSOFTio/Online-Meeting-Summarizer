"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, CheckCircle, UserCheck } from "lucide-react";

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

const roles = [
  "Member", "Staff", "Support Staff", "Secretary", "Chairperson",
  "Vice Chairperson", "Headteacher", "Treasurer", "Other",
];

export default function PublicJoinPage() {
  const params = useParams<{ code: string }>();
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
  const [confirmed, setConfirmed] = useState(false);

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
      setConfirmed(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not register attendance.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b-4 border-blue-800 bg-white px-6 py-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Starlight Secondary School" className="mx-auto h-28 w-28 object-contain" />
          <h1 className="mt-2 text-xl font-extrabold text-blue-900">STARLIGHT SECONDARY SCHOOL</h1>
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-700">RISE AND SHINE</p>
        </div>

        <div className="p-6 sm:p-8">
          {loading && <div className="py-12 text-center text-sm text-slate-500">Loading invitation...</div>}
          {loadError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><b>Invitation unavailable.</b><br />{loadError}<p className="mt-2 text-xs">Ask the meeting organizer for a newly generated link.</p></div>}

          {invitation && !confirmed && (
            <>
              <div className="mb-6 rounded-xl bg-blue-50 p-4">
                <h2 className="text-lg font-bold text-slate-900">{invitation.meeting_title}</h2>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Calendar size={15} />{new Date(invitation.meeting_date).toLocaleDateString(undefined, { dateStyle: "long" })}</div>
                {invitation.description && <p className="mt-3 text-sm leading-6 text-slate-600">{invitation.description}</p>}
              </div>

              <div className="mb-4 flex items-center gap-2"><UserCheck className="text-blue-700" size={20} /><h3 className="font-bold text-slate-900">Register your attendance</h3></div>
              <form onSubmit={submit} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">Full name *
                  <input required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900" placeholder="Your full name" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Email {invitation.invited_email ? "" : "(optional)"}
                  <input type="email" required={Boolean(invitation.invited_email)} readOnly={Boolean(invitation.invited_email)} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 read-only:bg-slate-100" placeholder="name@example.com" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Title / position *
                  <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900">
                    {roles.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                {role === "Other" && <label className="block text-sm font-medium text-slate-700">Specify title / position *
                  <input required value={otherRole} onChange={(event) => setOtherRole(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900" placeholder="e.g. PTA Representative" />
                </label>}
                {submitError && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
                <button disabled={submitting} className="w-full rounded-lg bg-blue-800 px-4 py-3 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-50">{submitting ? "Registering..." : "Confirm Attendance"}</button>
              </form>
            </>
          )}

          {confirmed && invitation && <div className="py-8 text-center"><CheckCircle className="mx-auto mb-3 text-green-600" size={52} /><h2 className="text-xl font-bold text-slate-900">Attendance confirmed</h2><p className="mt-2 text-sm text-slate-600">Thank you, {fullName}. You have been registered for <b>{invitation.meeting_title}</b>.</p><p className="mt-5 text-xs text-slate-400">You may now close this page.</p></div>}
        </div>
      </div>
    </main>
  );
}
