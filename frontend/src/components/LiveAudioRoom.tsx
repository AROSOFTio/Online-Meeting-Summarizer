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
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

export default function LiveAudioRoom({ meetingId, displayName, inviteCode, providedStream = null, autoJoin = false, onRemoteStream }: LiveAudioRoomProps) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localMuted, setLocalMuted] = useState(false);
  const [forcedMuted, setForcedMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");

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

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((device) => device.kind === "audioinput"));
    } catch {
      // Device names can remain unavailable until microphone permission is granted.
    }
  }, []);

  useEffect(() => { void refreshDevices(); }, [refreshDevices]);

  const closePeer = useCallback((remotePeerId: string) => {
    const connection = connectionsRef.current.get(remotePeerId);
    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
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

  const postSignal = useCallback(async (targetId: string, type: "offer" | "answer" | "ice", payload: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    if (!peerIdRef.current || !sessionKeyRef.current) return;
    try {
      await apiRequest(`/api/live-rooms/${meetingId}/signal`, {
        method: "POST",
        body: JSON.stringify({ peer_id: peerIdRef.current, session_key: sessionKeyRef.current, target_id: targetId, type, payload }),
      });
    } catch (signalError) {
      console.error("Live meeting signaling failed:", signalError);
    }
  }, [meetingId]);

  const addPendingIce = useCallback((remotePeerId: string, candidate: RTCIceCandidateInit) => {
    const list = pendingIceRef.current.get(remotePeerId) || [];
    list.push(candidate);
    pendingIceRef.current.set(remotePeerId, list);
  }, []);

  const flushPendingIce = useCallback(async (remotePeerId: string, connection: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(remotePeerId) || [];
    pendingIceRef.current.delete(remotePeerId);
    for (const candidate of pending) {
      try { await connection.addIceCandidate(candidate); } catch (candidateError) { console.error("Could not add queued ICE candidate:", candidateError); }
    }
  }, []);

  const ensureConnection = useCallback(async (remotePeerId: string, initiate: boolean) => {
    if (!remotePeerId || remotePeerId === peerIdRef.current) return null;
    const existing = connectionsRef.current.get(remotePeerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection(RTC_CONFIG);
    connectionsRef.current.set(remotePeerId, connection);
    const stream = localStreamRef.current;
    stream?.getAudioTracks().forEach((track) => connection.addTrack(track, stream));

    connection.onicecandidate = (event) => { if (event.candidate) void postSignal(remotePeerId, "ice", event.candidate.toJSON()); };
    connection.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams((current) => ({ ...current, [remotePeerId]: remoteStream }));
      onRemoteStream?.(remotePeerId, remoteStream);
    };
    connection.onconnectionstatechange = () => { if (["failed", "closed"].includes(connection.connectionState)) closePeer(remotePeerId); };

    if (initiate) {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await postSignal(remotePeerId, "offer", offer);
    }
    return connection;
  }, [closePeer, onRemoteStream, postSignal]);

  const handleSignal = useCallback(async (message: SignalEnvelope) => {
    if (message.type === "peer-left") { closePeer(message.from_peer_id); return; }
    if (message.type === "force-mute") {
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      setForcedMuted(true);
      setLocalMuted(true);
      return;
    }
    if (message.type === "release-mute") {
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
      setForcedMuted(false);
      setLocalMuted(false);
      return;
    }
    if (message.type === "offer") {
      const connection = await ensureConnection(message.from_peer_id, false);
      if (!connection || !message.payload) return;
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
      if (!connection || !connection.remoteDescription) { addPendingIce(message.from_peer_id, candidate); return; }
      try { await connection.addIceCandidate(candidate); } catch (candidateError) { console.error("Could not add ICE candidate:", candidateError); }
    }
  }, [addPendingIce, closePeer, ensureConnection, flushPendingIce, postSignal]);

  const joinRoom = useCallback(async () => {
    if (joinedRef.current || joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    setError(null);

    let stream: MediaStream | null = providedStream;
    let ownsStream = false;
    try {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputId ? { exact: selectedInputId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        ownsStream = true;
      }
      localStreamRef.current = stream;
      ownsLocalStreamRef.current = ownsStream;
      await refreshDevices();

      const response = (await apiRequest(`/api/live-rooms/${meetingId}/join`, {
        method: "POST",
        body: JSON.stringify({ invite_code: inviteCode || null, full_name: displayName || null }),
      })) as JoinResponse;

      peerIdRef.current = response.peer_id;
      sessionKeyRef.current = response.session_key;
      joinedRef.current = true;
      setJoined(true);
      setIsModerator(response.is_moderator);
      setParticipants(response.participants);
      setLocalMuted(false);
      setForcedMuted(false);

      for (const participant of response.participants) if (!participant.is_self) await ensureConnection(participant.peer_id, true);
    } catch (joinError) {
      if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      ownsLocalStreamRef.current = false;
      setError(joinError instanceof Error ? joinError.message : "Could not connect this microphone to the meeting.");
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [displayName, ensureConnection, inviteCode, meetingId, providedStream, refreshDevices, selectedInputId]);

  const switchMicrophone = useCallback(async (deviceId: string) => {
    setSelectedInputId(deviceId);
    if (!joined || providedStream) return;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const nextTrack = nextStream.getAudioTracks()[0];
      if (!nextTrack) return;
      const previous = localStreamRef.current;
      for (const connection of connectionsRef.current.values()) {
        const sender = connection.getSenders().find((item) => item.track?.kind === "audio");
        if (sender) await sender.replaceTrack(nextTrack);
      }
      previous?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = nextStream;
      ownsLocalStreamRef.current = true;
      setLocalMuted(false);
      setForcedMuted(false);
      await refreshDevices();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Could not switch microphone.");
    }
  }, [joined, providedStream, refreshDevices]);

  const leaveRoom = useCallback(async () => {
    const peerId = peerIdRef.current;
    const sessionKey = sessionKeyRef.current;
    joinedRef.current = false;
    if (peerId && sessionKey) {
      try { await apiRequest(`/api/live-rooms/${meetingId}/leave`, { method: "POST", body: JSON.stringify({ peer_id: peerId, session_key: sessionKey }) }); } catch { /* heartbeat will clean up */ }
    }
    connectionsRef.current.forEach((connection) => connection.close());
    connectionsRef.current.clear();
    pendingIceRef.current.clear();
    if (ownsLocalStreamRef.current) localStreamRef.current?.getTracks().forEach((track) => track.stop());
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
  }, [meetingId]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current || forcedMuted) return;
    const nextMuted = !localMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setLocalMuted(nextMuted);
  }, [forcedMuted, localMuted]);

  const moderate = useCallback(async (targetId: string, action: "mute" | "release") => {
    if (!peerIdRef.current || !sessionKeyRef.current) return;
    try {
      const data = await apiRequest(`/api/live-rooms/${meetingId}/moderate`, {
        method: "POST",
        body: JSON.stringify({ peer_id: peerIdRef.current, session_key: sessionKeyRef.current, target_id: targetId, action }),
      });
      setParticipants(data.participants || []);
    } catch (moderationError) {
      setError(moderationError instanceof Error ? moderationError.message : "Could not update participant microphone.");
    }
  }, [meetingId]);

  useEffect(() => {
    if (!autoJoin || autoJoinAttemptedRef.current || !providedStream) return;
    autoJoinAttemptedRef.current = true;
    void joinRoom();
  }, [autoJoin, joinRoom, providedStream]);

  useEffect(() => {
    if (!joined) return;
    let active = true;
    const pollSignals = async () => {
      if (!active || pollingRef.current || !peerIdRef.current || !sessionKeyRef.current) return;
      pollingRef.current = true;
      try {
        const query = new URLSearchParams({ peer_id: peerIdRef.current, session_key: sessionKeyRef.current });
        const data = await apiRequest(`/api/live-rooms/${meetingId}/signals?${query.toString()}`);
        for (const message of (data.messages || []) as SignalEnvelope[]) { if (!active) break; await handleSignal(message); }
      } catch (pollError) { if (active) console.error("Live meeting signal polling failed:", pollError); }
      finally { pollingRef.current = false; }
    };
    const heartbeat = async () => {
      if (!active || !peerIdRef.current || !sessionKeyRef.current) return;
      try {
        const data = await apiRequest(`/api/live-rooms/${meetingId}/heartbeat`, {
          method: "POST",
          body: JSON.stringify({ peer_id: peerIdRef.current, session_key: sessionKeyRef.current, muted: localMuted }),
        });
        if (!active) return;
        setParticipants(data.participants || []);
        if (data.forced_muted) {
          localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
          setForcedMuted(true);
          setLocalMuted(true);
        } else setForcedMuted(false);
      } catch (heartbeatError) { if (active) setError(heartbeatError instanceof Error ? heartbeatError.message : "Live microphone connection was interrupted."); }
    };
    void pollSignals(); void heartbeat();
    const signalTimer = window.setInterval(() => void pollSignals(), 450);
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 1500);
    return () => { active = false; window.clearInterval(signalTimer); window.clearInterval(heartbeatTimer); };
  }, [handleSignal, joined, localMuted, meetingId]);

  useEffect(() => () => {
    if (!joinedRef.current) return;
    const peerId = peerIdRef.current;
    const sessionKey = sessionKeyRef.current;
    joinedRef.current = false;
    if (peerId && sessionKey) void fetch(`/api/live-rooms/${meetingId}/leave`, { method: "POST", credentials: "include", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer_id: peerId, session_key: sessionKey }) });
    connectionsRef.current.forEach((connection) => connection.close());
    connectionsRef.current.clear();
    if (ownsLocalStreamRef.current) localStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, [meetingId]);

  const otherParticipants = participants.filter((participant) => !participant.is_self);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      {!joined ? (
        <div>
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700"><Mic size={26} /></div>
            <h2 className="mt-3 text-lg font-extrabold text-slate-950">Connect this meeting microphone</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">This is a physical meeting, not a video call. Connect the phone, laptop, USB microphone, Bluetooth microphone or room audio interface that should contribute sound to the meeting record.</p>
          </div>
          {!providedStream && audioInputs.length > 0 && <label className="mx-auto mt-5 block max-w-xl text-xs font-bold text-slate-700">Microphone / room audio source
            <select value={selectedInputId} onChange={(event) => setSelectedInputId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
              <option value="">Default microphone</option>
              {audioInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
            </select>
          </label>}
          <div className="text-center"><button type="button" onClick={() => void joinRoom()} disabled={joining} className="mt-5 inline-flex min-w-60 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"><Mic size={17} />{joining ? "Connecting..." : "Connect Microphone"}</button></div>
          {error && <div className="mx-auto mt-4 max-w-xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" /><h2 className="font-extrabold text-slate-950">Microphones connected to meeting record</h2></div><p className="mt-1 text-xs text-slate-500">{participants.length} connected source{participants.length === 1 ? "" : "s"}. Each participant controls their own microphone and speaker.</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleMute} disabled={forcedMuted} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold ${localMuted ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"} disabled:cursor-not-allowed disabled:opacity-60`}>{localMuted ? <MicOff size={15}/> : <Mic size={15}/>} {forcedMuted ? "Mic off by organiser" : localMuted ? "Turn my mic ON" : "Turn my mic OFF"}</button>
              <button type="button" onClick={() => setSpeakerEnabled((value) => !value)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold ${speakerEnabled ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>{speakerEnabled ? <Volume2 size={15}/> : <VolumeX size={15}/>} {speakerEnabled ? "Speaker ON" : "Speaker OFF"}</button>
              <button type="button" onClick={() => void leaveRoom()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700"><LogOut size={15}/>Disconnect</button>
            </div>
          </div>

          {!providedStream && audioInputs.length > 1 && <label className="block text-xs font-bold text-slate-700">Change microphone / room audio source
            <select value={selectedInputId} onChange={(event) => void switchMicrophone(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 sm:max-w-xl"><option value="">Default microphone</option>{audioInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select>
          </label>}

          {isModerator && otherParticipants.length > 0 && <button type="button" onClick={() => void moderate("*", "mute")} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"><VolumeX size={15}/>Turn OFF all other microphones</button>}

          <div className="grid gap-2 sm:grid-cols-2">
            {participants.map((participant) => (
              <div key={participant.peer_id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800"><UserRound size={17}/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-bold text-slate-900">{participant.name}</span>{participant.is_self && <span className="text-[10px] font-bold text-blue-700">YOU</span>}{participant.is_moderator && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Shield size={10}/>Organiser</span>}</div><div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">{participant.muted ? <MicOff size={12}/> : <Mic size={12}/>}<span>{participant.role_title || "Participant"} · {participant.muted ? "Microphone OFF" : "Microphone ON"}</span></div></div></div>
                {isModerator && !participant.is_self && <button type="button" onClick={() => void moderate(participant.peer_id, participant.muted ? "release" : "mute")} className={`shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-bold ${participant.muted ? "border border-green-200 bg-green-50 text-green-700" : "border border-red-200 bg-red-50 text-red-700"}`}>{participant.muted ? "Turn Mic ON" : "Turn Mic OFF"}</button>}
              </div>
            ))}
          </div>

          {participants.length === 1 && <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500"><Users size={15}/>Other phones or room microphones can connect at any time while the meeting continues.</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="sr-only" aria-hidden="true">{Object.entries(remoteStreams).map(([remotePeerId, stream]) => <RemoteAudio key={remotePeerId} stream={stream} enabled={speakerEnabled}/>)}</div>
        </div>
      )}
    </section>
  );
}

function RemoteAudio({ stream, enabled }: { stream: MediaStream; enabled: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    audio.muted = !enabled;
    if (enabled) void audio.play().catch(() => {});
  }, [enabled, stream]);
  return <audio ref={audioRef} autoPlay muted={!enabled}/>;
}
