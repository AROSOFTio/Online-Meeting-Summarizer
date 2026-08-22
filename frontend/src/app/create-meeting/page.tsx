"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Copy, MessageCircle, Mic, Play, Users } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
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

const localNow = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function CreateMeetingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"now" | "later">("later");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateTime, setDateTime] = useState(localNow());
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiRequest("/api/meetings/directory/staff-options")
      .then((data: DirectoryPerson[]) => setDirectory(data))
      .catch(() => setDirectory([]));
  }, []);

  const createMeeting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const meetingDate = mode === "now" ? new Date().toISOString() : new Date(dateTime).toISOString();
      const meeting = await apiRequest("/api/meetings/", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          date: meetingDate,
          participants: [],
        }),
      });

      const invitation = (await apiRequest(`/api/meetings/${meeting.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          user_ids: selectedUserIds,
          emails: externalEmails,
          send_email: true,
        }),
      })) as InviteResult;

      if (mode === "now") {
        router.push(`/meetings/${meeting.id}/live?autostart=1`);
        return;
      }
      setResult(invitation);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the meeting.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.general_link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const whatsappUrl = result
    ? `https://wa.me/?text=${encodeURIComponent(`You are invited to ${title}. Open the meeting link: ${result.general_link}`)}`
    : "#";

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-2xl font-extrabold text-slate-950">New Meeting</h1>
          <p className="mt-1 text-sm text-slate-500">
            Start immediately or schedule it for later. The organiser controls when a scheduled meeting actually starts.
          </p>
        </header>

        {!result ? (
          <form onSubmit={createMeeting} className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={`rounded-2xl border p-5 text-left ${
                  mode === "now" ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-2 font-extrabold text-slate-950">
                  <Mic className="text-blue-700" size={20} />
                  Start Meeting Now
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Create the meeting, send invitations and immediately request microphone access to begin recording.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode("later")}
                className={`rounded-2xl border p-5 text-left ${
                  mode === "later" ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-2 font-extrabold text-slate-950">
                  <CalendarClock className="text-blue-700" size={20} />
                  Schedule for Later
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Participants see a live countdown. At zero they keep waiting until the organiser presses Start Meeting.
                </p>
              </button>
            </section>

            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <label className="block text-sm font-semibold text-slate-700">
                Meeting name
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  minLength={3}
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  placeholder="e.g. Staff General Meeting"
                />
              </label>

              {mode === "later" && (
                <label className="block text-sm font-semibold text-slate-700">
                  Scheduled date & time
                  <div className="relative mt-1">
                    <CalendarClock className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="datetime-local"
                      value={dateTime}
                      onChange={(event) => setDateTime(event.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-3 text-slate-900"
                    />
                  </div>
                </label>
              )}

              <label className="block text-sm font-semibold text-slate-700">
                Agenda <span className="font-normal text-slate-400">(optional to type)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900"
                  placeholder="Add agenda items if known. If left blank, the system will prepare an agenda from the meeting discussion."
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  The final minutes will always contain an agenda, and the system will detect speakers automatically.
                </span>
              </label>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-extrabold text-slate-950">Invite participants</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Prefer the system directory. Select individuals, whole groups, or both. You can invite more people while the meeting is live.
                </p>
              </div>
              <ParticipantInvitePicker
                options={directory}
                selectedUserIds={selectedUserIds}
                onSelectedUserIdsChange={setSelectedUserIds}
                externalEmails={externalEmails}
                onExternalEmailsChange={setExternalEmails}
                disabled={submitting}
              />
            </section>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <button
              disabled={submitting}
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-4 text-base font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {mode === "now" ? <Play size={19} fill="currentColor" /> : <CalendarClock size={19} />}
              {submitting ? "Creating meeting..." : mode === "now" ? "Create & Start Meeting" : "Schedule & Send Invitations"}
            </button>
          </form>
        ) : (
          <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-center">
              <Check className="mx-auto rounded-full bg-green-50 p-2 text-green-600" size={48} />
              <h2 className="mt-3 text-2xl font-extrabold text-slate-950">Meeting scheduled</h2>
              <p className="mt-1 text-sm text-slate-500">{title}</p>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/meetings/${result.meeting_id}/live`)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-4 text-base font-extrabold text-white shadow-sm hover:bg-blue-800"
            >
              <Play size={20} fill="currentColor" />
              Start Meeting
            </button>
            <p className="-mt-3 text-center text-xs text-slate-400">
              You may start before, at, or after the scheduled time. Participants remain in the waiting room until you start.
            </p>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-950">
                <Users size={16} />
                General guest link
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={result.general_link}
                  className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-xs text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-xs font-bold text-blue-800"
                >
                  <Copy size={14} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700"
              >
                <MessageCircle size={17} />
                Share on WhatsApp
              </a>
            </div>

            {result.invitations.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-900">Personal invitations</h3>
                <div className="mt-3 space-y-2">
                  {result.invitations.map((invite) => (
                    <div key={invite.email} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="min-w-0 truncate text-xs font-medium text-slate-700">
                        {invite.name ? `${invite.name} · ` : ""}
                        {invite.email}
                      </span>
                      <span className={`shrink-0 text-xs font-bold ${invite.email_sent ? "text-green-600" : "text-amber-700"}`}>
                        {invite.email_sent ? "Sent" : "Link ready"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!result.smtp_configured && result.invitations.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Email delivery is not configured, but all personal links are ready and the general link can still be shared.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => router.push(`/meetings/${result.meeting_id}`)}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700"
              >
                View Meeting
              </button>
              <button
                type="button"
                onClick={() => router.push("/meetings")}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700"
              >
                All Meetings
              </button>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
