"use client";

import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Pause, Trash2, Volume2 } from "lucide-react";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  onDiscard: () => void;
}

export default function AudioRecorder({ onRecordingComplete, onDiscard }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current || !dataArrayRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    const bufferLength = analyser.frequencyBinCount;

    const draw = () => {
      if (!isRecording) return;
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray as any);

      ctx.fillStyle = "#f9fafb";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw premium blue voice amplitude bars
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        ctx.fillStyle = `rgb(30, 64, 175)`; // Starlight dark-blue branding
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  };

  const startRecording = async () => {
    audioChunksRef.current = [];
    setAudioUrl(null);
    setSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio levels visualizer configuration
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      
      source.connect(analyser);
      analyserRef.current = analyser;
      
      const bufferLength = analyser.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);

      // Initialize media recorder
      const options = { mimeType: "audio/webm" };
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch {
        // Fallback for browsers with limited container types (Safari)
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        onRecordingComplete(audioBlob);
        cleanupAudio();
      };

      mediaRecorder.start(1000); // chunk every second
      setIsRecording(true);
      setIsPaused(false);
      
      // Delay slightly to ensure canvas is rendered
      setTimeout(drawWaveform, 100);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone permission denied. Please allow microphone access to record.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      drawWaveform();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const discardRecording = () => {
    cleanupAudio();
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setAudioUrl(null);
    setIsRecording(false);
    setIsPaused(false);
    setSeconds(0);
    onDiscard();
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white flex flex-col items-center justify-center space-y-5">
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${isRecording && !isPaused ? "bg-red-600 animate-pulse" : "bg-gray-400"}`} />
        <span className="text-lg font-bold text-gray-900 mono-font tracking-wide">
          {formatTime(seconds)}
        </span>
      </div>

      {/* Amplitude canvas */}
      {isRecording && (
        <div className="w-full max-w-md h-24 border border-gray-200 rounded bg-gray-50 overflow-hidden">
          <canvas ref={canvasRef} width="400" height="96" className="w-full h-full" />
        </div>
      )}

      {/* Control buttons */}
      <div className="flex items-center justify-center space-x-4">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-medium py-2.5 px-5 rounded transition-colors text-sm"
          >
            <Mic size={18} />
            <span>Start Recording</span>
          </button>
        ) : (
          <>
            {isPaused ? (
              <button
                type="button"
                onClick={resumeRecording}
                className="p-3 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full transition-colors"
                title="Resume Recording"
              >
                <Play size={20} />
              </button>
            ) : (
              <button
                type="button"
                onClick={pauseRecording}
                className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
                title="Pause Recording"
              >
                <Pause size={20} />
              </button>
            )}

            <button
              type="button"
              onClick={stopRecording}
              className="p-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-full transition-colors"
              title="Stop and Save"
            >
              <Square size={20} fill="currentColor" />
            </button>

            <button
              type="button"
              onClick={discardRecording}
              className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-red-600 rounded-full transition-colors"
              title="Discard Recording"
            >
              <Trash2 size={20} />
            </button>
          </>
        )}
      </div>

      {/* Playback preview container */}
      {audioUrl && !isRecording && (
        <div className="w-full max-w-md border border-blue-100 bg-blue-50/50 p-4 rounded flex flex-col space-y-2">
          <div className="flex items-center space-x-2 text-blue-800 font-semibold text-xs uppercase tracking-wide">
            <Volume2 size={16} />
            <span>Recording Preview</span>
          </div>
          <audio src={audioUrl} controls className="w-full focus:outline-none" />
        </div>
      )}
    </div>
  );
}
