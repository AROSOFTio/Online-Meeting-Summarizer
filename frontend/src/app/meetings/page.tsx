"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import {
  Search,
  PlusCircle,
  Calendar,
  Users,
  Video,
  AlertTriangle,
  RefreshCw,
  Clock
} from "lucide-react";

interface MeetingItem {
  id: number;
  title: string;
  description: string | null;
  date: string;
  owner_id: number;
  status: "draft" | "processing" | "completed" | "failed";
  is_archived: boolean;
  created_at: string;
  participants: Array<{
    id: number;
    name: string;
    email: string | null;
  }>;
}

export default function MeetingsDirectoryPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isArchivedFilter, setIsArchivedFilter] = useState(false);

  // Queries matching search and filters
  const { data: meetings, isLoading, isError, error } = useQuery<MeetingItem[]>({
    queryKey: ["meetings-list", searchTerm, statusFilter, isArchivedFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (statusFilter) params.append("status", statusFilter);
      params.append("is_archived", isArchivedFilter ? "true" : "false");
      return apiRequest(`/api/meetings/?${params.toString()}`);
    }
  });

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-5 space-y-4 md:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meeting Directory</h1>
            <p className="text-sm text-gray-500 mt-1">Search, view, and manage all Starlight Secondary School meetings</p>
          </div>
          <Link
            href="/meetings/new"
            className="flex items-center justify-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded text-sm font-medium transition-colors self-start md:self-auto"
          >
            <PlusCircle size={16} />
            <span>New Meeting</span>
          </Link>
        </div>

        {/* Filter bar */}
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-sm flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search title, host, attendee, or transcript content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
            />
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft (No recording)</option>
              <option value="processing">Processing (AI active)</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>

            <label className="flex items-center space-x-2 text-sm text-gray-700 font-medium select-none cursor-pointer">
              <input
                type="checkbox"
                checked={isArchivedFilter}
                onChange={(e) => setIsArchivedFilter(e.target.checked)}
                className="rounded border-gray-300 text-blue-700 focus:ring-blue-500"
              />
              <span>Show Archived</span>
            </label>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-lg">
            <RefreshCw className="animate-spin text-blue-700 mb-3" size={24} />
            <p className="text-gray-500 text-sm font-medium">Retrieving meeting logs...</p>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center space-x-2">
            <AlertTriangle size={18} />
            <span>Failed to load meetings: {error?.message || "Internal server error"}</span>
          </div>
        )}

        {/* Meeting grid */}
        {meetings && (
          <>
            {meetings.length === 0 ? (
              <div className="text-center py-20 bg-white border border-gray-200 rounded-lg">
                <Video className="mx-auto text-gray-300 mb-3" size={40} />
                <h3 className="font-bold text-gray-900 text-base">No meetings found</h3>
                <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
                  Try adjusting your search terms or create a new meeting to begin transcription.
                </p>
                <Link
                  href="/meetings/new"
                  className="inline-flex items-center space-x-2 bg-blue-700 text-white py-1.5 px-4 rounded text-sm font-medium mt-4 hover:bg-blue-800"
                >
                  <PlusCircle size={16} />
                  <span>New Meeting</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div className="p-5 space-y-4">
                      {/* Card Top Title & Status */}
                      <div className="flex items-start justify-between">
                        <h3 className="font-bold text-gray-950 text-base line-clamp-2" title={meeting.title}>
                          {meeting.title}
                        </h3>
                        <span
                          className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                            meeting.status === "completed"
                              ? "bg-green-50 border-green-200 text-green-700"
                              : meeting.status === "failed"
                              ? "bg-red-50 border-red-200 text-red-700"
                              : meeting.status === "processing"
                              ? "bg-blue-50 border-blue-200 text-blue-700 animate-pulse"
                              : "bg-gray-100 border-gray-200 text-gray-600"
                          }`}
                        >
                          {meeting.status}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-gray-500 text-xs line-clamp-3">
                        {meeting.description || "No description provided."}
                      </p>

                      {/* Card Metadata */}
                      <div className="space-y-1.5 text-xs text-gray-600 pt-2">
                        <div className="flex items-center space-x-2">
                          <Calendar size={14} className="text-gray-400" />
                          <span>{new Date(meeting.date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Users size={14} className="text-gray-400" />
                          <span>{meeting.participants.length} Attendee{meeting.participants.length !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 rounded-b-lg flex items-center justify-between">
                      <Link
                        href={`/meetings/${meeting.id}`}
                        className="text-xs font-bold text-blue-700 hover:text-blue-800 hover:underline"
                      >
                        View Workspace
                      </Link>
                      {meeting.status === "processing" && (
                        <div className="flex items-center space-x-1.5 text-[10px] text-blue-600 font-semibold uppercase animate-pulse">
                          <Clock size={12} />
                          <span>Processing</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
