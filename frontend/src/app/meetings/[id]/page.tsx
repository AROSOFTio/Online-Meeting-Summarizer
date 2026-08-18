"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Calendar, CheckCircle, Download, FileText, Mail, Mic,
  RefreshCw, Save, Sparkles, Users,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface Recording { id: number; filename: string; duration_seconds: number | null; file_size_bytes: number | null; mime_type: string | null; }
interface Meeting { id: number; title: string; description: string | null; date: string; owner_id: number; status: "draft" | "processing" | "completed" | "failed"; participants: Array<{id:number;name:string;email:string|null;role_title:string|null}>; recording: Recording | null; }
interface Attendance { id:number; name:string; email:string|null; role_title:string|null; attendance_status:"present"|"absent"|"apology"|"invited"; }
interface Segment { id:number; start_time:number; end_time:number; text:string; speaker:string|null; }
interface Transcript { id:number; content:string; segments:Segment[]; revisions:Array<{id:number;editor:string;reason:string;created_at:string}>; }
interface Summary { id:number; text:string; key_points:string[]; decisions:Array<{id:number;text:string}>; }
interface ActionItem { id:number; text:string; assignee_name:string|null; priority:"low"|"medium"|"high"; deadline:string|null; status:"pending"|"in_progress"|"completed"; }

type Tab = "overview" | "recording" | "transcript" | "minutes" | "actions";

