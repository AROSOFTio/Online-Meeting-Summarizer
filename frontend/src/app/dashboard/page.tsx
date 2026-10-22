"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, CheckSquare, Clock, Play, PlusCircle, Radio, Users, Video } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface StatsResponse {
  total_meetings: number;
  meetings_this_month: number;
  recorded_hours: number;
  active_staff: number;
  storage_usage_mb: number;
  pending_jobs: number;
  failed_jobs: number;
  open_action_items: number;
  completed_action_items: number;
  staff_assigned_action_items: number;
  recent_meetings: Array<{ id: number; title: string; date: string; status: "draft" | "processing" | "completed" | "failed"; owner: string; owner_id: number }>;
}

interface OngoingMeeting {
  id: number;
  title: string;
  date: string;
  owner_id: number;
  owner_name: string;
  is_moderator: boolean;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const statsQuery = useQuery<StatsResponse>({ queryKey: ["dashboard-stats"], queryFn: () => apiRequest("/api/stats") });
  const ongoingQuery = useQuery<OngoingMeeting[]>({ queryKey: ["dashboard-ongoing-meetings"], queryFn: () => apiRequest("/api/live-rooms/ongoing"), enabled: Boolean(user), refetchInterval: 2000 });
  if (!user) return null;

  const stats = statsQuery.data;
  const ongoing = ongoingQuery.data || [];
  const isAdmin = user.role === "admin";
  const canCreate = isAdmin || user.role === "minute_secretary";

  return <DashboardLayout><div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-extrabold text-slate-950">Welcome, {user.full_name}</h1><p className="mt-1 text-sm text-slate-500">Everything you need for meetings, in one place.</p></div><div className="flex gap-2">{canCreate && <Link href="/create-meeting" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-blue-800"><PlusCircle size={17} />New Meeting</Link>}<Link href="/meetings" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"><Calendar size={17} />Meetings</Link></div></header>

    {ongoing.length > 0 && <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"><div className="flex items-center gap-3"><span className="h-3 w-3 animate-pulse rounded-full bg-red-500" /><div><h2 className="font-extrabold text-red-900">Live now</h2><p className="text-xs text-red-700">Staff can join an ongoing meeting directly from their account; a personal invitation is not required.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{ongoing.map((meeting) => <div key={meeting.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-white p-4"><div className="min-w-0"><div className="truncate text-sm font-extrabold text-slate-950">{meeting.title}</div><div className="mt-1 text-xs text-slate-500">Organiser: {meeting.owner_name}</div></div><Link href={`/meetings/${meeting.id}/live`} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-xs font-extrabold text-white"><Radio size={14} />{meeting.is_moderator ? "Manage" : "Join"}</Link></div>)}</div></section>}

    {statsQuery.isLoading && <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">Loading dashboard...</div>}
    {statsQuery.isError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Could not load dashboard information.</div>}

    {stats && <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard icon={<Video size={20} />} label="Meetings" value={String(stats.total_meetings)} note={`${stats.meetings_this_month} this month`} /><StatCard icon={<CheckSquare size={20} />} label={isAdmin ? "Open Action Items" : "My Action Items"} value={String(isAdmin ? stats.open_action_items : stats.staff_assigned_action_items)} note="Needs attention" /><StatCard icon={<Clock size={20} />} label="Recorded" value={`${stats.recorded_hours}h`} note="Meeting audio" /><StatCard icon={<Users size={20} />} label="Active Staff" value={String(stats.active_staff)} note="System users" /></section>
      {stats.failed_jobs > 0 && <Link href="/meetings" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><div className="flex items-center gap-3"><AlertTriangle size={20} /><div><div className="text-sm font-bold">{stats.failed_jobs} meeting{stats.failed_jobs === 1 ? "" : "s"} need attention</div><div className="text-xs text-red-600">Open Meetings to review the failed processing.</div></div></div><span className="text-xs font-bold">View</span></Link>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-slate-950">Recent Meetings</h2><p className="text-xs text-slate-500">Start scheduled meetings or open completed minutes.</p></div><Link href="/meetings" className="text-xs font-bold text-blue-700">View all</Link></div>{stats.recent_meetings.length === 0 ? <div className="py-10 text-center"><p className="text-sm text-slate-500">No meetings yet.</p>{canCreate && <Link href="/create-meeting" className="mt-3 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">Create Meeting</Link>}</div> : <div className="divide-y divide-slate-100">{stats.recent_meetings.map((meeting) => { const canStart = meeting.status === "draft" && (isAdmin || meeting.owner_id === user.id); return <div key={meeting.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{meeting.title}</div><div className="mt-1 text-xs text-slate-500">{new Date(meeting.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {meeting.owner}</div></div>{canStart ? <Link href={`/meetings/${meeting.id}/live`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-extrabold text-white"><Play size={14} fill="currentColor" />Start Meeting</Link> : <Link href={`/meetings/${meeting.id}`} className="shrink-0 rounded-lg border border-slate-300 px-4 py-2.5 text-center text-xs font-bold text-slate-700">Open</Link>}</div>; })}</div>}</section>
    </>}
  </div></DashboardLayout>;
}

function StatCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">{label}</span><span className="rounded-lg bg-blue-50 p-2 text-blue-700">{icon}</span></div><div className="mt-4 text-2xl font-extrabold text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-400">{note}</div></div>;
}
