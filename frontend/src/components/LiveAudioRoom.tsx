"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, LogOut, Mic, MicOff, Shield, UserRound, Users, Volume2, VolumeX } from "lucide-react";

import { apiRequest } from "@/lib/api";

interface LiveParticipant {
  peer_id: string;
  name: string;
  role_title: string;
  user_id: number | null;
  is_moderator: boolean;
  muted: boolean;
  forced_muted: boolean;
  is_self: boolean;
}

interface JoinResponse {
  meeting_id: number;
  peer_id: string;
  session_key: string;
  is_moderator: boolean;
  participants: LiveParticipant[];
}

interface SignalEnvelope {
  type: "offer" | "answer" | "ice" | "force-mute" | "release-mute" | "peer-left";
  from_peer_id: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | { reason?: string } | null;
}

interface LiveAudioRoomProps {
  meetingId: number;
  displayName: string;
  inviteCode?: string;
  providedStream?: MediaStream | null;
  autoJoin?: boolean;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onMicrophoneChange?: (stream: MediaStream) => void;
}

const TURN_URLS = (process.env.NEXT_PUBLIC_TURN_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
];

if (
  TURN_URLS.length > 0 &&
  process.env.NEXT_PUBLIC_TURN_USERNAME &&
  process.env.NEXT_PUBLIC_TURN_CREDENTIAL
) {
  ICE_SERVERS.push({
    urls: TURN_URLS,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  });
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 4,
};

async function openBestMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone access.");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
    },
    video: false,
  });
}

function friendlyMediaError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone permission is required. Allow microphone access in the browser, then tap Retry.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No working microphone was found on this device. Connect or enable a microphone, then tap Retry.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The microphone is busy in another app or browser tab. Close the other app, then tap Retry.";
    }
  }
  return error instanceof Error ? error.message : "Could not connect this device to the meeting.";
}

