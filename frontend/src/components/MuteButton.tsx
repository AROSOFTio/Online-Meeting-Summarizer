"use client";

import React from "react";
import { Mic, MicOff } from "lucide-react";

interface MuteButtonProps {
  isMuted: boolean;
  onToggleMute: () => void;
  disabled?: boolean;
}

export const MuteButton: React.FC<MuteButtonProps> = ({
  isMuted,
  onToggleMute,
  disabled = false,
}) => {
  return (
    <button
      onClick={onToggleMute}
      disabled={disabled}
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors ${
        isMuted
          ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {isMuted ? (
        <>
          <MicOff className="w-4 h-4 text-red-400" />
          <span>Unmute</span>
        </>
      ) : (
        <>
          <Mic className="w-4 h-4 text-emerald-400" />
          <span>Mute Mic</span>
        </>
      )}
    </button>
  );
};
