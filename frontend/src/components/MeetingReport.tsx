"use client";

import React, { useState } from "react";
import { CheckCircle2, Download, FileText, ListTodo, ShieldCheck, Users, Volume2 } from "lucide-react";

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
    <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            System Prepared Minutes
          </span>
          <h2 className="text-xl font-bold text-slate-100">{meetingTitle}</h2>
          <p className="mt-1 text-xs text-slate-400">{schoolName} • {dateStr}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handlePlayTTS} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${isPlayingAudio ? "animate-pulse bg-amber-500 text-white" : "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
            <Volume2 className="h-4 w-4 text-indigo-400" />
            <span>{isPlayingAudio ? "Reading Aloud..." : "Read Minutes (TTS)"}</span>
          </button>
          {onExportPDF && <button type="button" onClick={onExportPDF} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-700"><Download className="h-3.5 w-3.5" />Export PDF</button>}
          {onExportDOCX && <button type="button" onClick={onExportDOCX} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:bg-blue-700"><FileText className="h-3.5 w-3.5" />Export Word</button>}
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200"><FileText className="h-4 w-4 text-indigo-400" />Executive Summary & Formal Minutes</h3>
        <div className="whitespace-pre-line rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300">{summaryText || "The formal meeting minutes will appear here when processing is complete."}</div>
      </div>

      {keyPoints.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-slate-200">Key Discussion Points</h3><ul className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/40 p-3">{keyPoints.map((point,index)=><li key={`${point}-${index}`} className="flex items-start gap-2 text-xs text-slate-300"><span className="font-bold text-indigo-400">•</span><span>{point}</span></li>)}</ul></div>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /><h4 className="text-sm font-semibold text-slate-200">Formal Resolutions & Decisions</h4></div><div className="space-y-2">{decisions.map((decision,index)=><div key={decision.id??index} className="rounded border border-emerald-500/20 bg-emerald-950/20 p-2.5 text-xs text-emerald-300">{decision.text}</div>)}{decisions.length===0&&<p className="text-xs italic text-slate-500">No formal decisions logged yet.</p>}</div></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><div className="mb-3 flex items-center gap-2"><ListTodo className="h-4 w-4 text-amber-400" /><h4 className="text-sm font-semibold text-slate-200">Action Items Tracker</h4></div><div className="space-y-2">{actionItems.map((action,index)=><div key={action.id??index} className="flex items-start justify-between gap-2 rounded border border-slate-800 bg-slate-900 p-2.5 text-xs"><div><p className="font-medium text-slate-200">{action.description}</p>{action.assignee_name&&<span className="font-mono text-[10px] text-indigo-400">Assignee: {action.assignee_name}</span>}</div><span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${action.priority==="high"?"bg-red-500/20 text-red-400":action.priority==="medium"?"bg-amber-500/20 text-amber-400":"bg-slate-800 text-slate-400"}`}>{action.priority}</span></div>)}{actionItems.length===0&&<p className="text-xs italic text-slate-500">No action items assigned yet.</p>}</div></div>
      </div>

      {participants.length > 0 && <div className="flex items-center gap-2 border-t border-slate-800 pt-2 text-xs text-slate-400"><Users className="h-4 w-4 text-indigo-400" /><span>Confirmed Attendees: {participants.join(", ")}</span></div>}
    </div>
  );
};
