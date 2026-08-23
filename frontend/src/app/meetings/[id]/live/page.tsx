"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Mail, Mic, Radio, RefreshCw, Square, Upload, Users } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import LiveAudioRoom from "@/components/LiveAudioRoom";
import LiveInvitePanel from "@/components/LiveInvitePanel";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface LiveMeetingInfo {
  id: number;
  title: string;
  description: string | null;
  date: string;
  owner_id: number;
  owner_name: string;
  status: "draft" | "processing" | "completed" | "failed";
  lifecycle: "scheduled" | "live" | "ended";
  started_at: string | null;
  ended_at: string | null;
  is_moderator: boolean;
  recording: { id: number; filename: string } | null;
}

interface Attendance {
  id: number;
  name: string;
  role_title: string | null;
  attendance_status: string;
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export default function LiveMeetingPage() {
  const params = useParams<{ id: string }>();
  const meetingId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leavingRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

  const meetingQuery = useQuery<LiveMeetingInfo>({
    queryKey: ["meeting-live-info", meetingId],
    queryFn: () => apiRequest(`/api/live-rooms/${meetingId}/info`),
    enabled: Boolean(user && Number.isInteger(meetingId) && meetingId > 0),
    refetchInterval: 2000,
  });
  const meeting = meetingQuery.data;
  const canManageMeeting = Boolean(meeting?.is_moderator);

  const attendanceQuery = useQuery<Attendance[]>({
    queryKey: ["meeting-live-attendance", meetingId],
    queryFn: () => apiRequest(`/api/meetings/${meetingId}/attendance`),
    enabled: Boolean(canManageMeeting && meeting),
    refetchInterval: meeting?.lifecycle === "live" ? 2000 : false,
  });

  const refreshInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((device) => device.kind === "audioinput"));
    } catch { /* labels may be hidden before permission */ }
  }, []);

  useEffect(() => { void refreshInputs(); }, [refreshInputs]);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    mixSourcesRef.current.forEach((source) => { try { source.disconnect(); } catch {} });
    mixSourcesRef.current.clear();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") void audioContextRef.current.close();
    audioContextRef.current = null;
    mixDestinationRef.current = null;
  }, []);

  useEffect(() => () => {
    leavingRef.current = true;
    try { if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop(); } catch {}
    cleanupMedia();
  }, [cleanupMedia]);

  const attachRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    const context = audioContextRef.current;
    const destination = mixDestinationRef.current;
    if (!context || !destination || mixSourcesRef.current.has(peerId)) return;
    try {
      const source = context.createMediaStreamSource(stream);
      source.connect(destination);
      mixSourcesRef.current.set(peerId, source);
    } catch (streamError) {
      console.error("Could not add participant microphone to meeting recording:", streamError);
    }
  }, []);

  const sendForMinutes = useCallback(async (source: Blob | File, filename: string) => {
    setProcessing(true);
    setError(null);
    try {
      await apiRequest(`/api/meetings/${meetingId}/end`, { method: "POST" });
      const body = new FormData();
      body.append("file", source, filename);
      await apiRequest(`/api/recordings/upload/${meetingId}`, { method: "POST", body });
      await apiRequest(`/api/meetings/${meetingId}/transcribe`, { method: "POST" });
      router.push(`/meetings/${meetingId}`);
    } catch (finishError) {
      setProcessing(false);
      setError(finishError instanceof Error ? finishError.message : "Could not finish the meeting.");
    }
  }, [meetingId, router]);

  const startMeeting = useCallback(async () => {
    leavingRef.current = false;
    setError(null);
    chunksRef.current = [];
    setSeconds(0);
    let runtimeStarted = false;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputId ? { exact: selectedInputId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      await refreshInputs();
      await apiRequest(`/api/meetings/${meetingId}/start`, { method: "POST" });
      runtimeStarted = true;
      await meetingQuery.refetch();

      const context = new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const destination = context.createMediaStreamDestination();
      mixDestinationRef.current = destination;
      const localSource = context.createMediaStreamSource(stream);
      localSource.connect(destination);
      mixSourcesRef.current.set("__host__", localSource);

      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(destination.stream, { mimeType: preferred }) : new MediaRecorder(destination.stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        cleanupMedia();
        setHostStream(null);
        setIsRecording(false);
        if (leavingRef.current) return;
        if (blob.size === 0) { setError("The recording was empty. Please try again."); return; }
        const extension = type.includes("mp4") ? "m4a" : "webm";
        void sendForMinutes(blob, `meeting-${meetingId}.${extension}`);
      };
      recorder.start(1000);
      setHostStream(stream);
      setIsRecording(true);
      void attendanceQuery.refetch();
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (startError) {
      if (runtimeStarted && meeting?.lifecycle !== "live") { try { await apiRequest(`/api/meetings/${meetingId}/end`, { method: "POST" }); } catch {} }
      cleanupMedia();
      setHostStream(null);
      setError(startError instanceof Error ? startError.message : "Microphone access or meeting start failed.");
    }
  }, [attendanceQuery, cleanupMedia, meeting?.lifecycle, meetingId, meetingQuery, refreshInputs, selectedInputId, sendForMinutes]);

  useEffect(() => {
    if (!canManageMeeting || autoStartAttemptedRef.current || typeof window === "undefined") return;
    const shouldAutoStart = new URLSearchParams(window.location.search).get("autostart") === "1";
    if (!shouldAutoStart) return;
    autoStartAttemptedRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    const timer = window.setTimeout(() => document.getElementById("start-meeting-button")?.click(), 0);
    return () => window.clearTimeout(timer);
  }, [canManageMeeting]);

  const endMeeting = () => {
    leavingRef.current = false;
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
  };

  const uploadExisting = (file?: File) => { if (file) void sendForMinutes(file, file.name); };

  if (!user) return null;
  if (meetingQuery.isLoading) return <DashboardLayout><div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-3 animate-spin text-blue-700"/>Opening meeting...</div></DashboardLayout>;
  if (meetingQuery.isError || !meeting) return <DashboardLayout><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not open this live meeting. {meetingQuery.error?.message || "The meeting may no longer be live."}</div></DashboardLayout>;

  if (meeting.status === "processing" || meeting.status === "completed" || meeting.lifecycle === "ended") {
    return <DashboardLayout><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto text-green-600" size={52}/><h1 className="mt-3 text-2xl font-extrabold text-slate-950">{meeting.status === "completed" ? "Meeting completed" : "Minutes are being prepared"}</h1><p className="mt-2 text-sm text-slate-500">The system is preparing the transcript, detecting speakers and building the meeting minutes.</p><Link href={`/meetings/${meeting.id}`} className="mt-6 inline-flex rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white">Open Meeting</Link></div></DashboardLayout>;
  }

  const attendance = attendanceQuery.data || [];
  const presentCount = attendance.filter((person) => person.attendance_status === "present").length;
  const waitingCount = attendance.filter((person) => person.attendance_status === "waiting").length;
  const invitedCount = attendance.filter((person) => person.attendance_status === "invited").length;

  return <DashboardLayout><div className="mx-auto w-full max-w-4xl space-y-6">
    {inviteOpen && <LiveInvitePanel meetingId={meeting.id} onClose={() => setInviteOpen(false)} onInvited={() => void attendanceQuery.refetch()}/>}

    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2">{meeting.lifecycle === "live" && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"/>}<p className="text-xs font-bold uppercase tracking-wider text-blue-700">{meeting.lifecycle === "live" ? "On-ground meeting in progress" : "Meeting room"}</p></div><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{meeting.title}</h1><div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Calendar size={14}/>{new Date(meeting.date).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}</span>{canManageMeeting && <span className="flex items-center gap-1"><Users size={14}/>{presentCount} present · {waitingCount} waiting · {invitedCount} invited</span>}</div></div>
        <div className="flex flex-wrap gap-2">{canManageMeeting && <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-extrabold text-blue-800"><Mail size={15}/>Invite People</button>}<Link href={canManageMeeting ? `/meetings/${meeting.id}` : "/meetings"} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600">{canManageMeeting ? "Meeting details" : "All meetings"}</Link></div>
      </div>
    </header>

    {canManageMeeting && !isRecording && !processing && <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-700">{meeting.lifecycle === "live" ? <Radio size={36}/> : <Mic size={36}/>}</div><h2 className="mt-4 text-xl font-extrabold text-slate-950">{meeting.lifecycle === "live" ? "Reconnect the main meeting microphone" : "Ready to begin the meeting record?"}</h2><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">This system supports a normal physical meeting. Choose the main room microphone, laptop microphone, USB/Bluetooth microphone or audio interface. Other invited devices can add microphones while the meeting continues.</p>{audioInputs.length > 0 && <label className="mx-auto mt-5 block max-w-xl text-left text-xs font-bold text-slate-700">Main room microphone / audio source<select value={selectedInputId} onChange={(event)=>setSelectedInputId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"><option value="">Default microphone</option>{audioInputs.map((device,index)=><option key={device.deviceId||index} value={device.deviceId}>{device.label||`Microphone ${index+1}`}</option>)}</select></label>}<button id="start-meeting-button" type="button" onClick={() => void startMeeting()} className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-4 text-base font-extrabold text-white shadow-sm hover:bg-blue-800 sm:w-auto sm:min-w-72"><Mic className="mr-2 inline" size={20}/>{meeting.lifecycle === "live" ? "Reconnect & Continue Recording" : "Start Meeting Recording"}</button>{meeting.lifecycle !== "live" && <div className="mt-6 border-t border-slate-100 pt-5"><p className="mb-2 text-xs text-slate-400">Already recorded elsewhere?</p><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Upload size={15}/>Upload recording instead<input type="file" className="hidden" accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg,audio/*,video/*" onChange={(event)=>uploadExisting(event.target.files?.[0])}/></label></div>}</section>}

    {canManageMeeting && isRecording && hostStream && <><section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><div className="mx-auto h-4 w-4 animate-pulse rounded-full bg-red-600"/><div className="mt-4 font-mono text-4xl font-extrabold tracking-wider text-slate-950">{formatTime(seconds)}</div><h2 className="mt-3 text-lg font-bold text-slate-900">Meeting is being recorded for minutes</h2><p className="mx-auto mt-1 max-w-2xl text-sm text-slate-500">The main room microphone and all connected participant microphones are combined into the meeting record. Inviting another person does not interrupt this recording.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-extrabold text-blue-800"><Mail size={16}/>Invite During Meeting</button><button type="button" onClick={endMeeting} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-red-700"><Square size={17} fill="currentColor"/>End Meeting & Process Minutes</button></div></section><LiveAudioRoom meetingId={meeting.id} displayName={user.full_name} providedStream={hostStream} autoJoin onRemoteStream={attachRemoteStream}/></>}

    {!canManageMeeting && meeting.lifecycle === "live" && <LiveAudioRoom meetingId={meeting.id} displayName={user.full_name}/>} 

    {processing && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-700 border-t-transparent"/><h2 className="mt-4 text-lg font-extrabold text-slate-950">Processing minutes...</h2><p className="mt-2 text-sm text-slate-600">The system will detect speakers, prepare the transcript and create the meeting minutes.</p></section>}
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    {canManageMeeting && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Attendance & invitations</h2><span className="text-xs font-bold text-blue-700">{presentCount} present · {waitingCount} waiting · {invitedCount} invited</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{attendance.length===0?<p className="text-sm text-slate-500">No participants have registered yet.</p>:attendance.map((person)=><div key={person.id} className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-sm font-semibold text-slate-800">{person.name}</div><div className="text-xs text-slate-500">{person.role_title||"Member"} · <span className="capitalize">{person.attendance_status}</span></div></div>)}</div></section>}
  </div></DashboardLayout>;
}
