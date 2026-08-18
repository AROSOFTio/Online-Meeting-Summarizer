"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  CheckCircle, Clock, FileText, Mic, RefreshCw, Trash2, Upload,
  UserPlus, XCircle,
} from "lucide-react";

import AudioRecorder from "@/components/AudioRecorder";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";

const meetingDetailsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  date: z.string().min(10, "Please specify a valid meeting date"),
  participants: z.array(z.object({
    name: z.string(),
    email: z.string().email("Enter a valid email").optional().or(z.literal("")),
    role_title: z.string().optional(),
    attendance_status: z.enum(["present", "absent", "apology", "invited"]),
  })),
});

type MeetingDetailsForm = z.infer<typeof meetingDetailsSchema>;
type ProcessMethod = "record" | "upload" | null;
interface StaffOption { id: number; name: string; email: string; access_role: string; }
interface ProcessingStatus { status: string; progress: number; error_message?: string | null; }

const roleLabel = (role: string) => role === "minute_secretary" ? "Secretary" : role === "admin" ? "Administrator" : "Staff";

export default function NewMeetingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<ProcessMethod>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [meetingData, setMeetingData] = useState<MeetingDetailsForm | null>(null);
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const [recordingUploaded, setRecordingUploaded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [jobStatus, setJobStatus] = useState("queued");
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: staffOptions = [] } = useQuery<StaffOption[]>({
    queryKey: ["staff-attendance-options"],
    queryFn: () => apiRequest("/api/meetings/directory/staff-options"),
  });

  const { register, handleSubmit, control, formState: { errors } } = useForm<MeetingDetailsForm>({
    resolver: zodResolver(meetingDetailsSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      participants: [{ name: "", email: "", role_title: "Member", attendance_status: "present" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "participants" });

  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  const saveDetails = (data: MeetingDetailsForm) => {
    setMeetingData(data);
    setStep(2);
  };

  const chooseMethod = (value: Exclude<ProcessMethod, null>) => {
    setMethod(value);
    setRecordingUploaded(false);
    setJobError(null);
    if (value === "record") setSelectedFile(null);
    if (value === "upload") setRecordedBlob(null);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = [".wav", ".mp3", ".m4a", ".mp4", ".webm", ".ogg"];
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
    if (!allowed.includes(ext)) {
      window.alert(`Unsupported file type. Use ${allowed.join(", ")}.`);
      event.target.value = "";
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      window.alert("The file is larger than the 500 MB limit.");
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    setRecordingUploaded(false);
  };

  const pollStatus = (id: number) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    setJobStatus("queued");
    setJobProgress(0);
    pollTimer.current = setInterval(async () => {
      try {
        const result = await apiRequest(`/api/meetings/${id}/status`) as ProcessingStatus;
        setJobStatus(result.status);
        setJobProgress(result.progress || 0);
        if (result.status === "completed") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setTimeout(() => router.push(`/meetings/${id}`), 1200);
        }
        if (result.status === "failed") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setJobError(result.error_message || "Meeting processing failed.");
        }
      } catch (error) {
        console.error("Status polling failed", error);
      }
    }, 2000);
  };

  const startProcessingPipeline = async () => {
    if (!meetingData) {
      setStep(1);
      return;
    }
    let source: Blob | File | null = null;
    let filename = "";
    if (method === "record") {
      source = recordedBlob;
      filename = `meeting-recording-${crypto.randomUUID()}.webm`;
    } else if (method === "upload") {
      source = selectedFile;
      filename = selectedFile?.name || "";
    }
    if (!source) {
      window.alert("Choose or record a media file first.");
      return;
    }

    setStep(3);
    setJobError(null);
    setJobStatus("queued");
    try {
      let id = meetingId;
      if (!id) {
        const participants = meetingData.participants.filter((participant) => participant.name.trim());
        const created = await apiRequest("/api/meetings/", {
          method: "POST",
          body: JSON.stringify({
            title: meetingData.title,
            description: meetingData.description || "",
            date: new Date(meetingData.date).toISOString(),
            participants,
          }),
        });
        id = created.id as number;
        setMeetingId(id);
      }

      if (!recordingUploaded) {
        setIsUploading(true);
        setUploadProgress(15);
        const data = new FormData();
        data.append("file", source, filename);
        const progressTimer = setInterval(() => setUploadProgress((value) => Math.min(value + 10, 90)), 450);
        try {
          await apiRequest(`/api/recordings/upload/${id}`, { method: "POST", body: data });
        } finally {
          clearInterval(progressTimer);
        }
        setUploadProgress(100);
        setIsUploading(false);
        setRecordingUploaded(true);
      }

      await apiRequest(`/api/meetings/${id}/transcribe`, { method: "POST" });
      pollStatus(id);
    } catch (error) {
      setIsUploading(false);
      setJobStatus("failed");
      setJobError(error instanceof Error ? error.message : "Could not start meeting processing.");
    }
  };

  const stageIcon = (stage: "upload" | "convert" | "transcribe" | "summary") => {
    if (stage === "upload") {
      if (isUploading) return <RefreshCw className="animate-spin text-blue-700" size={18} />;
      return uploadProgress === 100 ? <CheckCircle className="text-green-600" size={18} /> : <Clock className="text-gray-400" size={18} />;
    }
    const order = ["queued", "converting", "transcribing", "summarising", "completed"];
    const stageStatus = { convert: "converting", transcribe: "transcribing", summary: "summarising" }[stage];
    if (jobStatus === "failed") return <XCircle className="text-red-600" size={18} />;
    if (jobStatus === stageStatus) return <RefreshCw className="animate-spin text-blue-700" size={18} />;
    if (order.indexOf(jobStatus) > order.indexOf(stageStatus)) return <CheckCircle className="text-green-600" size={18} />;
    return <Clock className="text-gray-400" size={18} />;
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold text-gray-900">New Meeting Summarization</h1>
          <p className="mt-1 text-sm text-gray-500">Record or upload a meeting, transcribe it with Gemini AI, then generate minutes and action items.</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
          <div className="flex min-w-max items-center justify-center gap-4 text-sm font-semibold sm:gap-8">
            {["Details", "Audio Source", "Processing"].map((label, index) => {
              const number = index + 1;
              return <React.Fragment key={label}>
                {index > 0 && <span className="h-px w-12 bg-gray-200" />}
                <span className={`flex items-center gap-2 ${step >= number ? "text-blue-700" : "text-gray-400"}`}>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs ${step >= number ? "border-blue-700 bg-blue-50" : "border-gray-300"}`}>{number}</span>
                  {label}
                </span>
              </React.Fragment>;
            })}
          </div>
        </div>

        {step === 1 && (
          <form onSubmit={handleSubmit(saveDetails)} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Meeting Title
                <input {...register("title")} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" placeholder="e.g. Staff General Meeting" />
                {errors.title && <span className="mt-1 block text-xs text-red-600">{errors.title.message}</span>}
              </label>
              <label className="text-sm font-medium text-gray-700">Date
                <input type="date" {...register("date")} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" />
              </label>
            </div>
            <label className="block text-sm font-medium text-gray-700">Agenda / Description
              <textarea {...register("description")} rows={3} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" placeholder="Meeting agenda or objectives..." />
            </label>

            <div className="border-t border-gray-100 pt-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900"><FileText size={16} /> Attendance roster</h3>
                <button type="button" onClick={() => append({ name: "", email: "", role_title: "Member", attendance_status: "present" })} className="inline-flex items-center justify-center gap-1 rounded border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                  <UserPlus size={14} /> Add participant
                </button>
              </div>

              <div className="mb-4 flex flex-col gap-2 rounded border border-blue-100 bg-blue-50 p-3 sm:flex-row">
                <select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} className="flex-1 rounded border border-blue-200 bg-white px-3 py-2 text-xs text-gray-900">
                  <option value="">Select registered staff...</option>
                  {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} — {staff.email}</option>)}
                </select>
                <button type="button" disabled={!selectedStaffId} onClick={() => {
                  const staff = staffOptions.find((item) => String(item.id) === selectedStaffId);
                  if (!staff) return;
                  append({ name: staff.name, email: staff.email, role_title: roleLabel(staff.access_role), attendance_status: "present" });
                  setSelectedStaffId("");
                }} className="rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Add selected staff</button>
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-2 rounded bg-gray-50 p-3 md:grid-cols-[1.2fr_1.2fr_1fr_0.8fr_auto]">
                    <input {...register(`participants.${index}.name`)} placeholder="Full name" className="rounded border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900" />
                    <input type="email" {...register(`participants.${index}.email`)} placeholder="Email (optional)" className="rounded border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900" />
                    <input {...register(`participants.${index}.role_title`)} placeholder="Title / position" className="rounded border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900" />
                    <select {...register(`participants.${index}.attendance_status`)} className="rounded border border-gray-300 bg-white px-2 py-2 text-xs text-gray-900">
                      <option value="present">Present</option><option value="invited">Invited</option><option value="apology">Apology</option><option value="absent">Absent</option>
                    </select>
                    {fields.length > 1 && <button type="button" onClick={() => remove(index)} className="rounded p-2 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end"><button type="submit" className="w-full rounded bg-blue-700 px-6 py-2.5 font-semibold text-white hover:bg-blue-800 sm:w-auto">Continue to Audio Source</button></div>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="font-bold text-gray-900">Select Audio / Video Source</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <button type="button" onClick={() => chooseMethod("record")} className={`rounded-lg border-2 p-6 text-center ${method === "record" ? "border-blue-700 bg-blue-50" : "border-gray-200"}`}>
                <Mic className="mx-auto mb-2 text-blue-700" size={32} /><b className="text-sm text-gray-900">Record Microphone Live</b><p className="mt-1 text-xs text-gray-500">Capture the meeting directly in this browser.</p>
              </button>
              <button type="button" onClick={() => chooseMethod("upload")} className={`rounded-lg border-2 p-6 text-center ${method === "upload" ? "border-blue-700 bg-blue-50" : "border-gray-200"}`}>
                <Upload className="mx-auto mb-2 text-blue-700" size={32} /><b className="text-sm text-gray-900">Upload Media File</b><p className="mt-1 text-xs text-gray-500">WAV, MP3, M4A, MP4, WebM or OGG up to 500 MB.</p>
              </button>
            </div>
            {method === "record" && <AudioRecorder onRecordingComplete={(blob) => { setRecordedBlob(blob); setRecordingUploaded(false); }} onDiscard={() => { setRecordedBlob(null); setRecordingUploaded(false); }} />}
            {method === "upload" && (
              <label className="relative block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-8 text-center hover:border-blue-500">
                <input type="file" accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg" onChange={onFileChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                <Upload className="mx-auto mb-2 text-gray-400" size={36} /><span className="break-all text-sm font-semibold text-gray-800">{selectedFile?.name || "Choose audio or video file"}</span>
              </label>
            )}
            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setStep(1)} disabled={Boolean(meetingId)} className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40">Back to Details</button>
              <button type="button" onClick={startProcessingPipeline} disabled={!method || (method === "record" && !recordedBlob) || (method === "upload" && !selectedFile)} className="rounded bg-blue-700 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">Create & Process Meeting</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mx-auto w-full max-w-2xl space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="text-center"><h2 className="text-lg font-bold text-gray-900">Processing Meeting Pipeline</h2>{meetingId && <p className="mt-1 text-xs text-gray-500">Meeting #{meetingId}</p>}</div>
            <div className="space-y-5">
              {[
                ["upload", "Uploading Media Source", "Saving the original recording securely"],
                ["convert", "Converting & Normalising Audio", "FFmpeg converting to 16 kHz mono WAV"],
                ["transcribe", "Gemini AI Transcription", "Generating transcript, timestamps and speaker turns"],
                ["summary", "Minutes & Action Items", "Generating structured school meeting minutes"],
              ].map(([key, label, description]) => (
                <div key={key} className="flex items-start gap-3">{stageIcon(key as "upload" | "convert" | "transcribe" | "summary")}<div><h3 className="text-sm font-bold text-gray-900">{label}</h3><p className="text-xs text-gray-500">{description}</p></div></div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-5">
              {jobStatus === "completed" ? (
                <div className="text-center"><CheckCircle className="mx-auto mb-2 text-green-600" size={34} /><b className="text-sm text-green-700">Processing complete</b><p className="mt-1 text-xs text-gray-500">Opening the meeting workspace...</p></div>
              ) : jobStatus === "failed" ? (
                <div className="text-center"><XCircle className="mx-auto mb-2 text-red-600" size={34} /><b className="text-sm text-red-700">Processing failed</b><div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700">{jobError || "An unexpected processing error occurred."}</div><div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row"><button type="button" onClick={() => { setStep(2); setRecordingUploaded(false); }} className="rounded border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700">Replace Source File</button><button type="button" onClick={startProcessingPipeline} className="rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white">Retry Same Meeting</button></div></div>
              ) : (
                <div><div className="mb-2 flex justify-between text-xs font-medium text-gray-500"><span>State: <b className="uppercase text-blue-700">{jobStatus}</b></span><span>{jobProgress}%</span></div><div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-blue-700 transition-all" style={{ width: `${jobProgress}%` }} /></div>{isUploading && <p className="mt-2 text-xs text-gray-500">Upload progress: {uploadProgress}%</p>}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