const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2,"0")}:${Math.floor(seconds % 60).toString().padStart(2,"0")}`;
const fileSize = (bytes: number | null) => !bytes ? "Unknown size" : bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;

export default function MeetingWorkspacePage() {
  const params = useParams<{ id: string }>();
  const meetingId = Number(params.id);
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "minute_secretary";
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [editingSegment, setEditingSegment] = useState<number | null>(null);
  const [segmentText, setSegmentText] = useState("");
  const [segmentSpeaker, setSegmentSpeaker] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");

  const meetingQuery = useQuery<Meeting>({
    queryKey: ["meeting", meetingId],
    queryFn: () => apiRequest(`/api/meetings/${meetingId}`),
    enabled: Number.isInteger(meetingId) && meetingId > 0,
    refetchInterval: (query) => (query.state.data as Meeting | undefined)?.status === "processing" ? 2500 : false,
  });
  const meeting = meetingQuery.data;

  const attendanceQuery = useQuery<Attendance[]>({ queryKey:["attendance",meetingId], queryFn:()=>apiRequest(`/api/meetings/${meetingId}/attendance`), enabled:Boolean(meeting) });
  const transcriptQuery = useQuery<Transcript>({ queryKey:["transcript",meetingId], queryFn:()=>apiRequest(`/api/transcripts/${meetingId}`), enabled:meeting?.status === "completed", retry:false });
  const summaryQuery = useQuery<Summary>({ queryKey:["summary",meetingId], queryFn:()=>apiRequest(`/api/summaries/${meetingId}`), enabled:meeting?.status === "completed", retry:false });
  const actionsQuery = useQuery<ActionItem[]>({ queryKey:["actions",meetingId], queryFn:()=>apiRequest(`/api/action-items/?meeting_id=${meetingId}`), enabled:meeting?.status === "completed", retry:false });

  const retryMutation = useMutation({ mutationFn:()=>apiRequest(`/api/meetings/${meetingId}/retry`,{method:"POST"}), onSuccess:()=>queryClient.invalidateQueries({queryKey:["meeting",meetingId]}) });
  const attendanceMutation = useMutation({ mutationFn:(value:{id:number;status:Attendance["attendance_status"]})=>apiRequest(`/api/meetings/${meetingId}/attendance/${value.id}`,{method:"PUT",body:JSON.stringify({attendance_status:value.status})}), onSuccess:()=>queryClient.invalidateQueries({queryKey:["attendance",meetingId]}) });
  const segmentMutation = useMutation({ mutationFn:(value:{id:number;text:string;speaker:string})=>apiRequest(`/api/transcripts/${meetingId}/segments/${value.id}`,{method:"PUT",body:JSON.stringify({text:value.text,speaker:value.speaker})}), onSuccess:()=>{setEditingSegment(null);queryClient.invalidateQueries({queryKey:["transcript",meetingId]});} });
  const summaryMutation = useMutation({ mutationFn:(text:string)=>apiRequest(`/api/summaries/${meetingId}`,{method:"PUT",body:JSON.stringify({text})}), onSuccess:()=>{setEditingSummary(false);queryClient.invalidateQueries({queryKey:["summary",meetingId]});} });
  const regenerateMutation = useMutation({ mutationFn:()=>apiRequest(`/api/summaries/${meetingId}/generate`,{method:"POST"}), onSuccess:()=>{queryClient.invalidateQueries({queryKey:["summary",meetingId]});queryClient.invalidateQueries({queryKey:["actions",meetingId]});} });
  const actionMutation = useMutation({ mutationFn:(value:{id:number;status:ActionItem["status"]})=>apiRequest(`/api/action-items/${value.id}`,{method:"PUT",body:JSON.stringify({status:value.status})}), onSuccess:()=>queryClient.invalidateQueries({queryKey:["actions",meetingId]}) });
  const finalizeMutation = useMutation({ mutationFn:()=>apiRequest(`/api/meetings/${meetingId}/finalize?share=true`,{method:"POST"}), onSuccess:(data)=>window.alert(data.delivery_error ? `Final minutes saved. Email delivery warning: ${data.delivery_error}` : `Final minutes saved and sent to ${data.delivered} participant(s).`) });

  if (meetingQuery.isLoading) return <DashboardLayout><div className="rounded-lg border border-gray-200 bg-white py-20 text-center"><RefreshCw className="mx-auto animate-spin text-blue-700"/><p className="mt-3 text-sm text-gray-500">Loading meeting workspace...</p></div></DashboardLayout>;
  if (meetingQuery.isError || !meeting) return <DashboardLayout><div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not load meeting: {meetingQuery.error?.message || "Meeting not found"}</div></DashboardLayout>;

  const tabs: Array<[Tab,string]> = [["overview","Overview"],["recording","Recording"],["transcript","Transcript"],["minutes","Minutes"],["actions","Action Items"]];

  return <DashboardLayout><div className="space-y-5">
    <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 md:flex-row md:items-start md:justify-between">
      <div><Link href="/meetings" className="text-xs font-semibold text-blue-700">← Meeting Directory</Link><h1 className="mt-2 break-words text-2xl font-bold text-gray-900">{meeting.title}</h1><div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500"><span className="flex items-center gap-1"><Calendar size={14}/>{new Date(meeting.date).toLocaleDateString(undefined,{dateStyle:"long"})}</span><span className="flex items-center gap-1"><Users size={14}/>{meeting.participants.length} participants</span><span className={`rounded-full px-2 py-0.5 font-semibold ${meeting.status === "completed" ? "bg-green-50 text-green-700" : meeting.status === "failed" ? "bg-red-50 text-red-700" : meeting.status === "processing" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{meeting.status}</span></div></div>
      <div className="flex flex-wrap gap-2">{canEdit && <Link href={`/meetings/${meeting.id}/invite`} className="inline-flex items-center gap-1 rounded border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"><Mail size={14}/>Invite Participants</Link>}<a href={`/api/meetings/${meeting.id}/export?format=pdf`} className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><Download size={14}/>PDF</a><a href={`/api/meetings/${meeting.id}/export?format=docx`} className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><Download size={14}/>Word</a></div>
    </div>

    {meeting.status === "processing" && <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><RefreshCw className="animate-spin" size={18}/><div><b>Gemini AI processing is active.</b><div className="text-xs">The workspace refreshes automatically when the transcript and minutes are ready.</div></div></div>}
    {meeting.status === "failed" && <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3 text-red-800"><AlertTriangle size={20}/><div><b className="text-sm">Processing failed</b><p className="text-xs text-red-600">Retry the same meeting. A new meeting record will not be created.</p></div></div>{canEdit && <button onClick={()=>retryMutation.mutate()} disabled={retryMutation.isPending} className="rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className={`mr-1 inline ${retryMutation.isPending?"animate-spin":""}`} size={13}/>Retry Pipeline</button>}</div>}

    <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">{tabs.map(([value,label])=><button key={value} onClick={()=>setTab(value)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab===value?"border-blue-700 text-blue-700":"border-transparent text-gray-500"}`}>{label}</button>)}</nav>

    {tab === "overview" && <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div><h2 className="font-bold text-gray-900">Agenda / Description</h2><p className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-4 text-sm leading-6 text-gray-600">{meeting.description || "No agenda or description recorded."}</p></div><div><h2 className="mb-3 font-bold text-gray-900">Attendance Register</h2><div className="grid gap-3 md:grid-cols-2">{(attendanceQuery.data||[]).map((person)=><div key={person.id} className="rounded border border-gray-200 p-3"><div className="font-semibold text-gray-900">{person.name}</div><div className="text-xs text-gray-500">{person.role_title || "Member"}</div>{person.email && <div className="mt-1 text-xs text-blue-700">{person.email}</div>}{canEdit ? <select value={person.attendance_status} onChange={(event)=>attendanceMutation.mutate({id:person.id,status:event.target.value as Attendance["attendance_status"]})} className="mt-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"><option value="present">Present</option><option value="invited">Invited</option><option value="apology">Apology</option><option value="absent">Absent</option></select> : <div className="mt-2 text-xs font-semibold capitalize text-gray-600">{person.attendance_status}</div>}</div>)}{attendanceQuery.data?.length===0 && <p className="text-sm text-gray-500">No participants recorded.</p>}</div></div></section>}

    {tab === "recording" && <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">{meeting.recording ? <div className="mx-auto max-w-xl space-y-4"><div className="flex items-center gap-3"><Mic className="text-blue-700"/><div><b className="break-all text-sm text-gray-900">{meeting.recording.filename}</b><div className="text-xs text-gray-500">{meeting.recording.duration_seconds ? formatTime(meeting.recording.duration_seconds) : "Duration pending"} · {fileSize(meeting.recording.file_size_bytes)}</div></div></div><audio src={`/api/recordings/${meeting.recording.id}/play`} controls className="w-full"/><a href={`/api/recordings/${meeting.recording.id}/download`} className="inline-flex items-center gap-1 rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white"><Download size={14}/>Download Recording</a></div> : <div className="py-12 text-center text-sm text-gray-500">No recording is attached to this meeting.</div>}</section>}

    {tab === "transcript" && <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">{transcriptQuery.isLoading && <div className="py-12 text-center text-sm text-gray-500">Loading transcript...</div>}{transcriptQuery.isError && <div className="py-12 text-center text-sm text-gray-500">No transcript is available yet.</div>}{transcriptQuery.data?.segments.map((segment)=><div key={segment.id} className="border-b border-gray-100 py-3 last:border-0">{editingSegment===segment.id ? <div className="space-y-2"><input value={segmentSpeaker} onChange={(event)=>setSegmentSpeaker(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"/><textarea value={segmentText} onChange={(event)=>setSegmentText(event.target.value)} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"/><div className="flex gap-2"><button onClick={()=>segmentMutation.mutate({id:segment.id,text:segmentText,speaker:segmentSpeaker})} className="inline-flex items-center gap-1 rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white"><Save size={13}/>Save</button><button onClick={()=>setEditingSegment(null)} className="rounded border border-gray-300 px-3 py-2 text-xs">Cancel</button></div></div> : <div className="flex gap-4"><div className="w-28 shrink-0"><div className="text-xs font-bold text-blue-700">{segment.speaker || "Speaker"}</div><div className="text-[10px] text-gray-400">{formatTime(segment.start_time)}–{formatTime(segment.end_time)}</div></div><div className="flex-1 text-sm leading-6 text-gray-700">{segment.text}</div>{canEdit && <button onClick={()=>{setEditingSegment(segment.id);setSegmentText(segment.text);setSegmentSpeaker(segment.speaker||"Speaker");}} className="text-xs font-semibold text-blue-700">Edit</button>}</div>}</div>)}</section>}

    {tab === "minutes" && <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="flex items-center gap-2 font-bold text-gray-900"><FileText size={18}/>Official Meeting Minutes</h2>{canEdit && <div className="flex flex-wrap gap-2"><button onClick={()=>regenerateMutation.mutate()} disabled={regenerateMutation.isPending} className="inline-flex items-center gap-1 rounded border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"><Sparkles size={14}/>Regenerate</button>{summaryQuery.data && <button onClick={()=>{setSummaryDraft(summaryQuery.data!.text);setEditingSummary(true);}} className="rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700">Edit Minutes</button>}{isAdmin && summaryQuery.data && <button onClick={()=>finalizeMutation.mutate()} disabled={finalizeMutation.isPending} className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Finalize & Email PDF</button>}</div>}</div>{summaryQuery.isError && <div className="rounded bg-gray-50 p-6 text-center text-sm text-gray-500">Minutes are not available yet. {canEdit && "Use Regenerate after the transcript is complete."}</div>}{summaryQuery.data && (editingSummary ? <div className="space-y-2"><textarea value={summaryDraft} onChange={(event)=>setSummaryDraft(event.target.value)} rows={14} className="w-full rounded border border-gray-300 p-3 text-sm leading-6 text-gray-900"/><div className="flex gap-2"><button onClick={()=>summaryMutation.mutate(summaryDraft)} className="rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white">Save Minutes</button><button onClick={()=>setEditingSummary(false)} className="rounded border border-gray-300 px-4 py-2 text-xs">Cancel</button></div></div> : <><div className="whitespace-pre-wrap text-sm leading-7 text-gray-700">{summaryQuery.data.text}</div>{summaryQuery.data.key_points.length>0 && <div><h3 className="mb-2 font-bold text-gray-900">Key Points</h3><ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">{summaryQuery.data.key_points.map((point,index)=><li key={index}>{point}</li>)}</ul></div>}{summaryQuery.data.decisions.length>0 && <div><h3 className="mb-2 font-bold text-gray-900">Resolutions / Decisions</h3><ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">{summaryQuery.data.decisions.map((decision)=><li key={decision.id}>{decision.text}</li>)}</ol></div>}</>)}</section>}

    {tab === "actions" && <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-gray-900">Action Items</h2>{actionsQuery.isError && <p className="text-sm text-gray-500">Action items are unavailable for this meeting.</p>}{(actionsQuery.data||[]).map((item)=><div key={item.id} className="grid gap-3 rounded border border-gray-200 p-3 sm:grid-cols-[1fr_auto]"><div><div className="text-sm font-medium text-gray-900">{item.text}</div><div className="mt-1 text-xs text-gray-500">Responsible: {item.assignee_name || "Unassigned"} · Priority: {item.priority} · Due: {item.deadline || "Not specified"}</div></div>{canEdit ? <select value={item.status} onChange={(event)=>actionMutation.mutate({id:item.id,status:event.target.value as ActionItem["status"]})} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select> : <span className="text-xs font-semibold capitalize text-gray-600">{item.status.replace("_"," ")}</span>}</div>)}{actionsQuery.data?.length===0 && <div className="py-8 text-center text-sm text-gray-500"><CheckCircle className="mx-auto mb-2 text-gray-300"/>No action items recorded.</div>}</section>}
  </div></DashboardLayout>;
}
