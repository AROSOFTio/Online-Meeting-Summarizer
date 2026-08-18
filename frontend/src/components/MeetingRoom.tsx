"use client";

import React, { useState, useEffect } from "react";
import { MicrophoneButton } from "./MicrophoneButton";
import { MuteButton } from "./MuteButton";
import { ParticipantList, ParticipantItem } from "./ParticipantList";
import { Transcript, Segment } from "./Transcript";
import { MeetingReport, DecisionItem, ActionItemData } from "./MeetingReport";
import { Radio, Users, Sparkles } from "lucide-react";

interface MeetingRoomProps {
  meetingId: number | string;
  meetingTitle: string;
  joinCode?: string;
  initialParticipants?: ParticipantItem[];
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({
  meetingId,
  meetingTitle,
  joinCode,
  initialParticipants = [],
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [participants, setParticipants] = useState<ParticipantItem[]>(initialParticipants);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [actionItems, setActionItems] = useState<ActionItemData[]>([]);
  const [activeTab, setActiveTab] = useState<"room" | "transcript" | "report">("room");

  const handleToggleRecord = () => {
    if (!isRecording) {
      setIsRecording(true);
      // Simulate live AI voice segment detection
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
      // Trigger AI summary completion
      setSummary(
        `The meeting "${meetingTitle}" convened with ${participants.length} attendees. The agenda items were reviewed, decisions recorded, and action plans approved.`
      );
      setDecisions([
        { text: "Approved academic action plan for Starlight Secondary School." },
      ]);
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
      {/* Meeting Room Top Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h1 className="text-xl font-bold text-slate-100">{meetingTitle}</h1>
          </div>
          {joinCode && (
            <p className="text-xs text-slate-400 font-mono">
              Join Link: <span className="text-indigo-400 font-bold">starlightsecondaryschool.com/join/{joinCode}</span>
            </p>
          )}
        </div>

        {/* Tab Navigation & Controls */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-950 p-1 rounded-lg border border-slate-800 flex items-center text-xs">
            <button
              onClick={() => setActiveTab("room")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === "room" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Meeting Room
            </button>
            <button
              onClick={() => setActiveTab("transcript")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === "transcript" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Transcript ({segments.length})
            </button>
            <button
              onClick={() => setActiveTab("report")}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === "report" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Minutes Report
            </button>
          </div>

          <MuteButton isMuted={isMuted} onToggleMute={() => setIsMuted(!isMuted)} disabled={!isRecording} />
        </div>
      </div>

      {/* Main View Area */}
      {activeTab === "room" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Radio className={`w-10 h-10 ${isRecording ? "animate-pulse text-red-500" : ""}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">
                  {isRecording ? "Live Recording & AI Diarization Active" : "Ready to Start Meeting Session"}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Gemini AI is configured to capture all English regional accents accurately and assign speaker turns based on attendee roster.
                </p>
              </div>

              <MicrophoneButton
                isRecording={isRecording}
                isMuted={isMuted}
                onToggleRecord={handleToggleRecord}
                onToggleMute={() => setIsMuted(!isMuted)}
              />
            </div>

            <Transcript segments={segments} />
          </div>

          <div>
            <ParticipantList participants={participants} />
          </div>
        </div>
      )}

      {activeTab === "transcript" && (
        <div className="max-w-4xl mx-auto">
          <Transcript segments={segments} isEditable={true} />
        </div>
      )}

      {activeTab === "report" && (
        <div className="max-w-4xl mx-auto">
          <MeetingReport
            meetingTitle={meetingTitle}
            summaryText={summary || "Meeting session complete. Gemini AI has processed formal meeting minutes."}
            decisions={decisions}
            actionItems={actionItems}
            participants={participants.map((p) => p.name)}
          />
        </div>
      )}
    </div>
  );
};
