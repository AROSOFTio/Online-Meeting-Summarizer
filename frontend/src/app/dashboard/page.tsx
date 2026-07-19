"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import {
  Video,
  Clock,
  Briefcase,
  Users,
  HardDrive,
  AlertCircle,
  PlusCircle,
  ArrowRight,
  Mic
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

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
  recent_meetings: Array<{
    id: number;
    title: string;
    date: string;
    status: string;
    owner: string;
  }>;
  overdue_action_items: Array<{
    id: number;
    description: string;
    deadline: string | null;
    assignee: string;
  }>;
  staff_assigned_action_items: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  
  const { data: stats, isLoading, isError, error } = useQuery<StatsResponse>({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiRequest("/api/stats")
  });

  if (!user) return null;
  const isAdmin = user.role === "admin";
  const canEditMinutes = isAdmin || user.role === "minute_secretary";

  // Prepare chart data for action item progress
  const chartData = stats
    ? [
        { name: "Open Actions", count: stats.open_action_items },
        { name: "Completed Actions", count: stats.completed_action_items }
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-[#e5e7eb] pb-5 space-y-4 md:space-y-0">
          <div>
            <h1 className="break-words text-xl font-bold text-gray-900 sm:text-2xl">
              Welcome back, {user.full_name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Starlight Secondary School &bull; Amuria District
            </p>
          </div>
          {canEditMinutes && <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:items-center">
            <Link
              href="/meetings/new"
              className="flex items-center justify-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800"
            >
              <PlusCircle size={16} />
              <span>New Meeting</span>
            </Link>
            <Link
              href="/meetings/record"
              className="flex items-center justify-center gap-2 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Mic size={16} />
              <span>Record Live</span>
            </Link>
          </div>}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-lg">
            <div className="w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 mt-4 text-sm font-medium">Calculating database statistics...</p>
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            Failed to load dashboard metrics: {error?.message || "Internal server error"}
          </div>
        )}

        {/* Dashboards Contents */}
        {stats && (
          <>
            {/* Stat Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white p-5 border border-[#e5e7eb] rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Total Meetings</span>
                  <div className="p-2 bg-blue-50 text-blue-700 rounded">
                    <Video size={20} />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-2xl font-bold text-gray-900">{stats.total_meetings}</h3>
                  <span className="text-xs text-gray-500">
                    {stats.meetings_this_month} this month
                  </span>
                </div>
              </div>

              <div className="bg-white p-5 border border-[#e5e7eb] rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Recorded Hours</span>
                  <div className="p-2 bg-blue-50 text-blue-700 rounded">
                    <Clock size={20} />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-2xl font-bold text-gray-900">{stats.recorded_hours}h</h3>
                  <span className="text-xs text-gray-500">Total speech audio stored</span>
                </div>
              </div>

              <div className="bg-white p-5 border border-[#e5e7eb] rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">
                    {isAdmin ? "Active Staff" : "Assigned Action Items"}
                  </span>
                  <div className="p-2 bg-blue-50 text-blue-700 rounded">
                    {isAdmin ? <Users size={20} /> : <Briefcase size={20} />}
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-2xl font-bold text-gray-900">
                    {isAdmin ? stats.active_staff : stats.staff_assigned_action_items}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {isAdmin ? "Registered school accounts" : "Assigned to you"}
                  </span>
                </div>
              </div>

              <div className="bg-white p-5 border border-[#e5e7eb] rounded-lg shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Storage Usage</span>
                  <div className="p-2 bg-blue-50 text-blue-700 rounded">
                    <HardDrive size={20} />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-2xl font-bold text-gray-900">{stats.storage_usage_mb} MB</h3>
                  <span className="text-xs text-gray-500">Recordings directory size</span>
                </div>
              </div>
            </div>

            {/* Jobs status row */}
            {(stats.pending_jobs > 0 || stats.failed_jobs > 0) && (
              <div className="flex flex-col gap-3 rounded-lg border border-[#e5e7eb] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="text-blue-700" size={24} />
                  <div>
                    <h4 className="font-semibold text-gray-900">Active Transcription Tasks</h4>
                    <p className="text-xs text-gray-500">
                      {stats.pending_jobs} processing, {stats.failed_jobs} failed.
                    </p>
                  </div>
                </div>
                <Link
                  href="/meetings"
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center space-x-1"
                >
                  <span>View Details</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            )}

            {/* Main dashboard content area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent meetings list */}
              <div className="rounded-lg border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Recent Meetings</h3>
                  <Link
                    href="/meetings"
                    className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    View All
                  </Link>
                </div>

                {stats.recent_meetings.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-gray-500">No meetings created yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#e5e7eb]">
                    {stats.recent_meetings.map(meeting => (
                      <div key={meeting.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <h4 className="break-words text-sm font-medium text-gray-900">{meeting.title}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Hosted by {meeting.owner} &bull; {new Date(meeting.date).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold border ${
                            meeting.status === "completed"
                              ? "bg-green-50 border-green-200 text-green-700"
                              : meeting.status === "failed"
                              ? "bg-red-50 border-red-200 text-red-700"
                              : "bg-blue-50 border-blue-200 text-blue-700 animate-pulse"
                          }`}
                        >
                          {meeting.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar Widget (Overdue action items / charts) */}
              <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    {isAdmin ? "Action Items Progress" : "My Overdue Items"}
                  </h3>
                  
                  {isAdmin ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#1e40af" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stats.overdue_action_items.length === 0 ? (
                        <p className="text-sm text-gray-500 py-10 text-center">
                          You have no overdue action items. Good job!
                        </p>
                      ) : (
                        stats.overdue_action_items.map(item => (
                          <div key={item.id} className="p-3 bg-red-50 border border-red-100 rounded text-sm">
                            <p className="font-medium text-red-800">{item.description}</p>
                            <p className="text-xs text-red-500 mt-1">
                              Deadline: {item.deadline ? new Date(item.deadline).toLocaleDateString() : "No date"}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
