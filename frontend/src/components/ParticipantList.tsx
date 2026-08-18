"use client";

import React from "react";
import { UserCheck, Shield, Mic, MicOff } from "lucide-react";

export interface ParticipantItem {
  id: number | string;
  name: string;
  role_title?: string;
  email?: string;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isOrganizer?: boolean;
}

interface ParticipantListProps {
  participants: ParticipantItem[];
}

export const ParticipantList: React.FC<ParticipantListProps> = ({ participants }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-slate-100 text-sm">Attendance List</h3>
        </div>
        <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-mono">
          {participants.length} Active
        </span>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {participants.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
              p.isSpeaking
                ? "bg-emerald-950/40 border-emerald-500/40"
                : "bg-slate-800/60 border-slate-700/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold uppercase shadow-sm">
                  {p.name.substring(0, 2)}
                </div>
                {p.isSpeaking && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-200">{p.name}</span>
                  {p.isOrganizer && (
                    <span className="inline-flex items-center gap-0.5 bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.2 rounded border border-amber-500/30">
                      <Shield className="w-2.5 h-2.5" /> Organizer
                    </span>
                  )}
                </div>
                {p.role_title && (
                  <p className="text-xs text-slate-400">{p.role_title}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {p.isMuted ? (
                <MicOff className="w-4 h-4 text-slate-500" />
              ) : (
                <Mic className={`w-4 h-4 ${p.isSpeaking ? "text-emerald-400 animate-pulse" : "text-slate-400"}`} />
              )}
            </div>
          </div>
        ))}

        {participants.length === 0 && (
          <p className="text-xs text-slate-500 italic py-4 text-center">
            No attendees recorded yet.
          </p>
        )}
      </div>
    </div>
  );
};
