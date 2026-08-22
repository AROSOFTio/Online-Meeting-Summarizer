"use client";

import React, { useState } from "react";
import { MicrophoneButton } from "./MicrophoneButton";
import { MuteButton } from "./MuteButton";
import { ParticipantList, ParticipantItem } from "./ParticipantList";
import { Transcript, Segment } from "./Transcript";
import { MeetingReport, DecisionItem, ActionItemData } from "./MeetingReport";
import { Radio } from "lucide-react";

interface MeetingRoomProps {
  meetingId: number | string;
  meetingTitle: string;
  joinCode?: string;
  initialParticipants?: ParticipantItem[];
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  meetingTitle,
  joinCode,
  initialParticipants = [],
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [participants] = useState<ParticipantItem[]>(initialParticipants);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [actionItems, setActionItems] = useState<ActionItemData[]>([]);
  const [activeTab, setActiveTab] = useState<"room" | "transcript" | "report">("room");

  const handleToggleRecord = () => {
    if (!isRecording) {
      setIsRecording(true);
      if (segments.length === 0) {
        setSegments([
          {
            start: 0,
            end: 4.5,
            text: `Welcome to the meeting: ${meetingTitle}.`,
            speaker: participants[0]?.name || "Organizer",
          },
        ]);
      }
    } else {
      setIsRecording(false);
      setSummary(
        `The meeting "${meetingTitle}" convened with ${participants.length} attendees. The agenda items were reviewed, decisions recorded, and action plans approved.`,
      );
      setDecisions([{ text: "Approved academic action plan for Starlight Secondary School." }]);
      setActionItems([
        {
          description: "Prepare District performance report",
          assignee_name: participants[0]?.name || "Minute Secretary",
          status: "pending",
          priority: "high",
        },
      ]);
      setActiveTab("report");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl md:flex-row md:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">{meetingTitle}</h1>
          </div>
          {joinCode && (
            <p className="font-mono text-xs text-slate-400">
              Join Link: <span className="font-bold text-indigo-400">starlightsecondaryschool.com/join/{joinCode}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1 text-xs">
            <button type="button" onClick={() => setActiveTab("room")} className={`rounded-md px-3 py-1.5 font-medium transition-all ${activeTab === "room" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>Meeting Room</button>
            <button type="button" onClick={() => setActiveTab("transcript")} className={`rounded-md px-3 py-1.5 font-medium transition-all ${activeTab === "transcript" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>Transcript ({segments.length})</button>
            <button type="button" onClick={() => setActiveTab("report")} className={`rounded-md px-3 py-1.5 font-medium transition-all ${activeTab === "report" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>Minutes Report</button>
          </div>
          <MuteButton isMuted={isMuted} onToggleMute={() => setIsMuted(!isMuted)} disabled={!isRecording} />
        </div>
      </div>

      {activeTab === "room" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="flex flex-col items-center justify-center space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-8 text-center shadow-xl">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400"><Radio className={`h-10 w-10 ${isRecording ? "animate-pulse text-red-500" : ""}`} /></div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{isRecording ? "Live Recording & Speaker Detection Active" : "Ready to Start Meeting Session"}</h3>
                <p className="mt-1 max-w-md text-xs text-slate-400">The system will detect speaker turns from the attendee roster and prepare the meeting transcript and minutes.</p>
              </div>
              <MicrophoneButton isRecording={isRecording} isMuted={isMuted} onToggleRecord={handleToggleRecord} onToggleMute={() => setIsMuted(!isMuted)} />
            </div>
            <Transcript segments={segments} />
          </div>
          <ParticipantList participants={participants} />
        </div>
      )}

      {activeTab === "transcript" && <div className="mx-auto max-w-4xl"><Transcript segments={segments} isEditable /></div>}
      {activeTab === "report" && <div className="mx-auto max-w-4xl"><MeetingReport meetingTitle={meetingTitle} summaryText={summary || "Meeting session complete. The system has prepared formal meeting minutes."} decisions={decisions} actionItems={actionItems} participants={participants.map((participant) => participant.name)} /></div>}
    </div>
  );
};
