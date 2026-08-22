"use client";

import React from "react";
import { Clock, MessageSquare, User } from "lucide-react";

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
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-slate-100">Meeting Transcript</h3>
        </div>
        <span className="font-mono text-xs text-slate-400">{segments.length} Speaker Segments</span>
      </div>

      <div className="max-h-[500px] space-y-4 overflow-y-auto pr-2">
        {segments.map((segment, index) => (
          <div key={segment.id ?? index} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3.5 transition-all hover:border-indigo-500/30">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                  <User className="h-3 w-3" />{segment.speaker || "Speaker"}
                </span>
              </div>
              <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400"><Clock className="h-3 w-3 text-slate-500" />{formatTime(segment.start)} - {formatTime(segment.end)}</span>
            </div>

            {isEditable ? (
              <textarea value={segment.text} onChange={(event) => onSegmentEdit?.(index, event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none" rows={2} />
            ) : (
              <p className="text-sm leading-relaxed text-slate-300">{segment.text}</p>
            )}
          </div>
        ))}

        {segments.length === 0 && <div className="py-10 text-center text-sm italic text-slate-500">No transcript yet. Start speaking or upload audio and the system will process the recording.</div>}
      </div>
    </div>
  );
};
