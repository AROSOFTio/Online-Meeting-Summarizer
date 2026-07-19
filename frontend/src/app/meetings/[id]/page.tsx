"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import {
  Calendar,
  Users,
  FileText,
  Play,
  Download,
  Edit2,
  Save,
  X,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
  CheckSquare,
  Sparkles,
  CheckCircle,
  Lightbulb,
  Gavel,
  Trash2,
  Plus
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

interface SummaryData {
  text: string;
  key_points: string[];
  decisions: Array<{ id: number; text: string }>;
}

interface FinalMinutesStatus {
  is_final: boolean;
  finalized_at: number | null;
  download_url: string | null;
}

interface ActionItemData {
  id: number;
  text: string;
  priority: "low" | "medium" | "high";
  deadline: string | null;
  status: "pending" | "in_progress" | "completed";
}

type ActionItemUpdate = Partial<Pick<ActionItemData, "priority" | "deadline" | "status">>;

export default function MeetingWorkspacePage() {
  const { id } = useParams();
  const router = useRouter();
  const meetingId = parseInt(id as string);
  const hasValidMeetingId = Number.isInteger(meetingId) && meetingId > 0;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"overview" | "recording" | "transcript" | "summary" | "actions">("overview");
  
  // Segment editing states
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Summary editing states
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [newDecision, setNewDecision] = useState("");
  const [showDecisionInput, setShowDecisionInput] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [meetingDraft, setMeetingDraft] = useState({ title: "", description: "", date: "" });

  // Fetch meeting details
  const { data: meeting, isLoading: isMeetingLoading, isError: isMeetingError, error: meetingError } = useQuery<MeetingDetail>({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => apiRequest(`/api/meetings/${meetingId}`),
    enabled: hasValidMeetingId
  });

  const pollInterval = meeting?.status === "processing" ? 2000 : false;

  // Fetch transcript data (only if meeting completed)
  const { data: transcript } = useQuery<TranscriptData>({
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
    onError: (err: unknown) => {
      setEditError(err instanceof Error ? err.message : "Failed to update segment");
    }
  });

  // Retry transcription mutation
  const retryMutation = useMutation({
    mutationFn: () => apiRequest(`/api/meetings/${meetingId}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
    }
  });

  const updateMeetingMutation = useMutation({
    mutationFn: () => apiRequest(`/api/meetings/${meetingId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: meetingDraft.title,
        description: meetingDraft.description,
        date: new Date(meetingDraft.date).toISOString(),
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      setEditingMeeting(false);
    },
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: () => apiRequest(`/api/meetings/${meetingId}?permanent=true`, { method: "DELETE" }),
    onSuccess: () => router.push("/meetings"),
  });

  const deleteMinutesMutation = useMutation({
    mutationFn: () => apiRequest(`/api/summaries/${meetingId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.removeQueries({ queryKey: ["meeting-summary", meetingId] }),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/meetings/${meetingId}/finalize?share=true`, { method: "POST" }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["final-minutes", meetingId] });
      if (result.delivery_error) {
        window.alert(`Final PDF saved, but email delivery failed: ${result.delivery_error}`);
      } else {
        window.alert(`Final PDF saved and emailed to ${result.delivered} participant(s).`);
      }
    },
  });

  // ── Phase 3: Summary queries & mutations ──────────────────────────────
  const { data: summaryData, isLoading: isSummaryLoading } = useQuery<SummaryData>({
    queryKey: ["meeting-summary", meetingId],
    queryFn: () => apiRequest(`/api/summaries/${meetingId}`),
    enabled: meeting?.status === "completed" && activeTab === "summary",
    retry: false
  });

  const { data: finalMinutes } = useQuery<FinalMinutesStatus>({
    queryKey: ["final-minutes", meetingId],
    queryFn: () => apiRequest(`/api/meetings/${meetingId}/final-minutes/status`),
    enabled: hasValidMeetingId,
  });

  const generateSummaryMutation = useMutation({
    mutationFn: () => apiRequest(`/api/summaries/${meetingId}/generate`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-summary", meetingId] })
  });

  const saveSummaryMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest(`/api/summaries/${meetingId}`, {
        method: "PUT",
        body: JSON.stringify({ text })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-summary", meetingId] });
      setEditingSummary(false);
    }
  });

  const addDecisionMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest(`/api/summaries/${meetingId}/decisions`, {
        method: "POST",
        body: JSON.stringify({ text })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-summary", meetingId] });
      setNewDecision("");
      setShowDecisionInput(false);
    }
  });

  const deleteDecisionMutation = useMutation({
    mutationFn: (decisionId: number) =>
      apiRequest(`/api/summaries/${meetingId}/decisions/${decisionId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-summary", meetingId] })
  });

  // ── Phase 3: Action items queries & mutations ──────────────────────────
  const { data: actionItems, isLoading: isActionsLoading } = useQuery<ActionItemData[]>({
    queryKey: ["meeting-actions", meetingId],
    queryFn: () => apiRequest(`/api/action-items/?meeting_id=${meetingId}`),
    enabled: meeting?.status === "completed" && activeTab === "actions",
    retry: false
  });

  const updateActionMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: ActionItemUpdate }) =>
      apiRequest(`/api/action-items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-actions", meetingId] })
  });

  const deleteActionMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/action-items/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-actions", meetingId] })
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
            <button
              onClick={() => {
                setMeetingDraft({
                  title: meeting.title,
                  description: meeting.description || "",
                  date: meeting.date.slice(0, 10),
                });
                setEditingMeeting(true);
              }}
              className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Edit2 size={13} /> Edit
            </button>
            <button
              onClick={() => {
                if (window.confirm("Permanently delete this meeting, recording, transcript and minutes? This cannot be undone.")) {
                  deleteMeetingMutation.mutate();
                }
              }}
              disabled={deleteMeetingMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 size={13} /> Delete
            </button>
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

        {editingMeeting && (
          <form
            onSubmit={(event) => { event.preventDefault(); updateMeetingMutation.mutate(); }}
            className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm space-y-4"
          >
            <h2 className="font-semibold text-gray-900">Edit meeting details</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                required
                minLength={3}
                value={meetingDraft.title}
                onChange={(event) => setMeetingDraft((value) => ({ ...value, title: event.target.value }))}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
                placeholder="Meeting title"
              />
              <input
                required
                type="date"
                value={meetingDraft.date}
                onChange={(event) => setMeetingDraft((value) => ({ ...value, date: event.target.value }))}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <textarea
              rows={3}
              value={meetingDraft.description}
              onChange={(event) => setMeetingDraft((value) => ({ ...value, description: event.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
              placeholder="Purpose, agenda or description"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={updateMeetingMutation.isPending} className="rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
                {updateMeetingMutation.isPending ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={() => setEditingMeeting(false)} className="rounded border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700">Cancel</button>
            </div>
          </form>
        )}

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
                    src={`/api/recordings/${meeting.recording.id}/play`}
                    controls
                    className="w-full focus:outline-none"
                    controlsList="nodownload"
                  />

                  {/* Authorised Download Option */}
                  <div className="pt-2">
                    <a
                      href={`/api/recordings/${meeting.recording.id}/download`}
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

          {/* ── SUMMARY TAB ────────────────────────────────────────────── */}
          {activeTab === "summary" && (
            <div className="space-y-5">
              {/* Generate / Regenerate Button */}
              {meeting.status === "completed" && (
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
                  <p className="text-sm text-gray-600">
                    {summaryData ? "Professional minutes generated from the verified transcript." : "No minutes generated yet."}
                  </p>
                  <div className="flex items-center space-x-2">
                    {/* Export buttons */}
                    {summaryData && ["pdf", "docx"].map(fmt => (
                      <a
                        key={fmt}
                        href={`/api/meetings/${meetingId}/export?format=${fmt}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center space-x-1 px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded text-xs font-medium"
                      >
                        <Download size={12} />
                        <span>{fmt.toUpperCase()}</span>
                      </a>
                    ))}
                    {summaryData && user?.role === "admin" && (
                      <button
                        onClick={() => {
                          if (window.confirm("Mark these minutes as final and email the final PDF to every participant with an email address?")) {
                            finalizeMutation.mutate();
                          }
                        }}
                        disabled={finalizeMutation.isPending}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-green-700 text-white hover:bg-green-800 rounded text-xs font-semibold"
                      >
                        <CheckCircle size={12} />
                        <span>{finalizeMutation.isPending ? "Finalizing..." : "Finalize & Share"}</span>
                      </button>
                    )}
                    {finalMinutes?.is_final && (
                      <a
                        href={finalMinutes.download_url || `/api/meetings/${meetingId}/final-minutes`}
                        className="flex items-center space-x-1 px-3 py-1.5 border border-green-300 text-green-700 hover:bg-green-50 rounded text-xs font-medium"
                      >
                        <Download size={12} />
                        <span>Download Final Copy</span>
                      </a>
                    )}
                    {summaryData && (
                      <button
                        onClick={() => {
                          if (window.confirm("Delete the generated minutes? The meeting and transcript will be kept.")) {
                            deleteMinutesMutation.mutate();
                          }
                        }}
                        className="flex items-center space-x-1 px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded text-xs font-medium"
                      >
                        <Trash2 size={12} />
                        <span>Delete minutes</span>
                      </button>
                    )}
                    <button
                      onClick={() => generateSummaryMutation.mutate()}
                      disabled={generateSummaryMutation.isPending}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded text-xs font-semibold"
                    >
                      <Sparkles size={13} />
                      <span>{generateSummaryMutation.isPending ? "Generating..." : summaryData ? "Re-generate Minutes" : "Generate Minutes"}</span>
                    </button>
                  </div>
                </div>
              )}

              {meeting.status !== "completed" && (
                <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
                  <FileSpreadsheet className="text-gray-300 mx-auto mb-3" size={36} />
                  <p className="text-sm text-gray-500">Complete transcription first to generate a summary.</p>
                </div>
              )}

              {isSummaryLoading && (
                <div className="flex justify-center py-10">
                  <RefreshCw className="animate-spin text-blue-700" size={22} />
                </div>
              )}

              {summaryData && (
                <>
                  {/* Summary Text */}
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                      <h3 className="font-semibold text-sm text-gray-900">Executive Summary</h3>
                      {!editingSummary && (
                        <button
                          onClick={() => { setEditingSummary(true); setSummaryDraft(summaryData.text); }}
                          className="flex items-center space-x-1 text-xs text-gray-500 hover:text-blue-700"
                        >
                          <Edit2 size={12} /><span>Edit</span>
                        </button>
                      )}
                    </div>
                    <div className="p-5">
                      {editingSummary ? (
                        <div className="space-y-3">
                          <textarea
                            rows={6}
                            value={summaryDraft}
                            onChange={e => setSummaryDraft(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={() => saveSummaryMutation.mutate(summaryDraft)}
                              disabled={saveSummaryMutation.isPending}
                              className="flex items-center space-x-1 bg-blue-700 hover:bg-blue-800 text-white text-xs px-3 py-1.5 rounded font-semibold"
                            >
                              <Save size={12} /><span>{saveSummaryMutation.isPending ? "Saving..." : "Save"}</span>
                            </button>
                            <button
                              onClick={() => setEditingSummary(false)}
                              className="flex items-center space-x-1 bg-white border border-gray-300 text-gray-700 text-xs px-3 py-1.5 rounded"
                            >
                              <X size={12} /><span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 leading-relaxed">{summaryData.text}</p>
                      )}
                    </div>
                  </div>

                  {/* Key Points */}
                  {summaryData.key_points?.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                      <div className="flex items-center space-x-2 px-5 py-3 border-b border-gray-100">
                        <Lightbulb size={14} className="text-yellow-500" />
                        <h3 className="font-semibold text-sm text-gray-900">Key Points</h3>
                      </div>
                      <div className="p-5 flex flex-wrap gap-2">
                        {summaryData.key_points.map((kp: string, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-800 text-xs rounded-full border border-blue-100">{kp}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Decisions */}
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                      <div className="flex items-center space-x-2">
                        <Gavel size={14} className="text-gray-500" />
                        <h3 className="font-semibold text-sm text-gray-900">Decisions ({summaryData.decisions?.length ?? 0})</h3>
                      </div>
                      <button
                        onClick={() => setShowDecisionInput(v => !v)}
                        className="flex items-center space-x-1 text-xs text-blue-700 hover:underline"
                      >
                        <Plus size={12} /><span>Add</span>
                      </button>
                    </div>
                    <div className="p-5 space-y-2">
                      {showDecisionInput && (
                        <div className="flex space-x-2 mb-3">
                          <input
                            type="text"
                            value={newDecision}
                            onChange={e => setNewDecision(e.target.value)}
                            placeholder="Type decision..."
                            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => { if (newDecision.trim()) addDecisionMutation.mutate(newDecision.trim()); }}
                            disabled={addDecisionMutation.isPending || !newDecision.trim()}
                            className="px-3 py-1.5 bg-blue-700 text-white text-xs rounded font-semibold hover:bg-blue-800"
                          >
                            Add
                          </button>
                        </div>
                      )}
                      {summaryData.decisions?.length === 0 && (
                        <p className="text-xs text-gray-400">No decisions extracted. Add one manually above.</p>
                      )}
                      {summaryData.decisions?.map((d) => (
                        <div key={d.id} className="flex items-start justify-between group py-2 border-b border-gray-50 last:border-0">
                          <div className="flex items-start space-x-2">
                            <CheckCircle size={14} className="text-green-600 mt-0.5 shrink-0" />
                            <p className="text-sm text-gray-800">{d.text}</p>
                          </div>
                          <button
                            onClick={() => deleteDecisionMutation.mutate(d.id)}
                            className="opacity-0 group-hover:opacity-100 ml-3 text-gray-300 hover:text-red-500 transition-opacity shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── ACTIONS TAB ─────────────────────────────────────────────── */}
          {activeTab === "actions" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm text-gray-600">Action items extracted from transcript. Click status to update inline.</p>
                <a href="/action-items" className="text-xs text-blue-700 hover:underline font-medium">View all →</a>
              </div>

              {isActionsLoading && (
                <div className="flex justify-center py-10">
                  <RefreshCw className="animate-spin text-blue-700" size={22} />
                </div>
              )}

              {actionItems && actionItems.length === 0 && (
                <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
                  <CheckSquare className="text-gray-300 mx-auto mb-3" size={36} />
                  <p className="text-sm text-gray-500">No action items found. Generate a summary first.</p>
                </div>
              )}

              {actionItems && actionItems.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action Item</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Priority</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Deadline</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Status</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {actionItems.map((item, idx: number) => (
                        <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 text-gray-900 text-sm leading-relaxed max-w-xs">{item.text}</td>
                          <td className="px-4 py-3">
                            <select
                              value={item.priority}
                              onChange={e => updateActionMutation.mutate({
                                id: item.id,
                                body: { priority: e.target.value as ActionItemData["priority"] }
                              })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
                            >
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              defaultValue={item.deadline || ""}
                              onBlur={e => updateActionMutation.mutate({ id: item.id, body: { deadline: e.target.value || null } })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none w-full"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.status}
                              onChange={e => updateActionMutation.mutate({
                                id: item.id,
                                body: { status: e.target.value as ActionItemData["status"] }
                              })}
                              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
                            >
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => deleteActionMutation.mutate(item.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
