"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import {
  Calendar,
  Users,
  Video,
  FileText,
  Play,
  Download,
  Edit2,
  Save,
  X,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
  CheckSquare
} from "lucide-react";

interface MeetingDetail {
  id: number;
  title: string;
  description: string | null;
  date: string;
  owner_id: number;
  status: "draft" | "processing" | "completed" | "failed";
  is_archived: boolean;
  participants: Array<{
    id: number;
    name: string;
    email: string | null;
    role_title: string | null;
  }>;
  recording?: {
    id: number;
    filename: string;
    duration_seconds: number | null;
    file_size_bytes: number | null;
  } | null;
}

interface TranscriptSegment {
  id: number;
  start_time: number;
  end_time: number;
  text: string;
  speaker: string | null;
}

interface TranscriptData {
  id: number;
  meeting_id: number;
  content: string;
  segments: TranscriptSegment[];
  revisions: Array<{
    id: number;
    editor: string;
    old_content: string;
    new_content: string;
    reason: string;
    created_at: string;
  }>;
}

export default function MeetingWorkspacePage() {
  const { id } = useParams();
  const meetingId = parseInt(id as string);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"overview" | "recording" | "transcript" | "summary" | "actions">("overview");
  
  // Segment editing states
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Poll intervals for processing state
  const [pollInterval, setPollInterval] = useState<number | false>(false);

  // Fetch meeting details
  const { data: meeting, isLoading: isMeetingLoading, isError: isMeetingError, error: meetingError } = useQuery<MeetingDetail>({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => apiRequest(`/api/meetings/${meetingId}`)
  });

  // Start polling status if the meeting is in processing state
  useEffect(() => {
    if (meeting?.status === "processing") {
      setPollInterval(2000);
    } else {
      setPollInterval(false);
    }
  }, [meeting?.status]);

  // Fetch transcript data (only if meeting completed)
  const { data: transcript, isLoading: isTranscriptLoading, refetch: refetchTranscript } = useQuery<TranscriptData>({
    queryKey: ["meeting-transcript", meetingId],
    queryFn: () => apiRequest(`/api/transcripts/${meetingId}`),
    enabled: meeting?.status === "completed",
    retry: false
  });

  // Poll for meeting updates when processing
  useQuery({
    queryKey: ["meeting-status-poll", meetingId],
    queryFn: async () => {
      const res = await apiRequest(`/api/meetings/${meetingId}`);
      if (res.status !== "processing") {
        queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      }
      return res;
    },
    enabled: pollInterval !== false,
    refetchInterval: pollInterval
  });

  // Segment update mutation
  const updateSegmentMutation = useMutation({
    mutationFn: (data: { segmentId: number; text: string; speaker: string }) =>
      apiRequest(`/api/transcripts/${meetingId}/segments/${data.segmentId}`, {
        method: "PUT",
        body: JSON.stringify({ text: data.text, speaker: data.speaker })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-transcript", meetingId] });
      setEditingSegmentId(null);
      setEditError(null);
    },
    onError: (err: any) => {
      setEditError(err.message || "Failed to update segment");
    }
  });

  // Retry transcription mutation
  const retryMutation = useMutation({
    mutationFn: () => apiRequest(`/api/meetings/${meetingId}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    }
  });

  const handleEditClick = (segment: TranscriptSegment) => {
    setEditingSegmentId(segment.id);
    setEditText(segment.text);
    setEditSpeaker(segment.speaker || "Speaker 1");
    setEditError(null);
  };

  const handleSaveSegment = (segmentId: number) => {
    if (!editText.trim()) {
      setEditError("Segment text cannot be empty");
      return;
    }
    updateSegmentMutation.mutate({ segmentId, text: editText, speaker: editSpeaker });
  };

  const formatDuration = (secs: number | null) => {
    if (!secs) return "00:00";
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  if (!user) return null;

  if (isMeetingLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-lg">
          <RefreshCw className="animate-spin text-blue-700 mb-3" size={24} />
          <p className="text-gray-500 text-sm font-medium">Loading meeting workspace...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isMeetingError || !meeting) {
    return (
      <DashboardLayout>
        <div className="p-5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center space-x-2">
          <AlertTriangle size={18} />
          <span>Error loading workspace: {meetingError?.message || "Internal server error"}</span>
        </div>
      </DashboardLayout>
    );
  }

  const formattedDate = new Date(meeting.date).toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        {/* Meeting Breadcrumb & Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-5 space-y-4 md:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-1">
              <span className="flex items-center space-x-1">
                <Calendar size={14} />
                <span>{formattedDate}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Users size={14} />
                <span>{meeting.participants.length} Attendee{meeting.participants.length !== 1 ? "s" : ""}</span>
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                meeting.status === "completed"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : meeting.status === "failed"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : meeting.status === "processing"
                  ? "bg-blue-50 border-blue-200 text-blue-700 animate-pulse"
                  : "bg-gray-100 border-gray-200 text-gray-600"
              }`}
            >
              Status: {meeting.status}
            </span>
          </div>
        </div>

        {/* Tab Headers */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4">
            {(["overview", "recording", "transcript", "summary", "actions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors uppercase tracking-wider ${
                  activeTab === tab
                    ? "border-blue-700 text-blue-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Contents */}
        <div className="w-full">
          
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded">
                  {meeting.description || "No description provided."}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center space-x-2">
                  <Users size={20} className="text-gray-500" />
                  <span>Attendees List</span>
                </h3>
                {meeting.participants.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No attendees added to metadata.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {meeting.participants.map((participant) => (
                      <div key={participant.id} className="p-3 bg-gray-50 rounded border border-gray-100 flex flex-col">
                        <span className="font-semibold text-sm text-gray-900">{participant.name}</span>
                        {participant.role_title && <span className="text-xs text-gray-500">{participant.role_title}</span>}
                        {participant.email && <span className="text-xs text-blue-700 mt-1">{participant.email}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Failed Job Banner & Trigger */}
              {meeting.status === "failed" && (
                <div className="p-4 bg-red-50 border border-red-200 rounded flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 text-red-800">
                    <AlertTriangle size={24} className="shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm">Transcription Pipeline Failed</h4>
                      <p className="text-xs text-red-600 mt-0.5">Whisper failed to process speech due to environmental constraints.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => retryMutation.mutate()}
                    disabled={retryMutation.isPending}
                    className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white py-1.5 px-4 rounded text-xs font-semibold shrink-0"
                  >
                    <RefreshCw className={retryMutation.isPending ? "animate-spin" : ""} size={14} />
                    <span>Retry Pipeline</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* RECORDING TAB */}
          {activeTab === "recording" && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-5">
              {!meeting.recording ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500">No recording associated with this meeting.</p>
                </div>
              ) : (
                <div className="max-w-xl mx-auto border border-gray-200 rounded-lg p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{meeting.recording.filename}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Duration: {formatDuration(meeting.recording.duration_seconds)} &bull; Size: {meeting.recording.file_size_bytes ? roundSize(meeting.recording.file_size_bytes) : "Unknown"}
                      </p>
                    </div>
                    <div className="p-2 bg-blue-50 text-blue-700 rounded-full">
                      <Play size={20} />
                    </div>
                  </div>

                  {/* Private authorised play streaming audio */}
                  <audio
                    src={`http://localhost:8000/api/recordings/${meeting.recording.id}/play`}
                    controls
                    className="w-full focus:outline-none"
                    controlsList="nodownload"
                  />

                  {/* Authorised Download Option */}
                  <div className="pt-2">
                    <a
                      href={`http://localhost:8000/api/recordings/${meeting.recording.id}/download`}
                      download
                      className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-medium py-2 px-4 rounded text-xs transition-colors"
                    >
                      <Download size={14} />
                      <span>Download File</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TRANSCRIPT TAB */}
          {activeTab === "transcript" && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-6">
              {meeting.status === "processing" ? (
                <div className="text-center py-16">
                  <RefreshCw className="animate-spin text-blue-700 mx-auto mb-3" size={32} />
                  <h4 className="font-bold text-gray-900">Whisper Processing Active</h4>
                  <p className="text-xs text-gray-500 mt-1">Transcribing speech. This tab will populate automatically on completion.</p>
                </div>
              ) : meeting.status === "failed" ? (
                <div className="text-center py-10 text-red-600">
                  <AlertTriangle className="mx-auto mb-2" size={32} />
                  <h4 className="font-bold">No Transcript Available</h4>
                  <p className="text-xs mt-1">Retry the transcription pipeline to generate transcripts.</p>
                </div>
              ) : !transcript || transcript.segments.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="text-gray-300 mx-auto mb-3" size={40} />
                  <h4 className="font-bold text-gray-900">No transcripts found</h4>
                  <p className="text-xs text-gray-500 mt-1">No speech segments are stored for this meeting.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Revision warning / list toggle */}
                  {transcript.revisions.length > 0 && (
                    <div className="text-xs text-gray-500 italic bg-gray-50 p-2.5 rounded border border-gray-200">
                      Modified transcript. Revision log contains {transcript.revisions.length} manuals.
                    </div>
                  )}

                  {/* Segments list */}
                  <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto pr-2">
                    {transcript.segments.map((segment) => (
                      <div key={segment.id} className="py-4 flex flex-col md:flex-row md:items-start gap-3 hover:bg-gray-50/50 px-2 rounded">
                        <div className="w-36 shrink-0 flex flex-col">
                          <span className="font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded self-start">
                            {segment.speaker || "Speaker 1"}
                          </span>
                          <span className="text-[10px] text-gray-400 mt-1">
                            [{formatTime(segment.start_time)} - {formatTime(segment.end_time)}]
                          </span>
                        </div>

                        {editingSegmentId === segment.id ? (
                          <div className="flex-1 space-y-3">
                            {editError && <div className="text-xs text-red-600 font-semibold">{editError}</div>}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={editSpeaker}
                                onChange={(e) => setEditSpeaker(e.target.value)}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Speaker name"
                              />
                            </div>
                            <textarea
                              rows={2}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleSaveSegment(segment.id)}
                                disabled={updateSegmentMutation.isPending}
                                className="flex items-center space-x-1 bg-green-700 hover:bg-green-800 text-white py-1 px-2.5 rounded text-xs font-semibold"
                              >
                                <Save size={12} />
                                <span>{updateSegmentMutation.isPending ? "Saving..." : "Save"}</span>
                              </button>
                              <button
                                onClick={() => setEditingSegmentId(null)}
                                className="flex items-center space-x-1 bg-white border border-gray-300 text-gray-700 py-1 px-2.5 rounded text-xs font-medium hover:bg-gray-50"
                              >
                                <X size={12} />
                                <span>Cancel</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex justify-between items-start group gap-4">
                            <p className="text-sm text-gray-800 leading-relaxed">{segment.text}</p>
                            <button
                              onClick={() => handleEditClick(segment)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-700 transition-opacity rounded"
                              title="Edit Segment"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DRAFT PLACEHOLDER WORKSPACES (NO MOCKS - DISPLAY FROM REAL DATABASE STATE) */}
          {activeTab === "summary" && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 text-center py-16">
              <FileSpreadsheet className="text-gray-300 mx-auto mb-3" size={40} />
              <h4 className="font-bold text-gray-900">Summary Workspace</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                TextRank extractive summarization will populate this workspace on Phase 3 integration.
              </p>
            </div>
          )}

          {activeTab === "actions" && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 text-center py-16">
              <CheckSquare className="text-gray-300 mx-auto mb-3" size={40} />
              <h4 className="font-bold text-gray-900">Action Items Workspace</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Action items assignment and candidate extraction will populate this workspace on Phase 3 integration.
              </p>
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}

function roundSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
