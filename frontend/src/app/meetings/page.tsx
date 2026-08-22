"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, Play, PlusCircle, Radio, RefreshCw, Search, Users, Video } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface MeetingItem {
  id: number;
  title: string;
  description: string | null;
  date: string;
  owner_id: number;
  status: "draft" | "processing" | "completed" | "failed";
  participants: Array<{ id: number; name: string; email: string | null; role_title?: string | null }>;
  lifecycle?: "live";
  owner_name?: string;
  is_moderator?: boolean;
}

const statusLabel: Record<MeetingItem["status"], string> = {
  draft: "Scheduled",
  processing: "Preparing Minutes",
  completed: "Completed",
  failed: "Needs Attention",
};

export default function MeetingsDirectoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canCreate = isAdmin || user?.role === "minute_secretary";
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const meetingsQuery = useQuery<MeetingItem[]>({
    queryKey: ["meetings-list", searchTerm, statusFilter, showArchived],
    queryFn: () => {
      const params = new URLSearchParams({ is_archived: String(showArchived) });
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter && statusFilter !== "live") params.set("status", statusFilter);
      return apiRequest(`/api/meetings/?${params.toString()}`);
    },
    refetchInterval: 5000,
  });

  const ongoingQuery = useQuery<MeetingItem[]>({
    queryKey: ["ongoing-meetings"],
    queryFn: () => apiRequest("/api/live-rooms/ongoing"),
    enabled: Boolean(user && !showArchived),
    refetchInterval: 2000,
  });

  const meetings = useMemo(() => {
    const normal = meetingsQuery.data || [];
    if (showArchived) return normal;
    const term = searchTerm.trim().toLowerCase();
    const live = (ongoingQuery.data || []).filter((meeting) => {
      if (term && !`${meeting.title} ${meeting.description || ""}`.toLowerCase().includes(term)) return false;
      if (statusFilter && statusFilter !== "live") return false;
      return true;
    });
    if (statusFilter === "live") return live;
    const liveIds = new Set(live.map((meeting) => meeting.id));
    return [...live, ...normal.filter((meeting) => !liveIds.has(meeting.id))];
  }, [meetingsQuery.data, ongoingQuery.data, searchTerm, showArchived, statusFilter]);

  const refreshAll = async () => Promise.all([meetingsQuery.refetch(), ongoingQuery.refetch()]);

  return <DashboardLayout><div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-extrabold text-slate-950">Meetings</h1><p className="mt-1 text-sm text-slate-500">Live meetings appear here automatically. Staff can join an ongoing meeting without a personal invitation.</p></div>{canCreate && <Link href="/create-meeting" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-800"><PlusCircle size={17} />New Meeting</Link>}</header>

    {(ongoingQuery.data || []).length > 0 && !showArchived && <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /><div><div className="text-sm font-extrabold">{(ongoingQuery.data || []).length} meeting{(ongoingQuery.data || []).length === 1 ? "" : "s"} live now</div><div className="text-xs text-red-600">Open a live meeting below to join the audio room.</div></div></div>}

    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={18} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search meetings..." className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm text-slate-900" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"><option value="">All meetings</option><option value="live">Live now</option><option value="draft">Scheduled</option><option value="processing">Preparing Minutes</option><option value="completed">Completed</option><option value="failed">Needs Attention</option></select><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Archived</label><button type="button" onClick={() => void refreshAll()} className="rounded-lg border border-slate-300 p-2 text-slate-600" aria-label="Refresh meetings"><RefreshCw size={16} /></button></div>

    {meetingsQuery.isLoading && <div className="rounded-xl border border-slate-200 bg-white py-16 text-center"><RefreshCw className="mx-auto animate-spin text-blue-700" /><p className="mt-3 text-sm text-slate-500">Loading meetings...</p></div>}
    {meetingsQuery.isError && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={18} />{meetingsQuery.error?.message || "Could not load meetings"}</div>}
    {!meetingsQuery.isLoading && !meetingsQuery.isError && meetings.length === 0 && <div className="rounded-xl border border-slate-200 bg-white py-16 text-center"><Video className="mx-auto mb-3 text-slate-300" size={42} /><h2 className="font-bold text-slate-900">No meetings found</h2>{canCreate && <Link href="/create-meeting" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white"><PlusCircle size={16} />Create Meeting</Link>}</div>}

    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{meetings.map((meeting) => {
      const isLive = meeting.lifecycle === "live";
      const badge = isLive ? "border-red-200 bg-red-50 text-red-700" : meeting.status === "completed" ? "border-green-200 bg-green-50 text-green-700" : meeting.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : meeting.status === "processing" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700";
      const canManage = Boolean(user && (isAdmin || meeting.owner_id === user.id || meeting.is_moderator));
      const canStart = canManage && meeting.status === "draft" && !isLive;
      return <article key={meeting.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white shadow-sm"><div className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><h2 className="line-clamp-2 font-extrabold text-slate-950">{meeting.title}</h2><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${badge}`}>{isLive ? "LIVE NOW" : statusLabel[meeting.status]}</span></div><p className="line-clamp-3 text-xs leading-5 text-slate-500">{meeting.description || "No agenda added."}</p><div className="space-y-2 text-xs text-slate-600"><div className="flex items-center gap-2"><Calendar size={14} className="text-slate-400" />{new Date(meeting.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div><div className="flex items-center gap-2"><Users size={14} className="text-slate-400" />{meeting.participants.length} participant{meeting.participants.length === 1 ? "" : "s"}</div></div></div><div className="space-y-2 border-t border-slate-100 bg-slate-50 p-3">{isLive ? <Link href={`/meetings/${meeting.id}/live`} className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-3 text-sm font-extrabold text-white hover:bg-red-700"><Radio size={16} />{canManage ? "Manage Live Meeting" : "Join Meeting"}</Link> : canStart ? <Link href={`/meetings/${meeting.id}/live`} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-blue-800"><Play size={16} fill="currentColor" />Start Meeting</Link> : <Link href={`/meetings/${meeting.id}`} className="block rounded-lg bg-blue-700 px-3 py-3 text-center text-sm font-extrabold text-white">Open Meeting</Link>}{!isLive && <div className={`grid gap-2 ${canManage ? "grid-cols-2" : "grid-cols-1"}`}><Link href={`/meetings/${meeting.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700">Details</Link>{canManage && <Link href={`/meetings/${meeting.id}/invite`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-bold text-slate-700">Invite People</Link>}</div>}</div></article>;
    })}</div>
  </div></DashboardLayout>;
}
