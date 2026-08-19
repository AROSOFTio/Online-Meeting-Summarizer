"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Copy, MessageCircle, Play, Users } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";

interface InviteResult {
  meeting_id: number;
  general_link: string;
  smtp_configured: boolean;
  invitations: Array<{ email: string; link: string; email_sent: boolean; delivery_error?: string | null }>;
}

const parseEmails = (value: string) => Array.from(new Set(value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean)));
const localNow = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function CreateMeetingPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateTime, setDateTime] = useState(localNow());
  const [emails, setEmails] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const createMeeting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const meeting = await apiRequest("/api/meetings/", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: description.trim(), date: new Date(dateTime).toISOString(), participants: [] }),
      });
      const invitation = await apiRequest(`/api/meetings/${meeting.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ emails: parseEmails(emails), send_email: true }),
      }) as InviteResult;
      setResult(invitation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the meeting.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.general_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const whatsappUrl = result ? `https://wa.me/?text=${encodeURIComponent(`You are invited to ${title}. Join here: ${result.general_link}`)}` : "#";

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-2xl font-extrabold text-slate-950">New Meeting</h1>
          <p className="mt-1 text-sm text-slate-500">Create it once. Then start it now or share the invite for later.</p>
        </header>

        {!result ? (
          <form onSubmit={createMeeting} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="block text-sm font-semibold text-slate-700">Meeting name
              <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} autoFocus className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="e.g. Staff General Meeting" />
            </label>

            <label className="block text-sm font-semibold text-slate-700">Date & time
              <div className="relative mt-1"><CalendarClock className="absolute left-3 top-3 text-slate-400" size={18} /><input type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} required className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-slate-900" /></div>
            </label>

            <label className="block text-sm font-semibold text-slate-700">Agenda / notes <span className="font-normal text-slate-400">(optional)</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900" placeholder="What is this meeting about?" />
            </label>

            <label className="block text-sm font-semibold text-slate-700">Invite by email <span className="font-normal text-slate-400">(optional)</span>
              <textarea value={emails} onChange={(event) => setEmails(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900" placeholder={"person1@example.com\nperson2@example.com"} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Leave this blank if you only want a WhatsApp/share link.</span>
            </label>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <button disabled={submitting} type="submit" className="w-full rounded-lg bg-blue-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-50">{submitting ? "Creating meeting..." : "Create Meeting"}</button>
          </form>
        ) : (
          <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-center">
              <Check className="mx-auto rounded-full bg-green-50 p-2 text-green-600" size={48} />
              <h2 className="mt-3 text-2xl font-extrabold text-slate-950">Meeting ready</h2>
              <p className="mt-1 text-sm text-slate-500">{title}</p>
            </div>

            <button onClick={() => router.push(`/meetings/${result.meeting_id}/live`)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-4 text-base font-extrabold text-white shadow-sm hover:bg-blue-800"><Play size={20} fill="currentColor" />Start Meeting Now</button>
            <p className="-mt-3 text-center text-xs text-slate-400">If the meeting is for later, just close this page. A Start Meeting button will remain under Meetings.</p>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-950"><Users size={16} />Invite link</div>
              <div className="flex flex-col gap-2 sm:flex-row"><input readOnly value={result.general_link} className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-xs text-slate-700" /><button onClick={copyLink} className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-800"><Copy size={14} />{copied ? "Copied" : "Copy"}</button></div>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700"><MessageCircle size={17} />Share on WhatsApp</a>
            </div>

            {result.invitations.length > 0 && <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-900">Email invitations</h3><div className="mt-3 space-y-2">{result.invitations.map((invite) => <div key={invite.email} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span className="min-w-0 truncate text-xs font-medium text-slate-700">{invite.email}</span><span className={`shrink-0 text-xs font-bold ${invite.email_sent ? "text-green-600" : "text-amber-700"}`}>{invite.email_sent ? "Sent" : "Link ready"}</span></div>)}</div></div>}

            {!result.smtp_configured && result.invitations.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Email delivery is not configured, but the invite links are ready and can still be shared.</div>}

            <div className="grid gap-3 sm:grid-cols-2"><button onClick={() => router.push(`/meetings/${result.meeting_id}`)} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">View Meeting</button><button onClick={() => router.push("/meetings")} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">All Meetings</button></div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
