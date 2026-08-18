"use client";

import React from "react";
import { Mic, MicOff } from "lucide-react";

interface MicrophoneButtonProps {
  isRecording: boolean;
  isMuted: boolean;
  onToggleRecord: () => void;
  onToggleMute: () => void;
  disabled?: boolean;
}

export const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({
  isRecording,
  isMuted,
  onToggleRecord,
  onToggleMute,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onToggleRecord}
        disabled={disabled}
        className={`flex items-center justify-center p-4 rounded-full transition-all duration-200 shadow-lg ${
          isRecording
            ? "bg-red-600 hover:bg-red-700 text-white animate-pulse ring-4 ring-red-300"
            : "bg-blue-600 hover:bg-blue-700 text-white hover:scale-105"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title={isRecording ? "Stop Recording" : "Start Microphone"}
      >
        <Mic className="w-6 h-6" />
      </button>

      {isRecording && (
        <button
          onClick={onToggleMute}
          className={`flex items-center justify-center p-3 rounded-full transition-all duration-150 ${
            isMuted ? "bg-amber-500 text-white" : "bg-slate-700 hover:bg-slate-800 text-white"
          }`}
          title={isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
};
