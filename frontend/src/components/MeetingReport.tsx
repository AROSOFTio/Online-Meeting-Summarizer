"use client";

import React, { useState } from "react";
import { FileText, Download, CheckCircle2, ListTodo, Users, Volume2, Sparkles } from "lucide-react";

export interface DecisionItem {
  id?: number;
  text: string;
}

export interface ActionItemData {
  id?: number;
  description: string;
  assignee_name?: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  deadline?: string;
}

interface MeetingReportProps {
  meetingTitle: string;
  schoolName?: string;
  dateStr?: string;
  summaryText: string;
  keyPoints?: string[];
  decisions: DecisionItem[];
  actionItems: ActionItemData[];
  participants?: string[];
  onExportPDF?: () => void;
  onExportDOCX?: () => void;
  onExportTXT?: () => void;
  onSpeakSummary?: () => void;
}

export const MeetingReport: React.FC<MeetingReportProps> = ({
  meetingTitle,
  schoolName = "Starlight Secondary School",
  dateStr = new Date().toLocaleDateString(),
  summaryText,
  keyPoints = [],
  decisions,
  actionItems,
  participants = [],
  onExportPDF,
  onExportDOCX,
  onExportTXT,
  onSpeakSummary,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const handlePlayTTS = () => {
    if (onSpeakSummary) {
      onSpeakSummary();
    } else if ("speechSynthesis" in window) {
      setIsPlayingAudio(true);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(summaryText);
      utterance.rate = 0.95;
      utterance.onend = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Gemini Pro AI Verified Minutes
          </span>
          <h2 className="text-xl font-bold text-slate-100">{meetingTitle}</h2>
          <p className="text-xs text-slate-400 mt-1">
            {schoolName} • {dateStr}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePlayTTS}
            className={`px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
              isPlayingAudio
                ? "bg-amber-500 text-white animate-pulse"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
            }`}
          >
            <Volume2 className="w-4 h-4 text-indigo-400" />
            <span>{isPlayingAudio ? "Reading Aloud..." : "Read Minutes (TTS)"}</span>
          </button>

          {onExportPDF && (
            <button
              onClick={onExportPDF}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-md"
            >
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
          )}

          {onExportDOCX && (
            <button
              onClick={onExportDOCX}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-md"
            >
              <FileText className="w-3.5 h-3.5" /> Export Word
            </button>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" /> Executive Summary & Formal Minutes
        </h3>
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-line">
          {summaryText || "Gemini AI summary will be generated upon transcription completion."}
        </div>
      </div>

      {/* Key Discussion Points */}
      {keyPoints.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-2">Key Discussion Points</h3>
          <ul className="space-y-1.5 bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            {keyPoints.map((pt, i) => (
              <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                <span className="text-indigo-400 font-bold">•</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Grid: Decisions & Action Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Decisions */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h4 className="font-semibold text-slate-200 text-sm">Formal Resolutions & Decisions</h4>
          </div>
          <div className="space-y-2">
            {decisions.map((d, idx) => (
              <div key={idx} className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-300">
                {d.text}
              </div>
            ))}
            {decisions.length === 0 && (
              <p className="text-xs text-slate-500 italic">No formal decisions logged yet.</p>
            )}
          </div>
        </div>

        {/* Action Items */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ListTodo className="w-4 h-4 text-amber-400" />
            <h4 className="font-semibold text-slate-200 text-sm">Action Items Tracker</h4>
          </div>
          <div className="space-y-2">
            {actionItems.map((act, idx) => (
              <div key={idx} className="p-2.5 rounded bg-slate-900 border border-slate-800 text-xs flex justify-between items-start gap-2">
                <div>
                  <p className="text-slate-200 font-medium">{act.description}</p>
                  {act.assignee_name && (
                    <span className="text-[10px] text-indigo-400 font-mono">Assignee: {act.assignee_name}</span>
                  )}
                </div>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                    act.priority === "high"
                      ? "bg-red-500/20 text-red-400"
                      : act.priority === "medium"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {act.priority}
                </span>
              </div>
            ))}
            {actionItems.length === 0 && (
              <p className="text-xs text-slate-500 italic">No action items assigned yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Attendance summary */}
      {participants.length > 0 && (
        <div className="pt-2 border-t border-slate-800 flex items-center gap-2 text-xs text-slate-400">
          <Users className="w-4 h-4 text-indigo-400" />
          <span>Confirmed Attendees: {participants.join(", ")}</span>
        </div>
      )}
    </div>
  );
};
