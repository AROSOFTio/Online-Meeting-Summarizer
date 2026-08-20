"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Mic, Square, Upload, Users } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface Meeting {
  id: number;
  title: string;
  description: string | null;
  date: string;
  owner_id: number;
  status: "draft" | "processing" | "completed" | "failed";
  recording: { id: number; filename: string } | null;
}
interface Attendance { id:number; name:string; role_title:string|null; attendance_status:string; }

const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export default function LiveMeetingPage() {
  const params = useParams<{ id: string }>();
  const meetingId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leavingRef = useRef(false);

  const meetingQuery = useQuery<Meeting>({
    queryKey:["meeting-live",meetingId],
    queryFn:()=>apiRequest(`/api/meetings/${meetingId}`),
    enabled:Boolean(user && Number.isInteger(meetingId) && meetingId > 0),
  });
  const canManageMeeting = Boolean(
    user && meetingQuery.data && (user.role === "admin" || meetingQuery.data.owner_id === user.id)
  );
  const attendanceQuery = useQuery<Attendance[]>({
    queryKey:["meeting-live-attendance",meetingId],
    queryFn:()=>apiRequest(`/api/meetings/${meetingId}/attendance`),
    enabled:canManageMeeting,
    refetchInterval: isRecording ? 2000 : false,
  });

  const cleanupStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    leavingRef.current = true;
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch { /* recorder may already be closed */ }
    cleanupStream();
  }, [cleanupStream]);

  const sendForMinutes = async (source: Blob | File, filename: string) => {
    setProcessing(true);
    setError(null);
    try {
      await apiRequest(`/api/meetings/${meetingId}/end`, { method:"POST" });
      const body = new FormData();
      body.append("file", source, filename);
      await apiRequest(`/api/recordings/upload/${meetingId}`, { method:"POST", body });
      await apiRequest(`/api/meetings/${meetingId}/transcribe`, { method:"POST" });
      router.push(`/meetings/${meetingId}`);
    } catch (err) {
      setProcessing(false);
      setError(err instanceof Error ? err.message : "Could not finish the meeting.");
    }
  };

  const startMeeting = async () => {
    leavingRef.current = false;
    setError(null);
    chunksRef.current = [];
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      await apiRequest(`/api/meetings/${meetingId}/start`, { method:"POST" });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        cleanupStream();
        if (leavingRef.current) return;
        setIsRecording(false);
        const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) {
          setError("The recording was empty. Please try again.");
          return;
        }
        const extension = type.includes("mp4") ? "m4a" : "webm";
        void sendForMinutes(blob, `meeting-${meetingId}.${extension}`);
      };
      recorder.start(1000);
      setIsRecording(true);
      void attendanceQuery.refetch();
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (err) {
      cleanupStream();
      setError(err instanceof Error ? err.message : "Microphone access or meeting start failed. Allow microphone permission and try again.");
    }
  };

  const endMeeting = () => {
    leavingRef.current = false;
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
  };

  const uploadExisting = (file?: File) => {
    if (!file) return;
    void sendForMinutes(file, file.name);
  };

  if (!user) return null;
  if (meetingQuery.isLoading) return <DashboardLayout><div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">Opening meeting...</div></DashboardLayout>;
  if (meetingQuery.isError || !meetingQuery.data) return <DashboardLayout><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not open this meeting.</div></DashboardLayout>;

  const meeting = meetingQuery.data;
  if (!canManageMeeting) return <DashboardLayout><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Only the meeting organiser or an administrator can start this meeting.</div></DashboardLayout>;

  const attendance = attendanceQuery.data || [];
  const presentCount = attendance.filter((person) => person.attendance_status === "present").length;
  const waitingCount = attendance.filter((person) => person.attendance_status === "waiting").length;

  if (meeting.status === "processing" || meeting.status === "completed") {
    return <DashboardLayout><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto text-green-600" size={52}/><h1 className="mt-3 text-2xl font-extrabold text-slate-950">{meeting.status === "completed" ? "Meeting completed" : "Minutes are being prepared"}</h1><p className="mt-2 text-sm text-slate-500">This meeting has already been recorded.</p><Link href={`/meetings/${meeting.id}`} className="mt-6 inline-flex rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white">Open Meeting</Link></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Host Meeting</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{meeting.title}</h1><div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Calendar size={14}/>{new Date(meeting.date).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}</span><span className="flex items-center gap-1"><Users size={14}/>{presentCount} present · {waitingCount} waiting</span></div></div>
            <Link href={`/meetings/${meeting.id}`} className="text-xs font-bold text-slate-500 hover:text-blue-700">Back to meeting</Link>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          {!isRecording && !processing && <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-700"><Mic size={36}/></div>
            <h2 className="mt-4 text-xl font-extrabold text-slate-950">Ready to begin?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">You may start before, at, or after the scheduled time. Pressing Start Meeting changes the public waiting room to LIVE and begins recording on this device.</p>
            <button onClick={startMeeting} className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-4 text-base font-extrabold text-white shadow-sm hover:bg-blue-800 sm:w-auto sm:min-w-64"><Mic className="mr-2 inline" size={20}/>Start Meeting</button>
            <div className="mt-6 border-t border-slate-100 pt-5"><p className="mb-2 text-xs text-slate-400">Already recorded elsewhere?</p><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Upload size={15}/>Upload recording instead<input type="file" className="hidden" accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg,audio/*,video/*" onChange={(event)=>uploadExisting(event.target.files?.[0])}/></label></div>
          </>}

          {isRecording && <>
            <div className="mx-auto h-4 w-4 animate-pulse rounded-full bg-red-600" />
            <div className="mt-4 font-mono text-4xl font-extrabold tracking-wider text-slate-950">{formatTime(seconds)}</div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">Meeting is LIVE and recording</h2>
            <p className="mt-1 text-sm text-slate-500">Waiting participants are being marked present as their pages detect the live meeting.</p>
            <button onClick={endMeeting} className="mt-8 w-full rounded-xl bg-red-600 px-5 py-4 text-base font-extrabold text-white hover:bg-red-700 sm:w-auto sm:min-w-72"><Square className="mr-2 inline" size={18} fill="currentColor"/>End Meeting & Generate Minutes</button>
          </>}

          {processing && <div className="py-8"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-700 border-t-transparent"/><h2 className="mt-4 text-lg font-extrabold text-slate-950">Uploading and preparing minutes...</h2><p className="mt-2 text-sm text-slate-500">AI will identify speakers from the people marked present and will generate an agenda even if none was entered.</p></div>}
          {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Attendance</h2><span className="text-xs font-bold text-blue-700">{presentCount} present · {waitingCount} waiting</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{attendance.length === 0 ? <p className="text-sm text-slate-500">No participants have opened their invitation yet.</p> : attendance.map((person)=><div key={person.id} className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-sm font-semibold text-slate-800">{person.name}</div><div className="text-xs text-slate-500">{person.role_title || "Member"} · <span className="capitalize">{person.attendance_status}</span></div></div>)}</div>
        </section>
      </div>
    </DashboardLayout>
  );
}
