"use client";

import React, { useMemo, useState } from "react";
import { MailPlus, Search, Users, X } from "lucide-react";

export interface DirectoryPerson {
  id: number;
  name: string;
  email: string;
  access_role: string;
  directory_group: string;
  position_title: string | null;
}

interface Props {
  options: DirectoryPerson[];
  selectedUserIds: number[];
  onSelectedUserIdsChange: (ids: number[]) => void;
  externalEmails: string[];
  onExternalEmailsChange: (emails: string[]) => void;
  disabled?: boolean;
  pendingEmail?: string;
  onPendingEmailChange?: (email: string) => void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ParticipantInvitePicker({
  options,
  selectedUserIds,
  onSelectedUserIdsChange,
  externalEmails,
  onExternalEmailsChange,
  disabled = false,
  pendingEmail,
  onPendingEmailChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [localEmailDraft, setLocalEmailDraft] = useState("");
  const emailDraft = pendingEmail ?? localEmailDraft;
  const setEmailDraft = onPendingEmailChange ?? setLocalEmailDraft;
  const [emailError, setEmailError] = useState<string | null>(null);

  const selected = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const groups = useMemo(
    () => Array.from(new Set(options.map((person) => person.directory_group || "Staff"))).sort((a, b) => a.localeCompare(b)),
    [options],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((person) =>
      [person.name, person.email, person.position_title || "", person.directory_group || ""]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [options, search]);

  const togglePerson = (id: number) => {
    const next = new Set(selectedUserIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedUserIdsChange(Array.from(next));
  };

  const toggleGroup = (group: string) => {
    const ids = options.filter((person) => (person.directory_group || "Staff") === group).map((person) => person.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    const next = new Set(selectedUserIds);
    ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
    onSelectedUserIdsChange(Array.from(next));
  };

  const captureExternalEmail = () => {
    const value = emailDraft.trim().toLowerCase();
    if (!value) return;
    if (/[\s,;]/.test(value) || !emailPattern.test(value)) {
      setEmailError("Enter one valid email address, then press Enter. Commas, semicolons and new lines are not accepted.");
      return;
    }
    if (!externalEmails.includes(value)) onExternalEmailsChange([...externalEmails, value]);
    setEmailDraft("");
    setEmailError(null);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Users size={17}/>Choose people from the directory</div>
        <p className="mt-1 text-xs text-slate-500">Select individuals or add an entire organisational group.</p>

        {groups.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
          {groups.map((group) => {
            const groupIds = options.filter((person) => (person.directory_group || "Staff") === group).map((person) => person.id);
            const allSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
            return <button key={group} type="button" disabled={disabled} onClick={() => toggleGroup(group)} className={`rounded-full border px-3 py-2 text-xs font-bold ${allSelected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{allSelected ? "✓ " : "+ "}{group} <span className="opacity-70">({groupIds.length})</span></button>;
          })}
        </div>}

        <div className="relative mt-4"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input disabled={disabled} value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900" placeholder="Search name, email, position or group..." /></div>

        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? <p className="py-5 text-center text-xs text-slate-500">No matching directory people.</p> : filtered.map((person) => (
            <label key={person.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selected.has(person.id) ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
              <input disabled={disabled} type="checkbox" checked={selected.has(person.id)} onChange={() => togglePerson(person.id)} className="mt-1" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{person.name}</span><span className="block truncate text-xs text-slate-500">{person.position_title || person.directory_group || "Staff"} · {person.email}</span></span>
              <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{person.directory_group || "Staff"}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 text-xs font-bold text-blue-700">{selectedUserIds.length} directory participant{selectedUserIds.length === 1 ? "" : "s"} selected</div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-amber-950"><MailPlus size={17}/>External email — use only if they are not in the directory</div>
        <p className="mt-1 text-xs leading-5 text-amber-800">Type exactly one email address and press <b>Enter</b> to capture it. Do not paste comma-separated or new-line lists.</p>
        <input
          disabled={disabled}
          value={emailDraft}
          onChange={(event) => { setEmailDraft(event.target.value); setEmailError(null); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); captureExternalEmail(); }
            if (event.key === "," || event.key === ";") { event.preventDefault(); setEmailError("Use one email at a time and press Enter."); }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[\n\r,;]/.test(text)) { event.preventDefault(); setEmailError("Paste one email only. Lists with commas or new lines are not accepted."); }
          }}
          className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-900"
          placeholder="person@example.com — press Enter"
          type="email"
        />
        <button type="button" disabled={disabled || !emailDraft.trim()} onClick={captureExternalEmail} className="mt-2 rounded-lg bg-amber-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Add guest email</button>
        {emailError && <div className="mt-2 text-xs font-semibold text-red-700">{emailError}</div>}
        {externalEmails.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{externalEmails.map((email) => <span key={email} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{email}<button type="button" disabled={disabled} onClick={() => onExternalEmailsChange(externalEmails.filter((item) => item !== email))} aria-label={`Remove ${email}`}><X size={13}/></button></span>)}</div>}
      </section>
    </div>
  );
}
