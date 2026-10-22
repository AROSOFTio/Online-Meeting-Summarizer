"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Copy, Mail, X } from "lucide-react";

import ParticipantInvitePicker, { DirectoryPerson } from "@/components/ParticipantInvitePicker";
import { apiRequest } from "@/lib/api";

interface InviteResult {
  meeting_id: number;
  general_link: string;
  smtp_configured: boolean;
  invitations: Array<{
    email: string;
    name?: string | null;
    link: string;
    email_sent: boolean;
    delivery_error?: string | null;
  }>;
}

export default function LiveInvitePanel({ meetingId, onClose, onInvited }: { meetingId: number; onClose: () => void; onInvited?: () => void }) {
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [pendingEmail, setPendingEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [guestLink, setGuestLink] = useState("");

  useEffect(() => {
    apiRequest("/api/meetings/directory/staff-options")
      .then((data: DirectoryPerson[]) => setDirectory(data))
      .catch(() => setDirectory([]));
  }, []);

  const send = async () => {
    const pending = pendingEmail.trim().toLowerCase();
    if (pending && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending)) {
      setError("Enter a valid guest email address."); return;
    }
    const addresses = Array.from(new Set([...externalEmails, ...(pending ? [pending] : [])]));
    if (selectedUserIds.length === 0 && addresses.length === 0) {
      setError("Choose at least one staff member or enter one external email address.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const data = await apiRequest(`/api/meetings/${meetingId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ user_ids: selectedUserIds, emails: addresses, send_email: true }),
      }) as InviteResult;
      setResult(data);
      setExternalEmails(addresses);
      setPendingEmail("");
      onInvited?.();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not send invitations.");
    } finally {
      setSending(false);
    }
  };

  const copyGeneral = async () => {
    if (copying) return;
    setCopying(true);
    setError(null);
    try {
      let link = guestLink || result?.general_link;
      if (!link) {
        const data = await apiRequest(`/api/meetings/${meetingId}/invitations`, {
          method: "POST",
          body: JSON.stringify({ user_ids: [], emails: [], send_email: false }),
        }) as InviteResult;
        link = data.general_link;
        setGuestLink(link);
      }
      if (!link) throw new Error("Meeting invitation link is unavailable.");
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Could not copy invite link.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Invite participants without leaving the meeting">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Invite people during the meeting</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">The live meeting and recording continue behind this window. Sending an invitation never leaves or stops the meeting.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close invitation panel"><X size={18}/></button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-sm font-bold text-slate-900">Share meeting link</div>
            <p className="mt-1 text-xs text-slate-600">Copy a link for any guest to join, including people without an account. No email address required.</p>
            <button type="button" onClick={() => void copyGeneral()} disabled={copying} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
              <Copy size={16}/>{copying ? "Preparing link..." : copied ? "Link copied!" : "Copy Invite Link"}
            </button>
          </div>

          <ParticipantInvitePicker
            options={directory}
            selectedUserIds={selectedUserIds}
            onSelectedUserIdsChange={setSelectedUserIds}
            externalEmails={externalEmails} pendingEmail={pendingEmail} onPendingEmailChange={setPendingEmail}
            onExternalEmailsChange={setExternalEmails}
            disabled={sending}
          />

          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <button type="button" onClick={() => void send()} disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-50">
            <Mail size={17}/>{sending ? "Sending invitations..." : "Send Invitations"}
          </button>

          {result && <section className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-sm font-extrabold text-green-800"><CheckCircle2 size={17}/>Invitations created</div>
            <div className="mt-3 space-y-2">
              {result.invitations.map((invite) => <div key={invite.email} className="rounded-lg border border-green-100 bg-white p-3">
                <div className="text-sm font-bold text-slate-900">{invite.name || invite.email}</div>
                <div className={`mt-1 text-xs ${invite.email_sent ? "text-green-700" : "text-amber-700"}`}>{invite.email_sent ? "Email sent" : invite.delivery_error || "Personal link created"}</div>
              </div>)}
            </div>
            <button type="button" onClick={() => void copyGeneral()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-bold text-green-800"><Copy size={14}/>{copied ? "Copied" : "Copy general guest link"}</button>
          </section>}
        </div>
      </div>
    </div>
  );
}
