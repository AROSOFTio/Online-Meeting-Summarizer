"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  RefreshCw,
  Filter,
  Edit2,
  Trash2,
  CheckCircle,
  Circle,
  PlayCircle,
  Calendar,
  User
} from "lucide-react";

interface ActionItem {
  id: number;
  meeting_id: number;
  text: string;
  assignee_id: number | null;
  assignee_name: string | null;
  priority: string;
  deadline: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

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
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, string> }) =>
      apiRequest(`/api/action-items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-items"] });
      setEditingId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/action-items/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["action-items"] })
  });

  if (!user) return null;

  const pendingCount = items?.filter(i => i.status === "pending").length ?? 0;
  const inProgressCount = items?.filter(i => i.status === "in_progress").length ?? 0;
  const completedCount = items?.filter(i => i.status === "completed").length ?? 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold text-gray-900">Action Items Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track all extracted and manually created action items across all meetings
          </p>
        </div>

        {/* Summary counts */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Pending", count: pendingCount, icon: <Circle size={20} className="text-gray-500" />, color: "border-gray-200" },
            { label: "In Progress", count: inProgressCount, icon: <PlayCircle size={20} className="text-blue-600" />, color: "border-blue-200" },
            { label: "Completed", count: completedCount, icon: <CheckCircle size={20} className="text-green-600" />, color: "border-green-200" },
          ].map(stat => (
            <div key={stat.label} className={`bg-white border ${stat.color} rounded-lg p-4 flex items-center space-x-3 shadow-sm`}>
              {stat.icon}
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 shadow-sm">
          <Filter size={16} className="text-gray-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 bg-white border border-gray-200 rounded-lg">
            <RefreshCw className="animate-spin text-blue-700 mr-3" size={22} />
            <span className="text-sm text-gray-500">Loading action items...</span>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded flex items-center space-x-2">
            <AlertTriangle size={16} />
            <span>Failed to load action items</span>
          </div>
        )}

        {/* Items table */}
        {items && items.length === 0 && (
          <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
            <CheckSquare className="text-gray-300 mx-auto mb-3" size={40} />
            <h4 className="font-bold text-gray-900">No action items found</h4>
            <p className="text-xs text-gray-500 mt-1">Action items are automatically extracted after meetings are transcribed.</p>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Assignee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Deadline</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-900 text-sm leading-relaxed max-w-sm">
                      {item.text}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1.5 text-gray-600 text-xs">
                        <User size={12} className="text-gray-400" />
                        <span>{item.assignee_name || "Unassigned"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[item.priority] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.deadline ? (
                        <div className="flex items-center space-x-1 text-xs text-gray-600">
                          <Calendar size={12} className="text-gray-400" />
                          <span>{item.deadline}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === item.id ? (
                        <select
                          value={editStatus}
                          onChange={e => setEditStatus(e.target.value)}
                          onBlur={() => {
                            if (editStatus !== item.status) {
                              updateMutation.mutate({ id: item.id, body: { status: editStatus } });
                            } else {
                              setEditingId(null);
                            }
                          }}
                          autoFocus
                          className="text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      ) : (
                        <button
                          onClick={() => { setEditingId(item.id); setEditStatus(item.status); }}
                          className="flex items-center space-x-1.5 text-xs text-gray-700 hover:text-blue-700 group"
                        >
                          {STATUS_ICONS[item.status] || <Clock size={14} className="text-gray-400" />}
                          <span className="group-hover:underline capitalize">{item.status.replace("_", " ")}</span>
                          <Edit2 size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="Delete action item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
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
