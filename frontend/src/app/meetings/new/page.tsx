"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { apiRequest } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import AudioRecorder from "@/components/AudioRecorder";
import {
  FileText,
  UserPlus,
  Trash2,
  Mic,
  Upload,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";

// Schemas
const meetingDetailsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  date: z.string().min(10, "Please specify a valid meeting date"),
  participants: z.array(
    z.object({
      name: z.string().min(2, "Name is required"),
      email: z.string().email("Enter a valid email").optional().or(z.literal("")),
      role_title: z.string().optional()
    })
  )
});

type MeetingDetailsForm = z.infer<typeof meetingDetailsSchema>;

export default function NewMeetingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Details, 2: Audio Source, 3: Processing
  const [method, setMethod] = useState<"record" | "upload" | null>(null);
  
  // Media states
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Job status tracking states
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>("queued");
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);

  const statusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<MeetingDetailsForm>({
    resolver: zodResolver(meetingDetailsSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      participants: [{ name: "", email: "", role_title: "" }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "participants"
  });

  // Handle cleanup of polling timers
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, []);

  const handleDetailsSubmit = (data: MeetingDetailsForm) => {
    // Save metadata locally to submit on final upload
    (window as any)._meetingData = data;
    setStep(2);
  };

  const handleRecordingComplete = (blob: Blob) => {
    setRecordedBlob(blob);
  };

  const handleDiscardRecording = () => {
    setRecordedBlob(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const validExtensions = [".wav", ".mp3", ".m4a", ".mp4", ".webm", ".ogg"];
      const fileExt = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

      if (!validExtensions.includes(fileExt)) {
        alert(`Unsupported file type. Supported extensions are: ${validExtensions.join(", ")}`);
        e.target.value = "";
        return;
      }
      setSelectedFile(file);
    }
  };

  const startProcessingPipeline = async () => {
    const metadata = (window as any)._meetingData as MeetingDetailsForm;
    if (!metadata) {
      alert("Meeting metadata missing. Please restart step 1.");
      setStep(1);
      return;
    }

    let fileToUpload: File | Blob;
    let filename = "";

    if (method === "record") {
      if (!recordedBlob) {
        alert("Please record audio first.");
        return;
      }
      fileToUpload = recordedBlob;
      filename = `live_recording_${Date.now()}.webm`;
    } else {
      if (!selectedFile) {
        alert("Please choose an audio/video file.");
        return;
      }
      fileToUpload = selectedFile;
      filename = selectedFile.name;
    }

    setStep(3);
    setIsUploading(true);
    setUploadProgress(10);

    try {
      // 1. Create draft meeting
      const cleanedParticipants = metadata.participants.filter(p => p.name.trim() !== "");
      const payload = {
        title: metadata.title,
        description: metadata.description || "",
        date: new Date(metadata.date).toISOString(),
        participants: cleanedParticipants
      };

      const meetingRes = await apiRequest("/api/meetings/", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const newMeetingId = meetingRes.id;
      setMeetingId(newMeetingId);
      setUploadProgress(40);

      // 2. Perform Streamed/Chunked Upload
      const formData = new FormData();
      formData.append("file", fileToUpload, filename);

      setIsUploading(true);
      
      // Since fetch doesn't support easy progress monitoring natively, we simulate progress steps 
      // during the API post call, then finalise to 100% when resolved.
      const uploadTimer = setInterval(() => {
        setUploadProgress(prev => (prev < 90 ? prev + 10 : prev));
      }, 500);

      await apiRequest(`/api/recordings/upload/${newMeetingId}`, {
        method: "POST",
        headers: {}, // fetch automatically populates multipart headers for FormData
        body: formData
      });

      clearInterval(uploadTimer);
      setUploadProgress(100);
      setIsUploading(false);

      // 3. Trigger background transcription
      await apiRequest(`/api/meetings/${newMeetingId}/transcribe`, {
        method: "POST"
      });

      // 4. Poll job status
      pollJobStatus(newMeetingId);

    } catch (err: any) {
      setIsUploading(false);
      setJobStatus("failed");
      setJobError(err.message || "Failed to create meeting and process audio");
    }
  };

  const pollJobStatus = (id: number) => {
    setJobStatus("queued");
    setJobProgress(0);

    statusTimerRef.current = setInterval(async () => {
      try {
        const statusRes = await apiRequest(`/api/meetings/${id}/status`);
        setJobStatus(statusRes.status);
        setJobProgress(statusRes.progress);

        if (statusRes.status === "completed") {
          if (statusTimerRef.current) clearInterval(statusTimerRef.current);
          // Redirect to meeting page after 2 seconds
          setTimeout(() => {
            router.push(`/meetings/${id}`);
          }, 2000);
        } else if (statusRes.status === "failed") {
          if (statusTimerRef.current) clearInterval(statusTimerRef.current);
          setJobError(statusRes.error_message || "Transcription job failed.");
        }
      } catch (err) {
        console.error("Error polling job status:", err);
      }
    }, 2000);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold text-gray-900">New Meeting Summarization</h1>
          <p className="text-sm text-gray-500 mt-1">Record or upload a meeting to generate transcripts and action plans</p>
        </div>

        {/* Wizard Steps indicator */}
        <div className="flex items-center justify-center py-4 bg-white border border-gray-200 rounded-lg max-w-4xl w-full mx-auto">
          <div className="flex items-center space-x-8 text-sm font-medium">
            <span className={`flex items-center space-x-2 ${step >= 1 ? "text-blue-700 font-bold" : "text-gray-400"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 ${step >= 1 ? "border-blue-700 bg-blue-50" : "border-gray-300"}`}>1</span>
              <span>Details</span>
            </span>
            <span className="h-0.5 w-12 bg-gray-200" />
            <span className={`flex items-center space-x-2 ${step >= 2 ? "text-blue-700 font-bold" : "text-gray-400"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 ${step >= 2 ? "border-blue-700 bg-blue-50" : "border-gray-300"}`}>2</span>
              <span>Audio Source</span>
            </span>
            <span className="h-0.5 w-12 bg-gray-200" />
            <span className={`flex items-center space-x-2 ${step >= 3 ? "text-blue-700 font-bold" : "text-gray-400"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 ${step >= 3 ? "border-blue-700 bg-blue-50" : "border-gray-300"}`}>3</span>
              <span>Processing</span>
            </span>
          </div>
        </div>

        {/* Step contents */}
        <div className="max-w-4xl w-full mx-auto">
          {step === 1 && (
            <form onSubmit={handleSubmit(handleDetailsSubmit)} className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Title</label>
                  <input
                    type="text"
                    {...register("title")}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                    placeholder="e.g. Staff Performance Review Term 2"
                  />
                  {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    {...register("date")}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  />
                  {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Description (Optional)</label>
                <textarea
                  rows={3}
                  {...register("description")}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  placeholder="Summarise the agenda or objectives..."
                />
              </div>

              {/* Dynamic list of Participants */}
              <div className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900 text-sm flex items-center space-x-2">
                    <FileText size={16} />
                    <span>Meeting Attendees</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => append({ name: "", email: "", role_title: "" })}
                    className="flex items-center space-x-1 text-xs text-blue-700 hover:text-blue-800 font-semibold border border-blue-200 hover:bg-blue-50 px-3 py-1 rounded"
                  >
                    <UserPlus size={14} />
                    <span>Add Participant</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex flex-col md:flex-row items-start md:items-center space-y-2 md:space-y-0 md:space-x-3 bg-gray-50 p-3 rounded">
                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          placeholder="Attendee Name"
                          {...register(`participants.${index}.name` as const)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                        />
                        {errors.participants?.[index]?.name && (
                          <p className="mt-0.5 text-[10px] text-red-600">{errors.participants[index]?.name?.message}</p>
                        )}
                      </div>

                      <div className="flex-1 w-full">
                        <input
                          type="email"
                          placeholder="Email (Optional)"
                          {...register(`participants.${index}.email` as const)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                        />
                        {errors.participants?.[index]?.email && (
                          <p className="mt-0.5 text-[10px] text-red-600">{errors.participants[index]?.email?.message}</p>
                        )}
                      </div>

                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          placeholder="Title/Role (e.g. Headteacher)"
                          {...register(`participants.${index}.role_title` as const)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                        />
                      </div>

                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded transition-colors self-end md:self-auto"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-700 hover:bg-blue-800 text-white font-medium py-2 px-6 rounded text-sm transition-colors"
                >
                  Continue to Audio Source
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-6">
              <h3 className="font-bold text-gray-900 text-base">Select Audio/Video Source</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setMethod("record");
                    setRecordedBlob(null);
                  }}
                  className={`p-5 rounded-lg border-2 text-center flex flex-col items-center justify-center space-y-3 transition-all ${
                    method === "record" ? "border-blue-700 bg-blue-50/50" : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <Mic className="text-blue-700" size={32} />
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">Record Microphone Live</h4>
                    <p className="text-xs text-gray-500 mt-1">Record the meeting conversation directly using this browser</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMethod("upload");
                    setSelectedFile(null);
                  }}
                  className={`p-5 rounded-lg border-2 text-center flex flex-col items-center justify-center space-y-3 transition-all ${
                    method === "upload" ? "border-blue-700 bg-blue-50/50" : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <Upload className="text-blue-700" size={32} />
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">Upload Media File</h4>
                    <p className="text-xs text-gray-500 mt-1">Upload existing files (WAV, MP3, M4A, MP4, WebM, OGG)</p>
                  </div>
                </button>
              </div>

              {method === "record" && (
                <div className="pt-4 border-t border-gray-100">
                  <AudioRecorder
                    onRecordingComplete={handleRecordingComplete}
                    onDiscard={handleDiscardRecording}
                  />
                </div>
              )}

              {method === "upload" && (
                <div className="pt-4 border-t border-gray-100 max-w-lg mx-auto">
                  <div className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-lg p-6 text-center cursor-pointer transition-colors relative">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="mx-auto text-gray-400 mb-2" size={36} />
                    <span className="text-sm font-semibold text-gray-800">
                      {selectedFile ? selectedFile.name : "Choose audio or video file"}
                    </span>
                    <span className="block text-xs text-gray-500 mt-1">
                      WAV, MP3, M4A, MP4, WebM, OGG. Max file size: 500MB
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Back to Details
                </button>

                <button
                  type="button"
                  onClick={startProcessingPipeline}
                  disabled={!method || (method === "record" && !recordedBlob) || (method === "upload" && !selectedFile)}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-medium py-2 px-6 rounded text-sm transition-colors disabled:opacity-50"
                >
                  Create &amp; Process Meeting
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 max-w-2xl mx-auto space-y-6">
              <h3 className="font-bold text-gray-900 text-lg text-center">Processing Meeting Pipeline</h3>
              
              {/* Stages List */}
              <div className="space-y-5">
                {/* Upload Section */}
                <div className="flex items-start space-x-3">
                  {isUploading ? (
                    <RefreshCw className="animate-spin text-blue-700 shrink-0 mt-0.5" size={18} />
                  ) : uploadProgress >= 100 ? (
                    <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={18} />
                  ) : (
                    <Clock className="text-gray-400 shrink-0 mt-0.5" size={18} />
                  )}
                  <div className="flex-1">
                    <h4 className="font-bold text-sm text-gray-900">Uploading Media Source</h4>
                    <p className="text-xs text-gray-500">Streaming raw recording safely to server storage</p>
                    {isUploading && (
                      <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-700 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Normalisation / FFmpeg */}
                <div className="flex items-start space-x-3">
                  {jobStatus === "converting" ? (
                    <RefreshCw className="animate-spin text-blue-700 shrink-0 mt-0.5" size={18} />
                  ) : ["transcribing", "summarising", "completed"].includes(jobStatus) ? (
                    <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={18} />
                  ) : jobStatus === "failed" ? (
                    <XCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
                  ) : (
                    <Clock className="text-gray-400 shrink-0 mt-0.5" size={18} />
                  )}
                  <div>
                    <h4 className="font-bold text-sm text-gray-900">Converting and Normalising Audio</h4>
                    <p className="text-xs text-gray-500">FFmpeg converting format to 16kHz mono WAV</p>
                  </div>
                </div>

                {/* Transcription / Whisper */}
                <div className="flex items-start space-x-3">
                  {jobStatus === "transcribing" ? (
                    <RefreshCw className="animate-spin text-blue-700 shrink-0 mt-0.5" size={18} />
                  ) : ["summarising", "completed"].includes(jobStatus) ? (
                    <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={18} />
                  ) : jobStatus === "failed" ? (
                    <XCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
                  ) : (
                    <Clock className="text-gray-400 shrink-0 mt-0.5" size={18} />
                  )}
                  <div>
                    <h4 className="font-bold text-sm text-gray-900">Faster-Whisper AI Transcription</h4>
                    <p className="text-xs text-gray-500">Generating transcript text timestamps</p>
                  </div>
                </div>
              </div>

              {/* Progress feedback bar */}
              <div className="border-t border-gray-100 pt-5 flex flex-col items-center justify-center space-y-3">
                {jobStatus === "completed" ? (
                  <div className="text-center">
                    <CheckCircle className="text-green-600 mx-auto mb-2" size={32} />
                    <h4 className="font-bold text-sm text-green-700">Transcription Completed!</h4>
                    <p className="text-xs text-gray-500 mt-1">Redirecting you to meeting workspace...</p>
                  </div>
                ) : jobStatus === "failed" ? (
                  <div className="w-full text-center">
                    <XCircle className="text-red-600 mx-auto mb-2" size={32} />
                    <h4 className="font-bold text-sm text-red-700">Processing Failed</h4>
                    <p className="text-xs text-red-500 bg-red-50 border border-red-200 p-3 rounded mt-2 text-left">
                      {jobError || "An unexpected error occurred during audio processing."}
                    </p>
                    <div className="mt-4 flex space-x-3 justify-center">
                      <button
                        onClick={() => setStep(2)}
                        className="bg-white border border-gray-300 text-gray-700 py-1.5 px-4 rounded text-xs hover:bg-gray-50 font-semibold"
                      >
                        Adjust Source File
                      </button>
                      <button
                        onClick={startProcessingPipeline}
                        className="bg-blue-700 hover:bg-blue-800 text-white py-1.5 px-4 rounded text-xs font-semibold"
                      >
                        Retry Process
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full text-center">
                    <p className="text-xs text-gray-500 animate-pulse font-medium">
                      Pipeline state: <span className="font-bold uppercase text-blue-700">{jobStatus}</span> &bull; Progress: {jobProgress}%
                    </p>
                    <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-blue-700 h-2 rounded-full transition-all duration-300" style={{ width: `${jobProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
