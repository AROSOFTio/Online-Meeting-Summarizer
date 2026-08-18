"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, Mail, Mic, PlusCircle, RefreshCw, Search, Users, Video } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface MeetingItem {
  id: number;
  title: string;
  description: string | null;
  date: string;
  status: "draft" | "processing" | "completed" | "failed";
  is_archived: boolean;
  participants: Array<{ id: number; name: string; email: string | null }>;
}

export default function MeetingsDirectoryPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "minute_secretary";
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const { data: meetings = [], isLoading, isError, error, refetch } = useQuery<MeetingItem[]>({
    queryKey: ["meetings-list", searchTerm, statusFilter, showArchived],
    queryFn: () => {
      const params = new URLSearchParams({ is_archived: String(showArchived) });
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter) params.set("status", statusFilter);
      return apiRequest(`/api/meetings/?${params.toString()}`);
    },
  });

  return <DashboardLayout><div className="space-y-6">
    <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
      <div><h1 className="text-2xl font-bold text-gray-900">Meeting Directory</h1><p className="mt-1 text-sm text-gray-500">Real meeting records, attendance, recordings, transcripts and minutes.</p></div>
      {canEdit && <div className="flex flex-col gap-2 sm:flex-row"><Link href="/create-meeting" className="inline-flex items-center justify-center gap-2 rounded border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700"><Mail size={16}/>Schedule & Invite</Link><Link href="/meetings/new" className="inline-flex items-center justify-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white"><Mic size={16}/>Record / Upload</Link></div>}
    </div>

    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 md:flex-row md:items-center">
      <div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-gray-400" size={18}/><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search title, attendee or transcript..." className="w-full rounded border border-gray-300 py-2 pl-10 pr-3 text-sm text-gray-900" /></div>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"><option value="">All statuses</option><option value="draft">Draft</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="failed">Failed</option></select>
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Archived</label>
      <button onClick={() => refetch()} className="rounded border border-gray-300 p-2 text-gray-600"><RefreshCw size={16}/></button>
    </div>

    {isLoading && <div className="rounded-lg border border-gray-200 bg-white py-16 text-center"><RefreshCw className="mx-auto animate-spin text-blue-700"/><p className="mt-3 text-sm text-gray-500">Loading meetings...</p></div>}
    {isError && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={18}/>{error?.message || "Could not load meetings"}</div>}

    {!isLoading && !isError && meetings.length === 0 && <div className="rounded-lg border border-gray-200 bg-white py-16 text-center"><Video className="mx-auto mb-3 text-gray-300" size={42}/><h2 className="font-bold text-gray-900">No meetings found</h2><p className="mt-1 text-sm text-gray-500">Create a meeting or change the filters.</p>{canEdit && <Link href="/create-meeting" className="mt-4 inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white"><PlusCircle size={16}/>Create Meeting</Link>}</div>}

    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {meetings.map((meeting) => <article key={meeting.id} className="flex flex-col justify-between rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3"><h2 className="line-clamp-2 font-bold text-gray-950">{meeting.title}</h2><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${meeting.status === "completed" ? "border-green-200 bg-green-50 text-green-700" : meeting.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : meeting.status === "processing" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>{meeting.status}</span></div>
          <p className="line-clamp-3 text-xs leading-5 text-gray-500">{meeting.description || "No description provided."}</p>
          <div className="space-y-2 text-xs text-gray-600"><div className="flex items-center gap-2"><Calendar size={14} className="text-gray-400"/>{new Date(meeting.date).toLocaleDateString()}</div><div className="flex items-center gap-2"><Users size={14} className="text-gray-400"/>{meeting.participants.length} participant{meeting.participants.length === 1 ? "" : "s"}</div></div>
        </div>
        <div className="grid grid-cols-1 gap-2 border-t border-gray-100 bg-gray-50 p-3 sm:grid-cols-2"><Link href={`/meetings/${meeting.id}`} className="rounded border border-gray-300 bg-white px-3 py-2 text-center text-xs font-bold text-blue-700">Open Workspace</Link>{canEdit && <Link href={`/meetings/${meeting.id}/invite`} className="rounded bg-blue-700 px-3 py-2 text-center text-xs font-bold text-white">Invite Participants</Link>}</div>
      </article>)}
    </div>
  </div></DashboardLayout>;
}
