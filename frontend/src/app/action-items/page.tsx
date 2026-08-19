"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import {
  CheckSquare, Clock, AlertTriangle, RefreshCw, Filter, Edit2,
  Trash2, CheckCircle, Circle, PlayCircle, Calendar, User,
} from "lucide-react";

interface ActionItem {
  id: number;
  meeting_id: number;
  text: string;
  assignee_id: number | null;
  assignee_name: string | null;
  responsible_name?: string | null;
  priority: string;
  deadline: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
interface StaffOption { id:number; name:string; email:string; access_role:string; }

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  low: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Circle size={14} className="text-gray-400" />,
  in_progress: <PlayCircle size={14} className="text-blue-600" />,
  completed: <CheckCircle size={14} className="text-green-600" />,
};

export default function ActionItemsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "minute_secretary";
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");

  const { data: items, isLoading, isError } = useQuery<ActionItem[]>({
    queryKey: ["action-items", statusFilter, priorityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (priorityFilter) params.append("priority", priorityFilter);
      return apiRequest(`/api/action-items/?${params.toString()}`);
    },
  });
  const { data: staffOptions = [] } = useQuery<StaffOption[]>({
    queryKey: ["action-item-staff-options"],
    queryFn: () => apiRequest("/api/meetings/directory/staff-options"),
    enabled: Boolean(canEdit),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, string | null> }) =>
      apiRequest(`/api/action-items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-items"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/action-items/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["action-items"] }),
  });

  if (!user) return null;

  const pendingCount = items?.filter(i => i.status === "pending").length ?? 0;
  const inProgressCount = items?.filter(i => i.status === "in_progress").length ?? 0;
  const completedCount = items?.filter(i => i.status === "completed").length ?? 0;
  const responsibleSuggestions = Array.from(new Set([
    ...staffOptions.map((staff) => staff.name),
    ...(items || []).map((item) => item.assignee_name).filter((name): name is string => Boolean(name)),
    user.full_name,
  ])).sort((a,b) => a.localeCompare(b));

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold text-gray-900">Action Items Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">Track extracted and manually created action items across all meetings.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          {[
            { label: "Pending", count: pendingCount, icon: <Circle size={20} className="text-gray-500" />, color: "border-gray-200" },
            { label: "In Progress", count: inProgressCount, icon: <PlayCircle size={20} className="text-blue-600" />, color: "border-blue-200" },
            { label: "Completed", count: completedCount, icon: <CheckCircle size={20} className="text-green-600" />, color: "border-green-200" },
          ].map(stat => (
            <div key={stat.label} className={`flex items-center space-x-3 rounded-lg border bg-white p-4 shadow-sm ${stat.color}`}>
              {stat.icon}<div><p className="text-2xl font-bold text-gray-900">{stat.count}</p><p className="text-xs text-gray-500">{stat.label}</p></div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4">
          <Filter size={16} className="shrink-0 text-gray-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"><option value="">All Statuses</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"><option value="">All Priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </div>

        {isLoading && <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16"><RefreshCw className="mr-3 animate-spin text-blue-700" size={22} /><span className="text-sm text-gray-500">Loading action items...</span></div>}
        {isError && <div className="flex items-center space-x-2 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle size={16} /><span>Failed to load action items</span></div>}
        {items && items.length === 0 && <div className="rounded-lg border border-gray-200 bg-white py-16 text-center"><CheckSquare className="mx-auto mb-3 text-gray-300" size={40} /><h4 className="font-bold text-gray-900">No action items found</h4><p className="mt-1 text-xs text-gray-500">Action items are automatically extracted after meetings are transcribed.</p></div>}

        {items && items.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <datalist id="all-responsible-options">{responsibleSuggestions.map((name)=><option key={name} value={name} />)}</datalist>
            <table className="min-w-[940px] w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50"><th className="w-8 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">#</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Action Item</th><th className="w-44 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Responsible</th><th className="w-28 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Priority</th><th className="w-28 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Deadline</th><th className="w-32 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th><th className="w-16"></th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <tr key={item.id} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs text-gray-400">{idx + 1}</td>
                    <td className="max-w-sm px-4 py-3 text-sm leading-relaxed text-gray-900">{item.text}</td>
                    <td className="px-4 py-3">
                      {canEdit ? <input key={`${item.id}-${item.assignee_name || ""}`} list="all-responsible-options" defaultValue={item.assignee_name || ""} onBlur={(event)=>updateMutation.mutate({id:item.id,body:{responsible_name:event.currentTarget.value.trim() || null}})} className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-900" placeholder="Pick or type" /> : <div className="flex items-center space-x-1.5 text-xs text-gray-600"><User size={12} className="text-gray-400" /><span>{item.assignee_name || "Unassigned"}</span></div>}
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_COLORS[item.priority] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{item.priority}</span></td>
                    <td className="px-4 py-3">{item.deadline ? <div className="flex items-center space-x-1 text-xs text-gray-600"><Calendar size={12} className="text-gray-400" /><span>{item.deadline}</span></div> : <span className="text-xs text-gray-400">—</span>}</td>
                    <td className="px-4 py-3">
                      {canEdit && editingId === item.id ? <select value={editStatus} onChange={e => setEditStatus(e.target.value)} onBlur={() => { if (editStatus !== item.status) updateMutation.mutate({ id: item.id, body: { status: editStatus } }); else setEditingId(null); }} autoFocus className="rounded border border-blue-300 px-2 py-1 text-xs focus:outline-none"><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select> : canEdit ? <button onClick={() => { setEditingId(item.id); setEditStatus(item.status); }} className="group flex items-center space-x-1.5 text-xs text-gray-700 hover:text-blue-700">{STATUS_ICONS[item.status] || <Clock size={14} className="text-gray-400" />}<span className="capitalize group-hover:underline">{item.status.replace("_", " ")}</span><Edit2 size={10} className="opacity-0 transition-opacity group-hover:opacity-100" /></button> : <div className="flex items-center gap-1 text-xs capitalize text-gray-600">{STATUS_ICONS[item.status]}{item.status.replace("_", " ")}</div>}
                    </td>
                    <td className="px-4 py-3">{canEdit && <button onClick={() => deleteMutation.mutate(item.id)} className="text-gray-300 transition-colors hover:text-red-500" title="Delete action item"><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
