"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, Copy, Mail, MessageCircle, Users } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";

interface InviteResult {
  meeting_id: number;
  general_link: string;
  smtp_configured: boolean;
  invitations: Array<{ email: string; link: string; email_sent: boolean; delivery_error?: string | null }>;
}

const parseEmails = (value: string) => Array.from(new Set(
  value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean),
));

export default function CreateMeetingPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [emails, setEmails] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const createMeeting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const meeting = await apiRequest("/api/meetings/", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          date: new Date(date).toISOString(),
          participants: [],
        }),
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

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  };

  const whatsappUrl = result
    ? `https://wa.me/?text=${encodeURIComponent(`You are invited to ${title}. Register your attendance here: ${result.general_link}`)}`
    : "#";

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold text-gray-900">Schedule & Invite Meeting</h1>
          <p className="mt-1 text-sm text-gray-500">Create a real meeting record, email participants, or share one attendance link on WhatsApp.</p>
        </div>

        {!result ? (
          <form onSubmit={createMeeting} className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <label className="block text-sm font-medium text-gray-700">Meeting title
              <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" placeholder="e.g. Board of Governors Meeting" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">Meeting date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" />
              </label>
              <div className="rounded border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <Calendar className="mb-1" size={16} />Participants can confirm attendance from the invitation link without logging in.
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700">Agenda / description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" placeholder="Agenda, objectives, venue or important notes..." />
            </label>
            <label className="block text-sm font-medium text-gray-700">Participant emails
              <textarea value={emails} onChange={(event) => setEmails(event.target.value)} rows={5} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" placeholder={"person1@example.com\nperson2@example.com"} />
              <span className="mt-1 block text-xs text-gray-500">Separate emails with a new line, comma or semicolon. You can also leave this empty and use the WhatsApp/general link.</span>
            </label>
            {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <button disabled={submitting} type="submit" className="flex w-full items-center justify-center gap-2 rounded bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              <Mail size={17} />{submitting ? "Creating meeting..." : "Create Meeting & Send Invitations"}
            </button>
          </form>
        ) : (
          <div className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-center"><Check className="mx-auto mb-2 rounded-full bg-green-50 p-2 text-green-600" size={44} /><h2 className="text-xl font-bold text-gray-900">Meeting created</h2><p className="text-sm text-gray-500">Meeting #{result.meeting_id}</p></div>
            <div className="rounded border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-900"><Users size={16} />General attendance link</div>
              <div className="flex flex-col gap-2 sm:flex-row"><input readOnly value={result.general_link} className="min-w-0 flex-1 rounded border border-blue-200 bg-white px-3 py-2 text-xs text-gray-800" /><button onClick={() => copy(result.general_link)} className="inline-flex items-center justify-center gap-1 rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white">{copied === result.general_link ? <Check size={14} /> : <Copy size={14} />} Copy</button></div>
            </div>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"><MessageCircle size={18} />Share General Link on WhatsApp</a>

            {result.invitations.length > 0 && <div className="space-y-2"><h3 className="text-sm font-bold text-gray-900">Email invitations</h3>{result.invitations.map((invite) => <div key={invite.email} className="rounded border border-gray-200 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="truncate text-sm font-medium text-gray-900">{invite.email}</div><div className={`text-xs ${invite.email_sent ? "text-green-600" : "text-amber-700"}`}>{invite.email_sent ? "Email sent" : invite.delivery_error || "Link created; email not sent"}</div></div><button onClick={() => copy(invite.link)} className="inline-flex items-center justify-center gap-1 rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><Copy size={13} />Copy personal link</button></div></div>)}</div>}

            {!result.smtp_configured && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">SMTP is not configured yet. The meeting and links are valid; add SMTP settings in Coolify to send invitation emails automatically.</div>}
            <div className="grid gap-3 sm:grid-cols-2"><button onClick={() => router.push(`/meetings/${result.meeting_id}`)} className="rounded border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700">Open Meeting Workspace</button><button onClick={() => router.push(`/meetings/${result.meeting_id}/invite`)} className="rounded bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">Manage Invitations</button></div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
