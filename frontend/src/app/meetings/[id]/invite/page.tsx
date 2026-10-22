"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import ParticipantInvitePicker, { DirectoryPerson } from "@/components/ParticipantInvitePicker";
import { apiRequest } from "@/lib/api";

interface Meeting { id: number; title: string; date: string; }
interface InviteResult {
  meeting_id: number;
  general_link: string;
  smtp_configured: boolean;
  invitations: Array<{ email: string; name?: string | null; link: string; email_sent: boolean; delivery_error?: string | null }>;
}

export default function InviteParticipantsPage() {
  const { id } = useParams<{ id: string }>();
  const meetingId = Number(id);
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [pendingEmail, setPendingEmail] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: meeting, isLoading } = useQuery<Meeting>({
    queryKey: ["meeting-invite-header", meetingId],
    queryFn: () => apiRequest(`/api/meetings/${meetingId}`),
    enabled: Number.isInteger(meetingId) && meetingId > 0,
  });

  useEffect(() => {
    apiRequest("/api/meetings/directory/staff-options")
      .then((data: DirectoryPerson[]) => setDirectory(data))
      .catch(() => setDirectory([]));
  }, []);

  const generate = async (sendEmail: boolean) => {
    const pending = pendingEmail.trim().toLowerCase();
    if (pending && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending)) {
      setError("Enter a valid guest email address."); return;
    }
    const addresses = Array.from(new Set([...externalEmails, ...(pending ? [pending] : [])]));
    if (selectedUserIds.length === 0 && addresses.length === 0) {
      setError("Select staff or enter at least one guest email."); return;
    }
    setSending(true); setError(null);
    try {
      const data = await apiRequest(`/api/meetings/${meetingId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ user_ids: selectedUserIds, emails: addresses, send_email: sendEmail }),
      }) as InviteResult;
      setResult(data);
      setExternalEmails(addresses);
      setPendingEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invitations.");
    } finally {
      setSending(false);
    }
  };

  const [copyingInvite, setCopyingInvite] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const copyInviteLink = async () => {
    if (copyingInvite) return;
    setCopyingInvite(true); setError(null);
    try {
      let link = result?.general_link;
      if (!link) {
        const data = await apiRequest(`/api/meetings/${meetingId}/invitations`, {
          method: "POST",
          body: JSON.stringify({ user_ids: [], emails: [], send_email: false }),
        }) as InviteResult;
        link = data.general_link;
      }
      if (!link) throw new Error("Invite link unavailable.");
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not copy invite link."); }
    finally { setCopyingInvite(false); }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value); setCopied(value); setTimeout(() => setCopied(null), 1200);
  };

  return <DashboardLayout><div className="mx-auto w-full max-w-4xl space-y-6">
    <div className="border-b border-gray-200 pb-5"><Link href={`/meetings/${meetingId}`} className="text-xs font-semibold text-blue-700">← Back to meeting</Link><h1 className="mt-2 text-2xl font-bold text-gray-900">Invite Participants</h1><p className="mt-1 text-sm text-gray-500">{isLoading ? "Loading meeting..." : meeting?.title}</p></div>

    <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-bold text-gray-900">Share meeting with anyone</p><p className="mt-1 text-xs text-gray-600">Copy a guest link. Recipients do not need an account.</p><button type="button" disabled={copyingInvite} onClick={() => void copyInviteLink()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Copy size={16}/>{copyingInvite ? "Preparing..." : inviteCopied ? "Copied!" : "Copy Invite Link"}</button></div>
      <ParticipantInvitePicker options={directory} selectedUserIds={selectedUserIds} onSelectedUserIdsChange={setSelectedUserIds} externalEmails={externalEmails} pendingEmail={pendingEmail} onPendingEmailChange={setPendingEmail} onExternalEmailsChange={setExternalEmails} disabled={sending} />
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2"><button disabled={sending} onClick={() => generate(true)} className="flex items-center justify-center gap-2 rounded bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Mail size={17} />{sending ? "Working..." : "Send Personal Invitations"}</button><button disabled={sending} onClick={() => generate(false)} className="rounded border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50">Generate Links Only</button></div>
    </div>

    {result && <div className="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div><h2 className="text-sm font-bold text-gray-900">General guest link</h2><p className="mt-1 text-xs text-gray-500">Use this for people who are not already in the system. They enter their full name once, then wait for the organiser to start.</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input readOnly value={result.general_link} className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-xs text-gray-800" /><button onClick={() => copy(result.general_link)} className="flex items-center justify-center gap-1 rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white">{copied === result.general_link ? <Check size={14}/> : <Copy size={14}/>} Copy</button></div></div>
      <a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`You are invited to ${meeting?.title || "a Starlight meeting"}. Open the meeting link: ${result.general_link}`)}`} className="flex items-center justify-center gap-2 rounded bg-green-600 px-4 py-3 text-sm font-semibold text-white"><MessageCircle size={18}/>Share on WhatsApp</a>
      {!result.smtp_configured && result.invitations.length > 0 && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">SMTP is not configured. The links work, but automatic email delivery is disabled until SMTP variables are added in Coolify.</div>}
      {result.invitations.length > 0 && <div className="space-y-2"><h3 className="text-sm font-bold text-gray-900">Personal invitations</h3>{result.invitations.map((invite) => <div key={invite.email} className="rounded border border-gray-200 p-3"><div className="text-sm font-medium text-gray-900">{invite.name || invite.email}</div>{invite.name && <div className="text-xs text-gray-500">{invite.email}</div>}<div className={`mt-0.5 text-xs ${invite.email_sent ? "text-green-600" : "text-amber-700"}`}>{invite.email_sent ? "Email sent" : invite.delivery_error || "Link generated"}</div><button onClick={() => copy(invite.link)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><Copy size={13}/>Copy personal link</button></div>)}</div>}
    </div>}
  </div></DashboardLayout>;
}