export default function LiveAudioRoom({
  meetingId,
  displayName,
  inviteCode,
  providedStream = null,
  autoJoin = true,
  onRemoteStream,
  onMicrophoneChange,
}: LiveAudioRoomProps) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localMuted, setLocalMuted] = useState(false);
  const [forcedMuted, setForcedMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [currentMicrophone, setCurrentMicrophone] = useState("");
  const [changingMicrophone, setChangingMicrophone] = useState(false);
  const [audioUnlockToken, setAudioUnlockToken] = useState(0);

  const peerIdRef = useRef("");
  const sessionKeyRef = useRef("");
  const joinedRef = useRef(false);
  const joiningRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ownsLocalStreamRef = useRef(false);
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pollingRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);

  const refreshMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter((device) => device.kind === "audioinput" && device.deviceId));
    } catch (deviceError) {
      console.warn("Microphone list unavailable:", deviceError);
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshMicrophones);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshMicrophones);
  }, [refreshMicrophones]);

  const closePeer = useCallback((remotePeerId: string) => {
    const connection = connectionsRef.current.get(remotePeerId);
    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.oniceconnectionstatechange = null;
      connection.close();
      connectionsRef.current.delete(remotePeerId);
    }
    pendingIceRef.current.delete(remotePeerId);
    setRemoteStreams((current) => {
      if (!current[remotePeerId]) return current;
      const next = { ...current };
      delete next[remotePeerId];
      return next;
    });
  }, []);

  const postSignal = useCallback(
    async (
      targetId: string,
      type: "offer" | "answer" | "ice",
      payload: RTCSessionDescriptionInit | RTCIceCandidateInit,
    ) => {
      if (!peerIdRef.current || !sessionKeyRef.current) return;
      try {
        await apiRequest(`/api/live-rooms/${meetingId}/signal`, {
          method: "POST",
          body: JSON.stringify({
            peer_id: peerIdRef.current,
            session_key: sessionKeyRef.current,
            target_id: targetId,
            type,
            payload,
          }),
        });
      } catch (signalError) {
        console.error("Live meeting signaling failed:", signalError);
      }
    },
    [meetingId],
  );

  const addPendingIce = useCallback((remotePeerId: string, candidate: RTCIceCandidateInit) => {
    const list = pendingIceRef.current.get(remotePeerId) || [];
    list.push(candidate);
    pendingIceRef.current.set(remotePeerId, list);
  }, []);

  const flushPendingIce = useCallback(async (remotePeerId: string, connection: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(remotePeerId) || [];
    pendingIceRef.current.delete(remotePeerId);
    for (const candidate of pending) {
      try {
        await connection.addIceCandidate(candidate);
      } catch (candidateError) {
        console.error("Could not add queued ICE candidate:", candidateError);
      }
    }
  }, []);

  const ensureConnection = useCallback(
    async (remotePeerId: string, initiate: boolean) => {
      if (!remotePeerId || remotePeerId === peerIdRef.current) return null;
      const existing = connectionsRef.current.get(remotePeerId);
      if (existing) return existing;

      const connection = new RTCPeerConnection(RTC_CONFIG);
      connectionsRef.current.set(remotePeerId, connection);

      const stream = localStreamRef.current;
      stream?.getAudioTracks().forEach((track) => connection.addTrack(track, stream));

      connection.onicecandidate = (event) => {
        if (event.candidate) void postSignal(remotePeerId, "ice", event.candidate.toJSON());
      };

      connection.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStreams((current) => ({ ...current, [remotePeerId]: remoteStream }));
        onRemoteStream?.(remotePeerId, remoteStream);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "closed") closePeer(remotePeerId);
      };

      connection.oniceconnectionstatechange = () => {
        if (
          connection.iceConnectionState === "failed" &&
          peerIdRef.current &&
          peerIdRef.current < remotePeerId
        ) {
          void (async () => {
            try {
              const offer = await connection.createOffer({ iceRestart: true });
              await connection.setLocalDescription(offer);
              await postSignal(remotePeerId, "offer", offer);
            } catch (restartError) {
              console.error("Could not restart meeting audio connection:", restartError);
            }
          })();
        }
      };

      if (initiate) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await postSignal(remotePeerId, "offer", offer);
      }
      return connection;
    },
    [closePeer, onRemoteStream, postSignal],
  );

  const handleSignal = useCallback(
    async (message: SignalEnvelope) => {
      if (message.type === "peer-left") {
        closePeer(message.from_peer_id);
        return;
      }

      if (message.type === "force-mute") {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        setForcedMuted(true);
        setLocalMuted(true);
        return;
      }

      if (message.type === "release-mute") {
        localStreamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setForcedMuted(false);
        setLocalMuted(false);
        return;
      }

      if (message.type === "offer") {
        const connection = await ensureConnection(message.from_peer_id, false);
        if (!connection || !message.payload) return;

        if (connection.signalingState !== "stable") {
          try {
            await connection.setLocalDescription({ type: "rollback" });
          } catch {
            // Some browsers do not support rollback; the next signal poll can recover.
          }
        }

        await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        await flushPendingIce(message.from_peer_id, connection);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await postSignal(message.from_peer_id, "answer", answer);
        return;
      }

      if (message.type === "answer") {
        const connection = connectionsRef.current.get(message.from_peer_id);
        if (!connection || !message.payload) return;
        await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        await flushPendingIce(message.from_peer_id, connection);
        return;
      }

      if (message.type === "ice" && message.payload) {
        const candidate = message.payload as RTCIceCandidateInit;
        const connection = connectionsRef.current.get(message.from_peer_id);
        if (!connection || !connection.remoteDescription) {
          addPendingIce(message.from_peer_id, candidate);
          return;
        }
        try {
          await connection.addIceCandidate(candidate);
        } catch (candidateError) {
          console.error("Could not add ICE candidate:", candidateError);
        }
      }
    },
    [addPendingIce, closePeer, ensureConnection, flushPendingIce, postSignal],
  );

  const joinRoom = useCallback(async () => {
    if (joinedRef.current || joiningRef.current) return;

    joiningRef.current = true;
    setJoining(true);
    setError(null);
    setPlaybackBlocked(false);

    let stream: MediaStream | null = providedStream;
    let ownsStream = false;

    try {
      if (!stream) {
        stream = await openBestMicrophone();
        ownsStream = true;
      }

      localStreamRef.current = stream;
      ownsLocalStreamRef.current = ownsStream;
      setCurrentMicrophone(stream.getAudioTracks()[0]?.getSettings().deviceId || "");
      void refreshMicrophones();

      const response = (await apiRequest(`/api/live-rooms/${meetingId}/join`, {
        method: "POST",
        body: JSON.stringify({
          invite_code: inviteCode || null,
          full_name: displayName || null,
        }),
      })) as JoinResponse;

      peerIdRef.current = response.peer_id;
      sessionKeyRef.current = response.session_key;
      joinedRef.current = true;
      setJoined(true);
      setIsModerator(response.is_moderator);
      setParticipants(response.participants);
      setLocalMuted(false);
      setForcedMuted(false);

      for (const participant of response.participants) {
        if (!participant.is_self) await ensureConnection(participant.peer_id, true);
      }
    } catch (joinError) {
      if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      ownsLocalStreamRef.current = false;
      setError(friendlyMediaError(joinError));
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [displayName, ensureConnection, inviteCode, meetingId, providedStream, refreshMicrophones]);

  const leaveRoom = useCallback(async () => {
    const peerId = peerIdRef.current;
    const sessionKey = sessionKeyRef.current;
    joinedRef.current = false;

    if (peerId && sessionKey) {
      try {
        await apiRequest(`/api/live-rooms/${meetingId}/leave`, {
          method: "POST",
          body: JSON.stringify({ peer_id: peerId, session_key: sessionKey }),
        });
      } catch {
        // Heartbeat cleanup will remove an unreachable peer.
      }
    }

    connectionsRef.current.forEach((connection) => connection.close());
    connectionsRef.current.clear();
    pendingIceRef.current.clear();

    if (ownsLocalStreamRef.current) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    }

    localStreamRef.current = null;
    ownsLocalStreamRef.current = false;
    peerIdRef.current = "";
    sessionKeyRef.current = "";
    setRemoteStreams({});
    setParticipants([]);
    setJoined(false);
    setIsModerator(false);
    setForcedMuted(false);
    setLocalMuted(false);
    setPlaybackBlocked(false);
  }, [meetingId]);

  const changeMicrophone = useCallback(async (deviceId: string) => {
    const previous = localStreamRef.current;
    if (!previous || changingMicrophone || !deviceId) return;
    setChangingMicrophone(true);
    setError(null);
    let replacement: MediaStream | null = null;
    try {
      replacement = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      const newTrack = replacement.getAudioTracks()[0];
      if (!newTrack) throw new Error("The selected microphone supplied no audio track.");
      newTrack.enabled = !localMuted && !forcedMuted;
      const oldTrack = previous.getAudioTracks()[0];
      const senders = Array.from(connectionsRef.current.values())
        .flatMap((connection) => connection.getSenders().filter((sender) => sender.track?.kind === "audio"));
      const switched: RTCRtpSender[] = [];
      try {
        for (const sender of senders) {
          await sender.replaceTrack(newTrack);
          switched.push(sender);
        }
        onMicrophoneChange?.(replacement);
      } catch (switchError) {
        await Promise.allSettled(switched.map((sender) => sender.replaceTrack(oldTrack || null)));
        throw switchError;
      }
      localStreamRef.current = replacement;
      ownsLocalStreamRef.current = true;
      if (ownsLocalStreamRef.current || previous !== providedStream) {
        // The caller owns a provided host stream and is informed above before release.
        previous.getTracks().forEach((track) => track.stop());
      }
      setCurrentMicrophone(newTrack.getSettings().deviceId || deviceId);
      replacement = null;
      void refreshMicrophones();
    } catch (deviceError) {
      replacement?.getTracks().forEach((track) => track.stop());
      setError(friendlyMediaError(deviceError));
    } finally {
      setChangingMicrophone(false);
    }
  }, [changingMicrophone, forcedMuted, localMuted, onMicrophoneChange, providedStream, refreshMicrophones]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current || forcedMuted) return;
    const nextMuted = !localMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setLocalMuted(nextMuted);
  }, [forcedMuted, localMuted]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerEnabled((current) => {
      const next = !current;
      if (next) {
        setPlaybackBlocked(false);
        setAudioUnlockToken((token) => token + 1);
      }
      return next;
    });
  }, []);

  const unlockMeetingAudio = useCallback(() => {
    setSpeakerEnabled(true);
    setPlaybackBlocked(false);
    setAudioUnlockToken((token) => token + 1);
  }, []);

  const handlePlaybackBlocked = useCallback(() => {
    setPlaybackBlocked(true);
  }, []);

  const moderate = useCallback(
    async (targetId: string, action: "mute" | "release") => {
      if (!peerIdRef.current || !sessionKeyRef.current) return;
      try {
        const data = await apiRequest(`/api/live-rooms/${meetingId}/moderate`, {
          method: "POST",
          body: JSON.stringify({
            peer_id: peerIdRef.current,
            session_key: sessionKeyRef.current,
            target_id: targetId,
            action,
          }),
        });
        setParticipants(data.participants || []);
      } catch (moderationError) {
        setError(
          moderationError instanceof Error
            ? moderationError.message
            : "Could not update participant microphone.",
        );
      }
    },
    [meetingId],
  );

  useEffect(() => {
    if (!autoJoin || autoJoinAttemptedRef.current) return;
    autoJoinAttemptedRef.current = true;
    const timer = window.setTimeout(() => void joinRoom(), 0);
    return () => window.clearTimeout(timer);
  }, [autoJoin, joinRoom]);

  useEffect(() => {
    if (!joined) return;

    let active = true;

    const pollSignals = async () => {
      if (!active || pollingRef.current || !peerIdRef.current || !sessionKeyRef.current) return;
      pollingRef.current = true;
      try {
        const query = new URLSearchParams({
          peer_id: peerIdRef.current,
          session_key: sessionKeyRef.current,
        });
        const data = await apiRequest(`/api/live-rooms/${meetingId}/signals?${query.toString()}`);
        for (const message of (data.messages || []) as SignalEnvelope[]) {
          if (!active) break;
          await handleSignal(message);
        }
      } catch (pollError) {
        if (active) console.error("Live meeting signal polling failed:", pollError);
      } finally {
        pollingRef.current = false;
      }
    };

    const heartbeat = async () => {
      if (!active || !peerIdRef.current || !sessionKeyRef.current) return;
      try {
        const data = await apiRequest(`/api/live-rooms/${meetingId}/heartbeat`, {
          method: "POST",
          body: JSON.stringify({
            peer_id: peerIdRef.current,
            session_key: sessionKeyRef.current,
            muted: localMuted,
          }),
        });

        if (!active) return;
        setParticipants(data.participants || []);

        if (data.forced_muted) {
          localStreamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          setForcedMuted(true);
          setLocalMuted(true);
        } else {
          setForcedMuted(false);
        }
      } catch (heartbeatError) {
        if (active) {
          setError(
            heartbeatError instanceof Error
              ? heartbeatError.message
              : "Live meeting connection was interrupted.",
          );
        }
      }
    };

    void pollSignals();
    void heartbeat();

    const signalTimer = window.setInterval(() => void pollSignals(), 450);
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 1500);

    return () => {
      active = false;
      window.clearInterval(signalTimer);
      window.clearInterval(heartbeatTimer);
    };
  }, [handleSignal, joined, localMuted, meetingId]);

  useEffect(
    () => () => {
      if (!joinedRef.current) return;

      const peerId = peerIdRef.current;
      const sessionKey = sessionKeyRef.current;
      joinedRef.current = false;

      if (peerId && sessionKey) {
        void fetch(`/api/live-rooms/${meetingId}/leave`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peer_id: peerId, session_key: sessionKey }),
        });
      }

      connectionsRef.current.forEach((connection) => connection.close());
      connectionsRef.current.clear();

      if (ownsLocalStreamRef.current) {
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
      }
    },
    [meetingId],
  );

  const otherParticipants = participants.filter((participant) => !participant.is_self);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      {!joined ? (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <Headphones size={26} />
          </div>
          <h2 className="mt-3 text-lg font-extrabold text-slate-950">
            {joining ? "Joining meeting..." : error ? "Meeting audio needs attention" : "Connecting meeting audio..."}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            The best available/default microphone is selected automatically. There is no microphone-selection or second join step.
          </p>
          {joining && <div className="mx-auto mt-5 h-8 w-8 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />}
          {error && (
            <>
              <div className="mx-auto mt-4 max-w-xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
              <button
                type="button"
                onClick={() => void joinRoom()}
                disabled={joining}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Mic size={17} />
                Retry
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {playbackBlocked && speakerEnabled && Object.keys(remoteStreams).length > 0 && (
            <button
              type="button"
              onClick={unlockMeetingAudio}
              className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-900 hover:bg-amber-100"
            >
              Tap once to enable meeting audio on this device
            </button>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
                <h2 className="font-extrabold text-slate-950">Meeting audio connected</h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {participants.length} connected participant{participants.length === 1 ? "" : "s"}. Default microphone connected automatically.
              </p>
              {microphones.length > 1 && (
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <span>Change mic (optional)</span>
                  <select aria-label="Change microphone" value={currentMicrophone} disabled={changingMicrophone} onChange={(event) => void changeMicrophone(event.target.value)} className="max-w-48 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
                    {!microphones.some((device) => device.deviceId === currentMicrophone) && <option value="">Current microphone</option>}
                    {microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
                  </select>
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleMute}
                disabled={forcedMuted}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold ${
                  localMuted ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {localMuted ? <MicOff size={15} /> : <Mic size={15} />}
                {forcedMuted ? "Mic off by organiser" : localMuted ? "Turn my mic ON" : "Turn my mic OFF"}
              </button>

              <button
                type="button"
                onClick={toggleSpeaker}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold ${
                  speakerEnabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                }`}
              >
                {speakerEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                {speakerEnabled ? "Speaker ON" : "Speaker OFF"}
              </button>

              <button
                type="button"
                onClick={() => void leaveRoom()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700"
              >
                <LogOut size={15} />
                Disconnect
              </button>
            </div>
          </div>

          {isModerator && otherParticipants.length > 0 && (
            <button
              type="button"
              onClick={() => void moderate("*", "mute")}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
            >
              <VolumeX size={15} />
              Turn OFF all other microphones
            </button>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {participants.map((participant) => (
              <div
                key={participant.peer_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800">
                    <UserRound size={17} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-slate-900">{participant.name}</span>
                      {participant.is_self && <span className="text-[10px] font-bold text-blue-700">YOU</span>}
                      {participant.is_moderator && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Shield size={10} />
                          Organiser
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      {participant.muted ? <MicOff size={12} /> : <Mic size={12} />}
                      <span>
                        {participant.role_title || "Participant"} · {participant.muted ? "Microphone OFF" : "Microphone ON"}
                      </span>
                    </div>
                  </div>
                </div>

                {isModerator && !participant.is_self && (
                  <button
                    type="button"
                    onClick={() => void moderate(participant.peer_id, participant.muted ? "release" : "mute")}
                    className={`shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-bold ${
                      participant.muted
                        ? "border border-green-200 bg-green-50 text-green-700"
                        : "border border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {participant.muted ? "Turn Mic ON" : "Turn Mic OFF"}
                  </button>
                )}
              </div>
            ))}
          </div>

          {participants.length === 1 && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
              <Users size={15} />
              Other invited devices will join audio automatically when they enter the meeting.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div
            className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
            aria-hidden="true"
          >
            {Object.entries(remoteStreams).map(([remotePeerId, stream]) => (
              <RemoteAudio
                key={remotePeerId}
                stream={stream}
                enabled={speakerEnabled}
                unlockToken={audioUnlockToken}
                onPlaybackBlocked={handlePlaybackBlocked}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RemoteAudio({
  stream,
  enabled,
  unlockToken,
  onPlaybackBlocked,
}: {
  stream: MediaStream;
  enabled: boolean;
  unlockToken: number;
  onPlaybackBlocked: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.srcObject = stream;
    audio.muted = !enabled;

    const play = () => {
      if (!enabled) return;
      void audio.play().catch(() => onPlaybackBlocked());
    };

    play();
    audio.addEventListener("loadedmetadata", play);
    audio.addEventListener("canplay", play);

    const tracks = stream.getAudioTracks();
    tracks.forEach((track) => track.addEventListener("unmute", play));

    return () => {
      audio.removeEventListener("loadedmetadata", play);
      audio.removeEventListener("canplay", play);
      tracks.forEach((track) => track.removeEventListener("unmute", play));
      audio.srcObject = null;
    };
  }, [enabled, onPlaybackBlocked, stream, unlockToken]);

  return <audio ref={audioRef} autoPlay playsInline muted={!enabled} />;
}
