"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Mail, Mic, Radio, RefreshCw, Square, Upload, Users } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import LiveAudioRoom from "@/components/LiveAudioRoom";
import MicrophoneSetup from "@/components/MicrophoneSetup";
import {openMicrophone,mediaError} from "@/lib/meeting-media";
import LiveInvitePanel from "@/components/LiveInvitePanel";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import {savePart,recoverRecording,clearRecording,uploadRecording} from "@/lib/recording-recovery";

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
  recovery_key?:string;
}

interface Attendance {
  id: number;
  name: string;
  role_title: string | null;
  attendance_status: string;
}

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export default function LiveMeetingPage() {
  const params = useParams<{ id: string }>();
  const meetingId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();

  const [selectedMic,setSelectedMic]=useState("");
  const [starting,setStarting]=useState(false);
  const [testingMic,setTestingMic]=useState(false);
  const startingRef=useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const journalRef=useRef<Promise<void>>(Promise.resolve());
  const journalFailedRef=useRef(false);
  const releaseLockRef=useRef<(()=>void)|null>(null);
  const [recovered,setRecovered]=useState<Blob|null>(null);
  const [journalStatus,setJournalStatus]=useState<"checking"|"ready"|"protected"|"unavailable">("checking");
  const [uploadPercent,setUploadPercent]=useState(0);
  const uploadBusyRef=useRef(false);
  const [pendingFile,setPendingFile]=useState<{blob:Blob;name:string}|null>(null);
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
  const recoveryKey=meeting?.recovery_key;
  useEffect(()=>{
    if(!recoveryKey||!canManageMeeting)return;
    let active=true;
    void recoverRecording(recoveryKey).then(blob=>{if(active){setRecovered(blob);setJournalStatus("ready");}}).catch(()=>{if(active)setJournalStatus("unavailable");});
    return()=>{active=false;};
  },[recoveryKey,canManageMeeting]);
  useEffect(()=>{
    if(!isRecording&&!processing&&!pendingFile)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[isRecording,processing,pendingFile]);

  const attendanceQuery = useQuery<Attendance[]>({
    queryKey: ["meeting-live-attendance", meetingId],
    queryFn: () => apiRequest(`/api/meetings/${meetingId}/attendance`),
    enabled: Boolean(canManageMeeting && meeting),
    refetchInterval: meeting?.lifecycle === "live" ? 2000 : false,
  });

  const cleanupMedia = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    mixSourcesRef.current.forEach((source) => {
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
    });
    mixSourcesRef.current.clear();

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    mixDestinationRef.current = null;
  }, []);

  useEffect(
    () => () => {
      leavingRef.current = true;
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        // Page is already leaving.
      }
      cleanupMedia();releaseLockRef.current?.();releaseLockRef.current=null;
    },
    [cleanupMedia],
  );

  const attachRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    const context = audioContextRef.current;
    const destination = mixDestinationRef.current;
    if (!context || !destination) return;

    try {
      const source = context.createMediaStreamSource(stream);
      source.connect(destination);
      mixSourcesRef.current.get(peerId)?.disconnect();
      mixSourcesRef.current.set(peerId, source);
      const release=()=>{if(mixSourcesRef.current.get(peerId)===source){source.disconnect();mixSourcesRef.current.delete(peerId);}};
      stream.getAudioTracks().forEach(t=>t.addEventListener("ended",release,{once:true}));
    } catch (streamError) {
      console.error("Could not add participant microphone to meeting recording:", streamError);
    }
  }, []);

  const changeHostMicrophone = useCallback((nextStream: MediaStream) => {
    const context = audioContextRef.current;
    const destination = mixDestinationRef.current;
    if (!context || !destination) throw new Error("Meeting audio mixer is unavailable.");
    const replacement = context.createMediaStreamSource(nextStream);
    try {
      replacement.connect(destination);
      const oldSource = mixSourcesRef.current.get("__host__");
      oldSource?.disconnect();
      mixSourcesRef.current.set("__host__", replacement);
      const previous=streamRef.current;
      streamRef.current = nextStream;
      setHostStream(nextStream);
      previous?.getTracks().forEach(track=>track.stop());
    } catch (error) {
      replacement.disconnect();
      throw error;
    }
  }, []);

  const sendForMinutes = useCallback(
    async (source: Blob | File, filename: string) => {
      if(uploadBusyRef.current)return;
      uploadBusyRef.current=true;setPendingFile({blob:source,name:filename});
      setProcessing(true);setError(null);setUploadPercent(0);
      try {
        if(recoveryKey&&navigator.locks&&!releaseLockRef.current){
          const acquired=await new Promise<boolean>((resolve,reject)=>{
            void navigator.locks.request("minuteseal-record-"+recoveryKey,{ifAvailable:true},async lock=>{
              if(!lock){resolve(false);return;}
              await new Promise<void>(release=>{releaseLockRef.current=release;resolve(true);});
            }).catch(reject);
          });
          if(!acquired)throw new Error("The recording is still active in another tab.");
        }
        const info=await apiRequest(`/api/live-rooms/${meetingId}/info`);
        if(info.status!=="processing"&&info.status!=="completed"){
          await apiRequest(`/api/meetings/${meetingId}/end`, { method: "POST" });
          await uploadRecording(meetingId,source,filename,setUploadPercent);
          await apiRequest(`/api/meetings/${meetingId}/transcribe`, { method: "POST" });
        }
        if(recoveryKey)await clearRecording(recoveryKey).catch(()=>{});
        setRecovered(null);setPendingFile(null);releaseLockRef.current?.();releaseLockRef.current=null;
        router.push(`/meetings/${meetingId}`);
      } catch (finishError) {
        setProcessing(false);
        setError((finishError instanceof Error ? finishError.message : "Could not finish the meeting.")+" Your recording is retained for retry or download.");
      }finally{uploadBusyRef.current=false;}
    },
    [meetingId, router,recoveryKey],
  );
  const downloadBackup=(blob:Blob,name:string)=>{
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  const backupName=(blob:Blob)=>`meeting-${meetingId}-recovered.${blob.type.includes("mp4")?"m4a":"webm"}`;
  const backupPanel=(pendingFile||recovered)&&!isRecording?<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800">
    <strong>{pendingFile?"Recording saved for retry":"Recoverable recording found on this browser"}</strong>
    <p className="mt-1 text-xs">Process the saved recording or download a copy before starting another recording. A recovered segment may omit the final seconds before a crash.</p>
    <div className="mt-3 flex flex-wrap gap-2"><button disabled={processing} onClick={()=>{const file=pendingFile||{blob:recovered!,name:backupName(recovered!)};void sendForMinutes(file.blob,file.name);}} className="rounded bg-blue-700 px-3 py-2 text-white">Retry upload and process minutes</button><button disabled={processing} onClick={()=>{const file=pendingFile||{blob:recovered!,name:backupName(recovered!)};downloadBackup(file.blob,file.name);}} className="rounded border bg-white px-3 py-2">Download recording backup</button>{!pendingFile&&recovered&&<button disabled={processing} onClick={()=>{if(window.confirm("Permanently discard this local recording? Download it first if needed."))void (async()=>{if(navigator.locks){await navigator.locks.request("minuteseal-record-"+recoveryKey,{ifAvailable:true},async lock=>{if(!lock){setError("Recording is active in another tab.");return;}await clearRecording(recoveryKey!);setRecovered(null);});}else{await clearRecording(recoveryKey!);setRecovered(null);}})().catch(()=>setError("Could not discard local backup."));}} className="rounded border bg-white px-3 py-2 text-red-700">Discard backup</button>}</div>
    {processing&&<p className="mt-2">Uploading: {uploadPercent}%</p>}
  </div>:null;

  const startMeeting = useCallback(async () => {
    if(startingRef.current||testingMic||pendingFile||recovered||(recoveryKey&&journalStatus==="checking"))return;
    startingRef.current=true;setStarting(true);
    leavingRef.current = false;
    setError(null);
    chunksRef.current = [];
    setSeconds(0);

    let stream: MediaStream | null = null;

    try {
      if(recoveryKey&&navigator.locks){
        const acquired=await new Promise<boolean>((resolve,reject)=>{
          void navigator.locks.request("minuteseal-record-"+recoveryKey,{ifAvailable:true},async lock=>{
            if(!lock){resolve(false);return;}
            await new Promise<void>(release=>{releaseLockRef.current=release;resolve(true);});
          }).catch(reject);
        });
        if(!acquired)throw new Error("This meeting is already recording in another tab.");
      }
      if(recoveryKey){
        const previous=await recoverRecording(recoveryKey).catch(()=>null);
        if(previous){setRecovered(previous);throw new Error("A previous recording is available. Recover it before starting another.");}
      }
      journalRef.current=Promise.resolve();journalFailedRef.current=false;
      stream = await openMicrophone(selectedMic);
      streamRef.current = stream;

      // Resume audio within the user gesture before network requests.

      const context = new AudioContext();
      audioContextRef.current = context;
      await context.resume();

      const destination = context.createMediaStreamDestination();
      mixDestinationRef.current = destination;

      const localSource = context.createMediaStreamSource(stream);
      localSource.connect(destination);
      mixSourcesRef.current.set("__host__", localSource);

      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = preferred
        ? new MediaRecorder(destination.stream, { mimeType: preferred, audioBitsPerSecond:128000 })
        : new MediaRecorder(destination.stream,{audioBitsPerSecond:128000});

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if(event.data.size>0){
          const index=chunksRef.current.length;chunksRef.current.push(event.data);
          if(recoveryKey){
            journalRef.current=journalRef.current.then(()=>savePart(recoveryKey,index,event.data)).then(()=>{if(!journalFailedRef.current)setJournalStatus("protected");}).catch(()=>{journalFailedRef.current=true;setJournalStatus("unavailable");});
          }
        }
      };

      recorder.onstop = async () => {
        await journalRef.current;
        const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });

        cleanupMedia();
        setHostStream(null);
        setIsRecording(false);

        if (leavingRef.current) return;
        setRecovered(blob);
        if (blob.size === 0) {
          setError("The recording was empty. Please try again.");
          return;
        }

        const extension = type.includes("mp4") ? "m4a" : "webm";
        void sendForMinutes(blob, `meeting-${meetingId}.${extension}`);
      };

      if(meeting?.lifecycle!=="live"){
        await apiRequest(`/api/meetings/${meetingId}/start`, { method: "POST" });
      }
      recorder.start(1000);
      setHostStream(stream);
      void meetingQuery.refetch();
      setIsRecording(true);
      void attendanceQuery.refetch();

      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (startError) {
      // Local recording setup failure must never end a live meeting for guests.

      cleanupMedia();
      setHostStream(null);
      releaseLockRef.current?.();releaseLockRef.current=null;setError(mediaError(startError));
    } finally {startingRef.current=false;setStarting(false);}
  }, [
    selectedMic,testingMic,
    attendanceQuery,
    cleanupMedia,
    meeting?.lifecycle,
    meetingId,
    meetingQuery,
    sendForMinutes,recoveryKey,pendingFile,recovered,journalStatus,
  ]);

  useEffect(() => {
    if (!canManageMeeting || autoStartAttemptedRef.current || typeof window === "undefined" || (recoveryKey&&journalStatus==="checking") || recovered || pendingFile) return;

    const shouldAutoStart = new URLSearchParams(window.location.search).get("autostart") === "1";
    if (!shouldAutoStart) return;

    autoStartAttemptedRef.current = true;
    window.history.replaceState({}, "", window.location.pathname);

    const timer = window.setTimeout(
      () => document.getElementById("start-meeting-button")?.click(),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [canManageMeeting,recoveryKey,journalStatus,recovered,pendingFile]);

  const endMeeting = () => {
    leavingRef.current = false;
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    recorderRef.current.stop();
  };

  const uploadExisting = (file?: File) => {
    if (file) void sendForMinutes(file, file.name);
  };

  if (!user) return null;

  if (meetingQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-600">
          <RefreshCw className="mx-auto mb-3 animate-spin text-blue-700" />
          Opening meeting...
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          Could not open this live meeting. {meetingQuery.error?.message || "The meeting may no longer be live."}
        </div>
      </DashboardLayout>
    );
  }

  if (meeting.lifecycle === "ended" && meeting.status === "draft") {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-950">Meeting recording recovery</h1>
          {backupPanel}
          <p className="mt-3 text-sm text-slate-600">Minutes processing has not started. Upload the original meeting audio to generate the transcript and minutes for this meeting.</p>
          {canManageMeeting && (
            <label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800">
              <Upload size={17} />{processing ? "Uploading recording..." : "Upload meeting recording"}
              <input type="file" className="hidden" disabled={processing} accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg,audio/*,video/*" onChange={(event) => uploadExisting(event.target.files?.[0])} />
            </label>
          )}
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="mt-5"><Link href={`/meetings/${meeting.id}`} className="text-sm font-bold text-blue-700">Open meeting details</Link></div>
        </div>
      </DashboardLayout>
    );
  }

  if (meeting.status === "processing" || meeting.status === "completed" || meeting.lifecycle === "ended") {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto text-green-600" size={52} />
          <h1 className="mt-3 text-2xl font-extrabold text-slate-950">
            {meeting.status === "completed" ? "Meeting completed" : "Minutes are being prepared"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The system is preparing the transcript, detecting speakers and building the meeting minutes.
          </p>
          <Link
            href={`/meetings/${meeting.id}`}
            className="mt-6 inline-flex rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white"
          >
            Open Meeting
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const attendance = attendanceQuery.data || [];
  const presentCount = attendance.filter((person) => person.attendance_status === "present").length;
  const waitingCount = attendance.filter((person) => person.attendance_status === "waiting").length;
  const invitedCount = attendance.filter((person) => person.attendance_status === "invited").length;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full space-y-3">
        {meetingQuery.isError&&<p role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Meeting status is temporarily unavailable. Your audio room and recording remain open.</p>}
        {inviteOpen && (
          <LiveInvitePanel
            meetingId={meeting.id}
            onClose={() => setInviteOpen(false)}
            onInvited={() => void attendanceQuery.refetch()}
          />
        )}

        <header className={isRecording?"px-1 py-2":"rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                {meeting.lifecycle === "live" && (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                )}
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  {meeting.lifecycle === "live" ? "Live meeting · Organizer" : "Meeting room"}
                </p>
              </div>

              <h1 className="mt-1 text-2xl font-extrabold text-slate-950">{meeting.title}</h1>

              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {new Date(meeting.date).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                {canManageMeeting && (
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    {presentCount} present · {waitingCount} waiting · {invitedCount} invited
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {canManageMeeting && (
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-extrabold text-blue-800"
                >
                  <Mail size={15} />
                  Invite People
                </button>
              )}
              <Link
                href={canManageMeeting ? `/meetings/${meeting.id}` : "/meetings"}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600"
              >
                {canManageMeeting ? "Meeting details" : "All meetings"}
              </Link>
            </div>
          </div>
        </header>

        {backupPanel}
        {canManageMeeting && !isRecording && !processing && !pendingFile && !recovered && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full motion-safe:animate-pulse bg-blue-50 text-blue-700">
              {meeting.lifecycle === "live" ? <Radio size={36} /> : <Mic size={36} />}
            </div>

            <h2 className="mt-4 text-xl font-extrabold text-slate-950">
              {meeting.lifecycle === "live" ? "Continue meeting recording" : "Ready to start the meeting?"}
            </h2>

            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Choose your microphone and test it before starting. Camera and screen sharing are available inside the meeting.
            </p>

            <MicrophoneSetup value={selectedMic} onChange={setSelectedMic} disabled={starting} onTestingChange={setTestingMic}/>
            <button
              disabled={starting||testingMic||(!!recoveryKey&&journalStatus==="checking")}
              id="start-meeting-button"
              type="button"
              onClick={() => void startMeeting()}
              className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-4 text-base font-extrabold text-white shadow-sm hover:bg-blue-800 sm:w-auto sm:min-w-72"
            >
              <Mic className="mr-2 inline" size={20} />
              {starting ? "Connecting..." : meeting.lifecycle === "live" ? "Continue Recording" : "Start Meeting"}
            </button>

            {meeting.lifecycle !== "live" && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="mb-2 text-xs text-slate-600">Already recorded elsewhere?</p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <Upload size={15} />
                  Upload recording instead
                  <input
                    type="file"
                    className="hidden"
                    accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg,audio/*,video/*"
                    onChange={(event) => uploadExisting(event.target.files?.[0])}
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {canManageMeeting && isRecording && hostStream && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><span className="inline-flex items-center gap-1 font-semibold text-red-700"><span className="h-2 w-2 rounded-full bg-red-600"/> Recording</span><span className="rounded-full border bg-white px-3 py-1 font-mono font-bold text-slate-950">{formatTime(seconds)}</span><span>Audio-first meeting</span><span className={journalStatus==="protected"?"text-green-700":"text-amber-700"}>{journalStatus==="protected"?"Local recording backup active":journalStatus==="unavailable"?"Local backup unavailable — keep this tab open":"Preparing local backup"}</span></div>
            <LiveAudioRoom
              meetingId={meeting.id}
              displayName={user.full_name}
              providedStream={hostStream}
              autoJoin
              onRemoteStream={attachRemoteStream}
              onMicrophoneChange={changeHostMicrophone}
              onEndMeeting={endMeeting}
              onInvite={()=>setInviteOpen(true)}
            />
          </>
        )}

        {!canManageMeeting && meeting.lifecycle === "live" && (
          <LiveAudioRoom meetingId={meeting.id} displayName={user.full_name} autoJoin />
        )}

        {processing && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />
            <h2 className="mt-4 text-lg font-extrabold text-slate-950">Processing minutes...</h2>
            <p className="mt-2 text-sm text-slate-600">
              The system will detect speakers, prepare the transcript and create the meeting minutes.
            </p>
          </section>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {canManageMeeting && !isRecording && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Attendance & invitations</h2>
              <span className="text-xs font-bold text-blue-700">
                {presentCount} present · {waitingCount} waiting · {invitedCount} invited
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {attendance.length === 0 ? (
                <p className="text-sm text-slate-600">No participants have registered yet.</p>
              ) : (
                attendance.map((person) => (
                  <div key={person.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-sm font-semibold text-slate-800">{person.name}</div>
                    <div className="text-xs text-slate-600">
                      {person.role_title || "Member"} ·{" "}
                      <span className="capitalize">{person.attendance_status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
