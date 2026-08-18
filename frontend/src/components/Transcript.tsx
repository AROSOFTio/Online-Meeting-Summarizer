"use client";

import React from "react";
import { MessageSquare, User, Clock } from "lucide-react";

export interface Segment {
  id?: number;
  start: number;
  end: number;
  text: string;
  speaker: string;
}

interface TranscriptProps {
  segments: Segment[];
  onSegmentEdit?: (index: number, newText: string) => void;
  isEditable?: boolean;
}

export const Transcript: React.FC<TranscriptProps> = ({
  segments,
  onSegmentEdit,
  isEditable = false,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-slate-100 text-base">Meeting Transcript</h3>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {segments.length} Speaker Segments
        </span>
      </div>

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
        {segments.map((seg, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-300 text-xs font-semibold px-2 py-0.5 rounded border border-indigo-500/20">
                  <User className="w-3 h-3" /> {seg.speaker || "Speaker"}
                </span>
              </div>
              <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                <Clock className="w-3 h-3 text-slate-500" />
                {formatTime(seg.start)} - {formatTime(seg.end)}
              </span>
            </div>

            {isEditable ? (
              <textarea
                value={seg.text}
                onChange={(e) => onSegmentEdit && onSegmentEdit(idx, e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                rows={2}
              />
            ) : (
              <p className="text-sm text-slate-300 leading-relaxed">{seg.text}</p>
            )}
          </div>
        ))}

        {segments.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm italic">
            No transcript generated yet. Start speaking or upload audio to process with Gemini AI.
          </div>
        )}
      </div>
    </div>
  );
};
