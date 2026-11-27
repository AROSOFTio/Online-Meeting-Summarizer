"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {Activity,RefreshCw,MoreVertical,UserPlus,Hand,Lock,Unlock,Settings,Square,Signal,Clock,Radio} from "lucide-react";
import "./live-room.css";
import { Headphones, LogOut, Mic, MicOff, Shield, UserRound, Users, Volume2, VolumeX } from "lucide-react";

import { apiRequest, ApiError } from "@/lib/api";
import {openMicrophone,mediaError,audioProfile,preferOpus,tuneAudioSender,type AudioProfile} from "@/lib/meeting-media";
import MicrophoneSetup from "./MicrophoneSetup";
import {classifyAudio,type AudioIssue,type PeerAudioSample} from "@/lib/audio-health";
import {Video,VideoOff,MonitorUp,MonitorOff,Maximize,LayoutGrid,PanelRight,PhoneOff} from "lucide-react";

interface LiveParticipant {
  peer_id: string;
  name: string;
  role_title: string;
  user_id: number | null;
  is_moderator: boolean;
  muted: boolean;
  microphone_available?: boolean;
  visual_mode?: "camera"|"screen"|null;
  forced_muted: boolean;
  is_self: boolean;
  hand_raised?:boolean;
}

interface JoinResponse {
  meeting_id: number;
  peer_id: string;
  session_key: string;
  is_moderator: boolean;
  participants: LiveParticipant[];
  ice_servers?: RTCIceServer[];
  ice_expires_at?: number;
  locked?:boolean;
  forced_muted?:boolean;
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
  onEndMeeting?:()=>void;
  onInvite?:()=>void;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {urls:["stun:stun.cloudflare.com:3478","stun:stun.l.google.com:19302"]},
];
export default function LiveAudioRoom({
  meetingId,
  displayName,
  inviteCode,
  providedStream = null,
  autoJoin = true,
  onRemoteStream,
  onMicrophoneChange, onEndMeeting, onInvite,
}: LiveAudioRoomProps) {
  const [joined, setJoined] = useState(false);
  const [panelTab,setPanelTab]=useState<"participants"|"health">("participants");
  const [roomLocked,setRoomLocked]=useState(false);
  const [openMenu,setOpenMenu]=useState<string|null>(null);
  const [showSettings,setShowSettings]=useState(false);
  const [healthMetrics,setHealthMetrics]=useState({rtt:null as number|null,loss:null as number|null,jitter:null as number|null});
  const [joining, setJoining] = useState(false);
  const [connectionNotice,setConnectionNotice]=useState<"offline"|"reconnecting"|null>(null);
  const recoveringRef=useRef(false);
  const recoveryNeededRef=useRef(false);
  const expiredRef=useRef(false);
  const nextRecoveryRef=useRef(0);
  const failuresRef=useRef(0);
  const heartbeatBusyRef=useRef(false);
  const generationRef=useRef(0);
  const peerRecoveryRef=useRef(new Map<string,number>());
  const peerRetryRef=useRef(new Map<string,number>());
  const [mediaConnected,setMediaConnected]=useState(0);
  const [audioReport,setAudioReport]=useState("");
  const [audioIssues,setAudioIssues]=useState<AudioIssue[]>([]);
  const [healthStatus,setHealthStatus]=useState<"checking"|"healthy"|"waiting"|"limited">("checking");
  const healthSamplesRef=useRef(new Map<string,PeerAudioSample>());
  const healthConnectionsRef=useRef(new Map<string,RTCPeerConnection>());
  const healthInputsRef=useRef({participants:[] as LiveParticipant[],speakerEnabled:true,playbackBlocked:false,localMuted:true,connectionNotice:null as "offline"|"reconnecting"|null});

  const [resumePrompt,setResumePrompt]=useState(false);
  const [resumeAfterModeration,setResumeAfterModeration]=useState(false);
  const consentResumeRef=useRef(false);
  const wasSpeakingRef=useRef(false);
  const moderationBusyRef=useRef(false);
  const [moderationBusy,setModerationBusy]=useState(false);
  const [moderationNotice,setModerationNotice]=useState("");
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localMuted, setLocalMuted] = useState(true);
  const [hasMicrophone,setHasMicrophone]=useState(false);
  const [micNotice,setMicNotice]=useState("");
  const micBusyRef=useRef(false);
  const forcedMuteRef=useRef(false);
  const [forcedMuted, setForcedMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [currentMicrophone, setCurrentMicrophone] = useState("");
  const [selectedMic,setSelectedMic]=useState("");
  const [profile,setProfile]=useState<AudioProfile>("voice");
  useEffect(()=>setProfile(audioProfile()),[]);
  const [testingMic,setTestingMic]=useState(false);
  const [visual,setVisual]=useState<MediaStream|null>(null);
  const [visualMode,setVisualMode]=useState<"camera"|"screen"|null>(null);
  const [visualBusy,setVisualBusy]=useState(false);
  const [visualError,setVisualError]=useState("");
  const [shareMenu,setShareMenu]=useState(false);
  const [gallery,setGallery]=useState(false);
  const [showVideo,setShowVideo]=useState(false);
  const [portrait,setPortrait]=useState(false);
  const [pin,setPin]=useState<string|null>(null);
  const [focusLayout,setFocusLayout]=useState(false);
  const [expanded,setExpanded]=useState<string|null>(null);
  const stageRef=useRef<HTMLDivElement>(null);
  const [remoteVisual,setRemoteVisual]=useState<Record<string,MediaStream>>({});
  const visualRef=useRef<MediaStream|null>(null);
  const visualModeRef=useRef<"camera"|"screen"|null>(null);
  useEffect(()=>{visualModeRef.current=visualMode;},[visualMode]);
  const visualBusyRef=useRef(false);
  const visualGeneration=useRef(0);
  const [changingMicrophone, setChangingMicrophone] = useState(false);
  const [audioUnlockToken, setAudioUnlockToken] = useState(0);

  const iceServersRef=useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);
  const iceExpiryRef=useRef(0);
  const iceRefreshRef=useRef(0);
  const peerIdRef = useRef("");
  const sessionKeyRef = useRef("");
  const joinedRef = useRef(false);
  const joiningRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ownsLocalStreamRef = useRef(false);
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const reconnectingRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  useEffect(()=>{healthInputsRef.current={participants,speakerEnabled,playbackBlocked,localMuted,connectionNotice};});
  useEffect(()=>{
    if(!joined){healthSamplesRef.current.clear();healthConnectionsRef.current.clear();setAudioIssues([]);setHealthStatus("checking");return;}
    let active=true,busy=false,lastTick=0;
    const sample=async()=>{
      if(!active||busy||!joinedRef.current)return;
      busy=true;
      const now=Date.now();
      // Background tabs can suspend timers. Do not mistake that for missing RTP.
      const elapsed=lastTick&&now-lastTick<9000?now-lastTick:0;
      lastTick=now;
      const generation=generationRef.current;
      const inputs=healthInputsRef.current;
      const mic=localStreamRef.current?.getAudioTracks()[0];
      const micState=!mic?"missing":mic.readyState==="ended"?"ended":mic.muted?"muted":"live";
      const forced=forcedMuteRef.current;
      const expectedTx=!!mic&&mic.readyState==="live"&&mic.enabled&&!mic.muted&&!forced;
      const others=inputs.participants.filter(p=>!p.is_self);
      const next=new Map<string,PeerAudioSample>();
      const nextConnections=new Map<string,RTCPeerConnection>();
      let available=0;
      try{
        await Promise.all(others.map(async p=>{
          const pc=connectionsRef.current.get(p.peer_id);
          const previous=healthConnectionsRef.current.get(p.peer_id)===pc?healthSamplesRef.current.get(p.peer_id):undefined;
          const expectedRx=!p.muted&&!p.forced_muted&&p.microphone_available!==false;
          const remote=pc?.getReceivers().find(r=>r.track.kind==="audio")?.track;
          const playback=Array.from(document.querySelectorAll<HTMLAudioElement>("audio[data-meeting-remote-audio]")).find(el=>el.srcObject instanceof MediaStream&&el.srcObject.getAudioTracks().some(t=>t===remote));
          const result:PeerAudioSample={id:p.peer_id,label:p.name,state:pc?.connectionState||"new",ice:pc?.iceConnectionState||"new",remoteMuted:p.muted,expectedRx,expectedTx,playback:!playback?"missing":playback.muted?"muted":playback.paused?"paused":"playing",age:(previous?.age||0)+elapsed};
          if(pc){
            nextConnections.set(p.peer_id,pc);
            try{
              const stats=[...(await pc.getStats()).values()];
              available++;
              const inbound=stats.find(x=>x.type==="inbound-rtp"&&(x.kind==="audio"||x.mediaType==="audio"));
              const outbound=stats.find(x=>x.type==="outbound-rtp"&&(x.kind==="audio"||x.mediaType==="audio"));
              const source=stats.find(x=>x.type==="media-source"&&x.kind==="audio");
              const pair=stats.find(x=>x.type==="candidate-pair"&&x.nominated&&x.state==="succeeded");
              result.rx=inbound?.bytesReceived;result.tx=outbound?.bytesSent;result.received=inbound?.packetsReceived;result.lost=inbound?.packetsLost;result.rtt=pair?.currentRoundTripTime;result.jitter=inbound?.jitter;result.sourceEnergy=source?.totalAudioEnergy;
              // Missing RTP reports on a connected peer are also meaningful after the grace period.
              const rx=result.rx??0,tx=result.tx??0;
              const sameRx=previous&&previous.expectedRx&&rx===(previous.rx??0);
              const sameTx=previous&&previous.expectedTx&&tx===(previous.tx??0);
              result.rxAge=expectedRx&&sameRx?(previous.rxAge||0)+elapsed:0;
              result.txAge=expectedTx&&sameTx?(previous.txAge||0)+elapsed:0;
              const loss=Math.max(0,(result.lost??0)-(previous?.lost??0));
              const received=Math.max(0,(result.received??0)-(previous?.received??0));
              const poor=!!previous&&((loss+received>=20&&loss/(loss+received)>.08)||(result.rtt??0)>.6||(result.jitter??0)>.08);
              result.badQualityAge=poor?(previous?.badQualityAge||0)+elapsed:0;
              result.sourceSilentAge=expectedTx&&typeof result.sourceEnergy==="number"&&typeof previous?.sourceEnergy==="number"&&result.sourceEnergy===previous.sourceEnergy?(previous.sourceSilentAge||0)+elapsed:0;
            }catch{/* Unsupported or interrupted statistics must not be reported as failed RTP. */}
          }
          next.set(p.peer_id,result);
        }));
        if(!active||generation!==generationRef.current||!joinedRef.current)return;
        healthSamplesRef.current=next;healthConnectionsRef.current=nextConnections;
        const issues=classifyAudio({online:navigator.onLine,reconnecting:!!inputs.connectionNotice,speaker:inputs.speakerEnabled,blocked:inputs.playbackBlocked,forced,localMuted:inputs.localMuted,mic:micState,peers:[...next.values()],expectedPeers:others.length,statsAvailable:available>0});
        setAudioIssues(issues);
        const measured=[...next.values()].filter(p=>p.state==="connected");
        const rtts=measured.flatMap(p=>typeof p.rtt==="number"?[p.rtt]:[]);
        const jitters=measured.flatMap(p=>typeof p.jitter==="number"?[p.jitter]:[]);
        const received=measured.reduce((n,p)=>n+(p.received||0),0),lost=measured.reduce((n,p)=>n+Math.max(0,p.lost||0),0);
        const slow = rtts.some(x=>x>.45)||jitters.some(x=>x>.06)||(received+lost>0&&lost/(received+lost)>.05);
        for(const pc of connectionsRef.current.values())for(const sender of pc.getSenders()){
          if(sender.track?.kind!=="video")continue;
          try{const params=sender.getParameters();if(params.encodings?.length){const cap=slow?180000:visualModeRef.current==="screen"?1000000:450000;let changed=false;for(const encoding of params.encodings){if(encoding.maxBitrate!==cap){encoding.maxBitrate=cap;encoding.maxFramerate=slow?8:15;changed=true;}}if(changed)void sender.setParameters(params).catch(()=>{});}}catch{}
        }
        setHealthMetrics({rtt:rtts.length?Math.round(Math.max(...rtts)*1000):null,jitter:jitters.length?Math.round(Math.max(...jitters)*1000):null,loss:received+lost?100*lost/(received+lost):null});
        const fullyConnected=others.length>0&&[...next.values()].every(p=>p.state==="connected"&&typeof p.rx==="number"&&(!p.expectedTx||typeof p.tx==="number"));
        setHealthStatus(others.length===0?"waiting":fullyConnected&&available===others.length?(issues.length?"limited":"healthy"):"checking");
      }finally{busy=false;}
    };
    void sample();const timer=window.setInterval(()=>void sample(),4000);
    return()=>{active=false;window.clearInterval(timer);};
  },[joined]);


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
    peerRecoveryRef.current.delete(remotePeerId);
    peerRetryRef.current.delete(remotePeerId);
    setRemoteVisual(current=>{const next={...current};delete next[remotePeerId];return next;});
    reconnectingRef.current.delete(remotePeerId);
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
      if (!peerIdRef.current || !sessionKeyRef.current || recoveringRef.current) return;
      const generation=generationRef.current;
      try {
        const result=await apiRequest(`/api/live-rooms/${meetingId}/signal`, {
          credentials: inviteCode ? "omit" : "include",
          method: "POST",
          body: JSON.stringify({
            peer_id: peerIdRef.current,
            session_key: sessionKeyRef.current,
            target_id: targetId,
            type,
            payload,
          }),
        });
        // A target can disappear while an offer is in flight. The roster
        // will remove that peer; never evict this healthy participant.
        if(!result.delivered)return;
      } catch (signalError) {
        if(generation===generationRef.current && joinedRef.current){
          if(signalError instanceof ApiError && signalError.status===401){expiredRef.current=true;recoveryNeededRef.current=true;}
          else if(!navigator.onLine){recoveryNeededRef.current=true;setConnectionNotice("offline");}
          // A dropped candidate or individual offer is recovered per peer.
        }
        console.error("Live meeting signaling failed:", signalError);
      }
    },
    [meetingId, inviteCode],
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

      // The deployed TURN transports have passed media tests. Avoid broken
      // direct routes on restrictive NATs; keep STUN fallback if relay is unavailable.
      const relayAvailable=iceServersRef.current.some(server=>[server.urls].flat().some(url=>url.startsWith("turn:")||url.startsWith("turns:")));
      const connection = new RTCPeerConnection({iceServers:iceServersRef.current,iceCandidatePoolSize:0,iceTransportPolicy:relayAvailable?"relay":"all"});
      connectionsRef.current.set(remotePeerId, connection);

      const stream = localStreamRef.current;
      // Always offer a bidirectional audio channel, including listen-only peers.
      // A microphone can be attached later without rejoining or renegotiating.
      if(initiate){const audio=connection.addTransceiver("audio",{direction:"sendrecv"});preferOpus(audio);await audio.sender.replaceTrack(stream?.getAudioTracks().find(t=>t.readyState==="live")||null);}
      // Reserve one visual channel in the initial offer, so camera/screen switches do not renegotiate.
      if(initiate){const t=connection.addTransceiver("video",{direction:"sendrecv"});await t.sender.replaceTrack(visualRef.current?.getVideoTracks()[0]||null);}

      connection.onicecandidate = (event) => {
        if (event.candidate) void postSignal(remotePeerId, "ice", event.candidate.toJSON());
      };

      connection.ontrack = (event) => {
        if(event.track.kind==="video"){
          const videoStream=new MediaStream([event.track]);
          const show=()=>{if(connectionsRef.current.get(remotePeerId)===connection)setRemoteVisual(current=>({...current,[remotePeerId]:videoStream}));};
          const hide=()=>setRemoteVisual(current=>{if(current[remotePeerId]!==videoStream)return current;const next={...current};delete next[remotePeerId];return next;});
          event.track.addEventListener("unmute",show);event.track.addEventListener("mute",hide);event.track.addEventListener("ended",hide);
          if(!event.track.muted)show();return;
        }
        // Never play our local microphone or a stale peer's media.
        if(remotePeerId===peerIdRef.current||connectionsRef.current.get(remotePeerId)!==connection)return;
        if(localStreamRef.current?.getAudioTracks().some(t=>t.id===event.track.id))return;
        const remoteStream = new MediaStream([event.track]);
        setRemoteStreams((current) => ({ ...current, [remotePeerId]: remoteStream }));
        onRemoteStream?.(remotePeerId, remoteStream);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") for(const sender of connection.getSenders())if(sender.track?.kind==="audio")void tuneAudioSender(sender);
        if (connection.connectionState === "closed") closePeer(remotePeerId);
      };

      // The same (larger peer ID) must initiate both the initial offer
      // and recovery offers. Switching initiators produces negotiation glare.
      let restartTimer: number | null = null;
      let connectingTimer: number | null = null;
      const restartIce = () => {
        if (connectionsRef.current.get(remotePeerId)!==connection || recoveringRef.current || !peerIdRef.current || peerIdRef.current < remotePeerId ||
            reconnectingRef.current.has(remotePeerId) ||
            connection.signalingState === "closed") return;
        if (connection.iceConnectionState === "connected" ||
            connection.iceConnectionState === "completed") return;
        if (connection.signalingState !== "stable") return;
        reconnectingRef.current.add(remotePeerId);
        void (async () => {
          try {
            const offer = await connection.createOffer({ iceRestart: true });
            await connection.setLocalDescription(offer);
            await postSignal(remotePeerId, "offer", offer);
          } catch (restartError) {
            console.error("Meeting ICE recovery error:", restartError);
          } finally {
            reconnectingRef.current.delete(remotePeerId);
          }
        })();
      };
      connection.oniceconnectionstatechange = () => {
        if (restartTimer) window.clearTimeout(restartTimer);
        if (connectingTimer) window.clearTimeout(connectingTimer);
        restartTimer = null;
        connectingTimer = null;
        const state = connection.iceConnectionState;
        if (state === "connected" || state === "completed") {
          peerRecoveryRef.current.delete(remotePeerId);
          reconnectingRef.current.delete(remotePeerId);
        } else if (state === "failed" || state === "disconnected") {
          restartTimer = window.setTimeout(restartIce, state === "failed" ? 400 : 2500);
        } else if (state === "checking") {
          connectingTimer = window.setTimeout(restartIce, 12000);
        }
      };
      connection.addEventListener("signalingstatechange", () => {
        if (connection.signalingState !== "closed") return;
        if (restartTimer) window.clearTimeout(restartTimer);
        if (connectingTimer) window.clearTimeout(connectingTimer);
      });

      if (initiate) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await postSignal(remotePeerId, "offer", offer);
      }
      return connection;
    },
    [closePeer, onRemoteStream, postSignal],
  );

  const applyModeratorMute=useCallback((locked:boolean)=>{
    if(locked){
      if(!forcedMuteRef.current){
        wasSpeakingRef.current=!!localStreamRef.current?.getAudioTracks().some(t=>t.readyState==="live"&&t.enabled);
      }
      forcedMuteRef.current=true;
      localStreamRef.current?.getAudioTracks().forEach(t=>{t.enabled=false;});
      setForcedMuted(true);setLocalMuted(true);setResumePrompt(false);
    }else if(forcedMuteRef.current){
      forcedMuteRef.current=false;setForcedMuted(false);
      const live=localStreamRef.current?.getAudioTracks().filter(t=>t.readyState==="live")||[];
      if(consentResumeRef.current&&wasSpeakingRef.current&&live.length){
        live.forEach(t=>{t.enabled=true;});setLocalMuted(false);setResumePrompt(false);
      }else{setResumePrompt(true);}
      wasSpeakingRef.current=false;
    }
  },[]);

  const handleSignal = useCallback(
    async (message: SignalEnvelope) => {
      if (message.type === "peer-left") {
        closePeer(message.from_peer_id);
        return;
      }

      if (message.type === "force-mute") {
        applyModeratorMute(true);return;
      }
      if (message.type === "release-mute") {
        applyModeratorMute(false);return;
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
        const audio=connection.getTransceivers().find(t=>t.receiver.track.kind==="audio");
        if(audio){audio.direction="sendrecv";preferOpus(audio);await audio.sender.replaceTrack(localStreamRef.current?.getAudioTracks().find(t=>t.readyState==="live")||null);}
        const video=connection.getTransceivers().find(t=>t.receiver.track.kind==="video");
        if(video){video.direction="sendrecv";await video.sender.replaceTrack(visualRef.current?.getVideoTracks()[0]||null);}
        await flushPendingIce(message.from_peer_id, connection);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await postSignal(message.from_peer_id, "answer", answer);
        return;
      }

      if (message.type === "answer") {
        const connection = connectionsRef.current.get(message.from_peer_id);
        if (!connection || !message.payload) return;
        if(connection.signalingState!=="have-local-offer")return;
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
    [addPendingIce, applyModeratorMute, closePeer, ensureConnection, flushPendingIce, postSignal],
  );

  const joinRoom = useCallback(async (listenOnly=false) => {
    if (joinedRef.current || joiningRef.current || testingMic) return;

    joiningRef.current = true;
    generationRef.current++;
    setJoining(true);
    setError(null);
    setPlaybackBlocked(false);
    setConnectionNotice(null);recoveryNeededRef.current=false;expiredRef.current=false;failuresRef.current=0;nextRecoveryRef.current=0;

    setMicNotice("");
    let stream: MediaStream | null = listenOnly?null:providedStream;
    let ownsStream = false;

    try {
      if ((!stream||!stream.getAudioTracks().some(t=>t.readyState==="live"))&&!listenOnly) {
        try {stream = await openMicrophone(selectedMic);ownsStream=true;onMicrophoneChange?.(stream);}
        catch(e){setMicNotice(mediaError(e));stream=null;}
      }
      const mic=stream?.getAudioTracks().find(t=>t.readyState==="live");
      const microphoneAvailable=Boolean(mic);

      localStreamRef.current = stream;
      ownsLocalStreamRef.current = ownsStream;
      setCurrentMicrophone(mic?.getSettings().deviceId || "");
      setHasMicrophone(microphoneAvailable);
      void refreshMicrophones();

      const response = (await apiRequest(`/api/live-rooms/${meetingId}/join`, {
        credentials: inviteCode ? "omit" : "include",
        method: "POST",
        body: JSON.stringify({
          invite_code: inviteCode || null,
          full_name: displayName || null,
          microphone_available:microphoneAvailable,
          muted:!microphoneAvailable||!mic?.enabled,
        }),
      })) as JoinResponse;

      iceServersRef.current=response.ice_servers?.length?response.ice_servers:DEFAULT_ICE_SERVERS;
      iceExpiryRef.current=response.ice_expires_at||0;
      iceRefreshRef.current=Date.now();
      peerIdRef.current = response.peer_id;
      sessionKeyRef.current = response.session_key;
      joinedRef.current = true;
      setJoined(true);
      setIsModerator(response.is_moderator);
      setParticipants(response.participants);
      setLocalMuted(!microphoneAvailable||!mic?.enabled);
      forcedMuteRef.current=false;setForcedMuted(false);setRoomLocked(!!response.locked);applyModeratorMute(!!response.forced_muted);

      for (const participant of response.participants) {
        if (!participant.is_self && peerIdRef.current > participant.peer_id) {
          void ensureConnection(participant.peer_id,true).catch(err=>{
            closePeer(participant.peer_id);
            console.error("Initial peer negotiation failed:",err);
          });
        }
      }
    } catch (joinError) {
      if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      ownsLocalStreamRef.current = false;
      setError(mediaError(joinError));
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [closePeer, displayName, ensureConnection, inviteCode, meetingId, providedStream, refreshMicrophones, selectedMic, testingMic,onMicrophoneChange,applyModeratorMute]);

  const clearVisual=useCallback(()=>{visualGeneration.current++;visualRef.current?.getTracks().forEach(t=>t.stop());visualRef.current=null;setVisual(null);setVisualMode(null);setRemoteVisual({});},[]);
  const leaveRoom = useCallback(async () => {
    clearVisual();
    const peerId = peerIdRef.current;
    const sessionKey = sessionKeyRef.current;
    joinedRef.current = false;
    generationRef.current++;recoveryNeededRef.current=false;expiredRef.current=false;setConnectionNotice(null);

    if (peerId && sessionKey) {
      try {
        await apiRequest(`/api/live-rooms/${meetingId}/leave`, {
          credentials: inviteCode ? "omit" : "include",
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
    forcedMuteRef.current=false;setForcedMuted(false);
    setLocalMuted(true);setHasMicrophone(false);setMicNotice("");
    setPlaybackBlocked(false);
  }, [meetingId,clearVisual,inviteCode]);

  const changeMicrophone = useCallback(async (deviceId: string,enable=false,nextProfile=audioProfile()) => {
    const previous = localStreamRef.current;
    if (!joinedRef.current || micBusyRef.current || (enable&&forcedMuteRef.current)) return;
    micBusyRef.current=true;setChangingMicrophone(true);
    setError(null);
    let replacement: MediaStream | null = null;
    try {
      replacement = await openMicrophone(deviceId,nextProfile);
      const newTrack = replacement.getAudioTracks()[0];
      if (!newTrack) throw new Error("The selected microphone supplied no audio track.");
      if(!joinedRef.current){replacement.getTracks().forEach(t=>t.stop());return;}
      newTrack.enabled = (enable||!localMuted) && !forcedMuteRef.current;
      const oldTrack = previous?.getAudioTracks()[0];
      const senders = Array.from(connectionsRef.current.values())
        .flatMap((connection) => connection.getTransceivers().filter(t=>t.receiver.track.kind==="audio").map(t=>t.sender));
      const switched: RTCRtpSender[] = [];
      try {
        for (const sender of senders) {
          await sender.replaceTrack(newTrack);
          switched.push(sender);
          void tuneAudioSender(sender);
        }
        onMicrophoneChange?.(replacement);
      } catch (switchError) {
        await Promise.allSettled(switched.map((sender) => sender.replaceTrack(oldTrack || null)));
        throw switchError;
      }
      const previousOwned = ownsLocalStreamRef.current;
      localStreamRef.current = replacement;
      ownsLocalStreamRef.current = true;
      if (previousOwned || previous !== providedStream) {
        previous?.getTracks().forEach((track) => track.stop());
      }
      setCurrentMicrophone(newTrack.getSettings().deviceId || deviceId);
      setHasMicrophone(true);setLocalMuted(!newTrack.enabled);setMicNotice("");
      replacement = null;
      void refreshMicrophones();
    } catch (deviceError) {
      replacement?.getTracks().forEach((track) => track.stop());
      setMicNotice(mediaError(deviceError));
    } finally {
      micBusyRef.current=false;setChangingMicrophone(false);
    }
  }, [changingMicrophone, forcedMuted, localMuted, onMicrophoneChange, providedStream, refreshMicrophones]);

  // A headset can disconnect, lose OS input access, or be unplugged during
  // a meeting. Automatically acquire the new system-default input.
  useEffect(() => {
    if (!joined) return;
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    const recover = () => {setHasMicrophone(false);setLocalMuted(true);setMicNotice("Microphone disconnected. You can continue listening and connect a microphone when ready.");};
    track.addEventListener("ended", recover);
    return () => track.removeEventListener("ended", recover);
  }, [joined, currentMicrophone, hasMicrophone, changeMicrophone]);

  const toggleVisual=async(mode:"camera"|"screen",surface?:"monitor"|"window"|"browser")=>{
    setShareMenu(false);
    if(visualBusyRef.current||!joinedRef.current)return;
    visualBusyRef.current=true;setVisualBusy(true);setVisualError("");
    const generation=++visualGeneration.current;let candidate:MediaStream|null=null;
    const previous=visualRef.current;
    try{
      const off=visualMode===mode;
      if(!off){
        if(mode==="screen"&&!navigator.mediaDevices?.getDisplayMedia)throw new Error("Screen sharing is not supported on this browser. Use a supported desktop browser.");
        candidate=mode==="camera"?await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:15,max:24}},audio:false}):await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:24},...(surface?{displaySurface:surface}:{})} as MediaTrackConstraints,audio:false});
      }
      if(!joinedRef.current||generation!==visualGeneration.current)return;
      const next=candidate?.getVideoTracks()[0]||null;
      if(next){
        next.contentHint=mode==="screen"?"detail":"motion";
        // Fit the already-negotiated video envelope and keep audio bandwidth free.
        if(mode==="screen")try{await next.applyConstraints({width:{max:1280},height:{max:720},frameRate:{max:15}});}catch{}
      }
      const senders=Array.from(connectionsRef.current.values()).flatMap(c=>c.getTransceivers().filter(t=>t.receiver.track.kind==="video").map(t=>t.sender));
      const switched:RTCRtpSender[]=[];
      try{for(const sender of senders){await sender.replaceTrack(next);switched.push(sender);}}catch(e){await Promise.allSettled(switched.map(s=>s.replaceTrack(previous?.getVideoTracks()[0]||null)));throw e;}
      visualRef.current=candidate;setVisual(candidate);setVisualMode(off?null:mode);candidate=null;
      if(next&&mode==="camera")setShowVideo(true);
      if(next&&mode==="screen"){setPin(peerIdRef.current);setGallery(false);}
      if(!next)setExpanded(null);
      previous?.getTracks().forEach(t=>t.stop());
      if(next)next.addEventListener("ended",()=>{if(visualRef.current?.getVideoTracks()[0]!==next)return;visualRef.current=null;setVisual(null);setVisualMode(null);for(const c of connectionsRef.current.values())for(const t of c.getTransceivers())if(t.receiver.track.kind==="video")void t.sender.replaceTrack(null).catch(()=>{});},{once:true});
    }catch(e){
      const code=e instanceof DOMException?e.name:"";
      setVisualError(code==="NotAllowedError"?(mode==="screen"?"Screen sharing was cancelled or permission was denied. Choose Share again when ready.":"Camera permission was denied. Allow camera access in your browser."):code==="NotFoundError"?"No camera or share source is available.":code==="NotReadableError"?"The browser could not capture the selected source. Check that it is available.":e instanceof Error?e.message:"Could not start video or screen sharing.");
    }finally{candidate?.getTracks().forEach(t=>t.stop());visualBusyRef.current=false;setVisualBusy(false);}
  };

  const toggleMute = useCallback(() => {
    if (forcedMuted||forcedMuteRef.current) return;
    if (!localStreamRef.current?.getAudioTracks().some(t=>t.readyState==="live")) {void changeMicrophone(selectedMic||currentMicrophone,true);return;}
    const nextMuted = !localMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setLocalMuted(nextMuted);if(!nextMuted)setResumePrompt(false);
  }, [forcedMuted, localMuted, changeMicrophone, selectedMic, currentMicrophone]);

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
    // Play directly inside the user's click event. Mobile Safari and Chrome
    // may reject play() when invoked later from a React effect.
    const elements = document.querySelectorAll<HTMLAudioElement>("audio[data-meeting-remote-audio]");
    if (elements.length === 0) {
      setPlaybackBlocked(false);
    }
    elements.forEach((audio) => {
      audio.muted = false;
      audio.volume = 1;
      void audio.play().then(
        () => setPlaybackBlocked(false),
        () => setPlaybackBlocked(true),
      );
    });
    setAudioUnlockToken((token) => token + 1);
  }, []);

  const handlePlaybackBlocked = useCallback(() => {
    setPlaybackBlocked(true);
  }, []);

  const moderate = useCallback(
    async (targetId: string, action: "mute" | "release" | "raise-hand" | "lower-hand" | "lower-all" | "lock" | "unlock") => {
      if (!peerIdRef.current || !sessionKeyRef.current || moderationBusyRef.current) return;
      moderationBusyRef.current=true;setModerationBusy(true);setModerationNotice("");
      try {
        const data = await apiRequest(`/api/live-rooms/${meetingId}/moderate`, {
          credentials: inviteCode ? "omit" : "include",
          method: "POST",
          body: JSON.stringify({
            peer_id: peerIdRef.current,
            session_key: sessionKeyRef.current,
            target_id: targetId,
            action,
          }),
        });
        setParticipants(data.participants || []);
        if(typeof data.locked==="boolean")setRoomLocked(data.locked);
        setModerationNotice(action==="release"?"Microphone permission restored. Participants can now unmute, or resume automatically if they opted in.":action==="mute"?"Microphone muted by organizer.":action==="lock"?"Meeting locked to new participants.":action==="unlock"?"Meeting unlocked.":action==="lower-all"?"All hands lowered.":"");
        setOpenMenu(null);
      } catch (moderationError) {
        setError(
          moderationError instanceof Error
            ? moderationError.message
            : "Could not update participant microphone.",
        );
      } finally {moderationBusyRef.current=false;setModerationBusy(false);}
    },
    [meetingId, inviteCode],
  );

  useEffect(() => {
    if (!autoJoin || !providedStream || autoJoinAttemptedRef.current) return;
    const timer = window.setTimeout(() => {
      if (autoJoinAttemptedRef.current) return;
      autoJoinAttemptedRef.current = true;
      void joinRoom();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoJoin, joinRoom, providedStream]);

  useEffect(() => {
    if (!joined) return;
    let active=true;
    const credentials=inviteCode?"omit":"include";
    const endpoint="/api/live-rooms/"+meetingId;
    const retryAfterFailure=(err:unknown)=>{
      if(!joinedRef.current)return;
      if(err instanceof ApiError && err.status===401){expiredRef.current=true;recoveryNeededRef.current=true;}
      if(!navigator.onLine)recoveryNeededRef.current=true;
      setConnectionNotice(navigator.onLine?"reconnecting":"offline");
    };
    const offline=()=>{
      if(!joinedRef.current||nextRecoveryRef.current===Number.POSITIVE_INFINITY)return;
      recoveryNeededRef.current=true;
      setConnectionNotice("offline");
    };
    const recover=async()=>{
      if(!active||!joinedRef.current||recoveringRef.current||!navigator.onLine||Date.now()<nextRecoveryRef.current)return;
      recoveringRef.current=true;
      setConnectionNotice("reconnecting");
      const generation=++generationRef.current;
      const oldPeer=peerIdRef.current,oldKey=sessionKeyRef.current;
      // Keep local camera, microphone, mute and speaker preferences.
      // First retire the old peer only if its lease is still usable.
      try{
        if(!expiredRef.current && oldPeer && oldKey){
          try{
            await apiRequest(endpoint+"/leave",{credentials,method:"POST",body:JSON.stringify({peer_id:oldPeer,session_key:oldKey})});
          }catch(err){
            if(!(err instanceof ApiError && err.status===401))throw err;
          }
        }
        expiredRef.current=true;
        if(!joinedRef.current||generation!==generationRef.current)return;
        for(const id of [...connectionsRef.current.keys()])closePeer(id);
        pendingIceRef.current.clear();
        const mic=localStreamRef.current?.getAudioTracks().find(t=>t.readyState==="live");
        if(mic&&forcedMuteRef.current)mic.enabled=false;
        const response=await apiRequest(endpoint+"/join",{credentials,method:"POST",body:JSON.stringify({
          invite_code:inviteCode||null,full_name:displayName||null,microphone_available:!!mic,muted:!mic||!mic.enabled
        })}) as JoinResponse;
        if(!joinedRef.current||generation!==generationRef.current){
          // A deliberate leave happened during the join request.
          void apiRequest(endpoint+"/leave",{credentials,method:"POST",body:JSON.stringify({peer_id:response.peer_id,session_key:response.session_key})}).catch(()=>{});
          return;
        }
        peerIdRef.current=response.peer_id;sessionKeyRef.current=response.session_key;
        iceServersRef.current=response.ice_servers?.length?response.ice_servers:DEFAULT_ICE_SERVERS;
        iceExpiryRef.current=response.ice_expires_at||0;iceRefreshRef.current=Date.now();
        setParticipants(response.participants);setIsModerator(response.is_moderator);setRoomLocked(!!response.locked);
        setHasMicrophone(!!mic);setLocalMuted(!mic||!mic.enabled);applyModeratorMute(!!response.forced_muted);
        recoveryNeededRef.current=false;expiredRef.current=false;failuresRef.current=0;nextRecoveryRef.current=0;
        setConnectionNotice(null);setError(null);
      }catch(err){
        if(!joinedRef.current||generation!==generationRef.current)return;
        if(err instanceof ApiError && [404].includes(err.status)){
          recoveryNeededRef.current=false;
          setError("Meeting is no longer live. You can leave this room.");
          setConnectionNotice(null);
          nextRecoveryRef.current=Number.POSITIVE_INFINITY;
          return;
        }
        failuresRef.current++;
        nextRecoveryRef.current=Date.now()+Math.min(15000,1000*2**Math.min(4,failuresRef.current-1));
        retryAfterFailure(err);
      }finally{recoveringRef.current=false;}
    };
    const pollSignals=async()=>{
      if(!active||!joinedRef.current||recoveringRef.current||recoveryNeededRef.current||!navigator.onLine||pollingRef.current||!peerIdRef.current)return;
      pollingRef.current=true;
      const generation=generationRef.current;
      try{
        const query=new URLSearchParams({peer_id:peerIdRef.current,session_key:sessionKeyRef.current});
        const data=await apiRequest(endpoint+"/signals?"+query,{credentials});
        if(!active||generation!==generationRef.current)return;
        for(const message of (data.messages||[]) as SignalEnvelope[]){
          if(!active||recoveringRef.current||generation!==generationRef.current)break;
          try{await handleSignal(message);}catch(err){console.warn("Peer negotiation interrupted",err);}
        }
      }catch(err){
        if(active&&generation===generationRef.current)retryAfterFailure(err);
      }finally{pollingRef.current=false;}
    };
    const heartbeat=async()=>{
      if(!active||!joinedRef.current||heartbeatBusyRef.current||recoveringRef.current||!navigator.onLine||Date.now()<nextRecoveryRef.current)return;
      if(recoveryNeededRef.current){await recover();return;}
      if(!peerIdRef.current||!sessionKeyRef.current)return;
      heartbeatBusyRef.current=true;
      const generation=generationRef.current;
      try{
        const refreshIce=Date.now()-iceRefreshRef.current>60000 && iceExpiryRef.current-Date.now()/1000<3600;
        const data=await apiRequest(endpoint+"/heartbeat",{credentials,method:"POST",body:JSON.stringify({
          peer_id:peerIdRef.current,session_key:sessionKeyRef.current,
          muted:!localStreamRef.current?.getAudioTracks().some(t=>t.readyState==="live"&&t.enabled),
          microphone_available:!!localStreamRef.current?.getAudioTracks().some(t=>t.readyState==="live"),
          visual_mode:visualModeRef.current,refresh_ice:refreshIce
        })});
        if(!active||!joinedRef.current||generation!==generationRef.current||recoveringRef.current)return;
        if(data.ice_servers?.length&&data.ice_expires_at>0){
          iceServersRef.current=data.ice_servers;iceExpiryRef.current=data.ice_expires_at;iceRefreshRef.current=Date.now();
          for(const conn of connectionsRef.current.values())try{conn.setConfiguration({...conn.getConfiguration(),iceServers:iceServersRef.current});}catch{}
        }
        const members=(data.participants||[]) as LiveParticipant[];
        setParticipants(members);if(typeof data.locked==="boolean")setRoomLocked(data.locked);
        const present=new Set(members.map(p=>p.peer_id));
        for(const id of [...connectionsRef.current.keys()])if(!present.has(id))closePeer(id);
        for(const p of members){
          if(p.is_self||!p.peer_id)continue;
          const conn=connectionsRef.current.get(p.peer_id);
          if(!conn&&peerIdRef.current>p.peer_id){
            void ensureConnection(p.peer_id,true).catch(err=>{closePeer(p.peer_id);console.warn("Peer connection failed",err);});
          }
          if(conn){
            const state=conn.iceConnectionState;
            if(state==="connected"||state==="completed"){peerRecoveryRef.current.delete(p.peer_id);continue;}
            const started=peerRecoveryRef.current.get(p.peer_id)||Date.now();
            peerRecoveryRef.current.set(p.peer_id,started);
            // ICE restart alone cannot recover a lost offer/answer. A new
            // room peer ID gives both ends a fresh negotiation.
            const now=Date.now();
            if(peerIdRef.current>p.peer_id && now-started>12000 && now-(peerRetryRef.current.get(p.peer_id)||0)>12000 && !reconnectingRef.current.has(p.peer_id)){
              peerRetryRef.current.set(p.peer_id,now);
              reconnectingRef.current.add(p.peer_id);
              void (async()=>{
                try{
                  if(conn.signalingState==="have-local-offer")await conn.setLocalDescription({type:"rollback"});
                  if(conn.signalingState!=="stable")return;
                  const offer=await conn.createOffer({iceRestart:true});
                  await conn.setLocalDescription(offer);
                  await postSignal(p.peer_id,"offer",offer);
                }catch(e){console.warn("Peer retry failed",e);}
                finally{reconnectingRef.current.delete(p.peer_id);}
              })();
            }
          }
        }
        const connected=[...connectionsRef.current.values()].filter(c=>c.connectionState==="connected").length;
        setMediaConnected(connected);
        setConnectionNotice(null);
        // Do not tear down successful guest connections because one peer is slow.
        applyModeratorMute(!!data.forced_muted);
      }catch(err){
        if(active&&generation===generationRef.current)retryAfterFailure(err);
      }finally{heartbeatBusyRef.current=false;}
    };
    const online=()=>{
      if(!joinedRef.current||nextRecoveryRef.current===Number.POSITIVE_INFINITY)return;
      recoveryNeededRef.current=true;nextRecoveryRef.current=0;
      setConnectionNotice("reconnecting");void heartbeat();
    };
    const visible=()=>{if(document.visibilityState==="visible")void heartbeat();};
    window.addEventListener("offline",offline);window.addEventListener("online",online);
    document.addEventListener("visibilitychange",visible);
    if(!navigator.onLine)offline();
    void pollSignals();void heartbeat();
    const signalTimer=window.setInterval(()=>void pollSignals(),450);
    const heartbeatTimer=window.setInterval(()=>void heartbeat(),1500);
    return()=>{
      active=false;window.clearInterval(signalTimer);window.clearInterval(heartbeatTimer);
      window.removeEventListener("offline",offline);window.removeEventListener("online",online);
      document.removeEventListener("visibilitychange",visible);
    };
  },[applyModeratorMute,closePeer,displayName,ensureConnection,handleSignal,joined,meetingId,inviteCode,postSignal]);

  useEffect(
    () => () => {
      visualGeneration.current++;visualRef.current?.getTracks().forEach(t=>t.stop());visualRef.current=null;
      if (!joinedRef.current) return;

      const peerId = peerIdRef.current;
      const sessionKey = sessionKeyRef.current;
      joinedRef.current = false;
      generationRef.current++;

      if (peerId && sessionKey) {
        void fetch(`/api/live-rooms/${meetingId}/leave`, {
          method: "POST",
          credentials: inviteCode ? "omit" : "include",
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
    [meetingId, inviteCode],
  );

  const inspectAudio=async()=>{
    const mic=localStreamRef.current?.getAudioTracks()[0];
    const rows=["MinuteSeal audio diagnostics", "Room: "+(isModerator?"Organizer":"Participant"),
      "Microphone: "+(mic?mic.readyState+", enabled="+mic.enabled+", muted="+mic.muted:"missing"),
      "Speaker enabled: "+speakerEnabled+", playback blocked: "+playbackBlocked,
      "Organizer mute: "+forcedMuteRef.current,
      "Audio links: "+connectionsRef.current.size+" / "+Math.max(0,participants.length-1)];
    let n=0;
    for(const pc of connectionsRef.current.values()){
      n++;
      try{
        const stats=[...(await pc.getStats()).values()];
        const pair=stats.find(x=>x.type==="candidate-pair"&&x.nominated&&x.state==="succeeded");
        const local=stats.find(x=>x.id===pair?.localCandidateId),remote=stats.find(x=>x.id===pair?.remoteCandidateId);
        const inbound=stats.find(x=>x.type==="inbound-rtp"&&x.kind==="audio");
        const outbound=stats.find(x=>x.type==="outbound-rtp"&&x.kind==="audio");
        rows.push("Peer "+n+": "+pc.connectionState+" / ICE "+pc.iceConnectionState,
          "Path: "+(local?.candidateType||"none")+" → "+(remote?.candidateType||"none")+", relay "+(local?.relayProtocol||"n/a"),
          "Audio RX bytes: "+(inbound?.bytesReceived||0)+", TX bytes: "+(outbound?.bytesSent||0)+", lost packets: "+(inbound?.packetsLost||0),
          "Decoded audio energy: "+(inbound?.totalAudioEnergy||0)+", RTT ms: "+Math.round((pair?.currentRoundTripTime||0)*1000));
      }catch{rows.push("Peer "+n+": statistics unavailable");}
    }
    rows.push("Playback elements: "+Array.from(document.querySelectorAll<HTMLAudioElement>("audio[data-meeting-remote-audio]")).map(e=>e.paused?"paused":e.muted?"muted":"playing").join(", "));
    rows.push("Automatic checks: "+(audioIssues.map(i=>i.title).join("; ")||healthStatus));
    setAudioReport(rows.join("\n"));
  };

  const otherParticipants = participants.filter((participant) => !participant.is_self);
  const streamFor=(p:LiveParticipant)=>p.is_self?visual:remoteVisual[p.peer_id]||null;
  const modeFor=(p:LiveParticipant)=>p.is_self?visualMode:p.visual_mode||null;
  const videoParticipants=participants.filter(p=>!!streamFor(p));
  const focus=gallery?undefined:videoParticipants.find(p=>p.peer_id===pin)||videoParticipants.find(p=>modeFor(p)==="screen")||(focusLayout?videoParticipants[0]:undefined);
  const visibleVideo=showVideo?(focus?[focus,...videoParticipants.filter(p=>p.peer_id!==focus.peer_id)]:videoParticipants):videoParticipants.filter(p=>modeFor(p)==="screen").slice(0,1);
  const expandedPeer=videoParticipants.find(p=>p.peer_id===expanded);

  const tile=(p:LiveParticipant,large=false)=> <MeetingTile large={large} key={p.peer_id} label={p.name+(p.is_self?" (You)":"")} stream={streamFor(p)} screen={modeFor(p)==="screen"} portrait={portrait} muted={p.is_self?localMuted||forcedMuted:p.muted} focus={()=>{setExpanded(p.peer_id);}}/>;


  return (
    <section className={joined?"ms-live-shell":"min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-4"}>
      {!joined ? (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <Headphones size={26} />
          </div>
          <h2 className="mt-3 text-lg font-extrabold text-slate-950">
            {joining ? "Joining meeting..." : error ? "Unable to join meeting" : "Join the meeting"}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Join with your microphone, or listen without one. You cannot speak until your microphone is connected and enabled.
          </p>
          {!providedStream&&!joining&&<MicrophoneSetup value={selectedMic} onChange={setSelectedMic} onTestingChange={setTestingMic}/>}
          {!joining&&<div className="mt-4 flex flex-wrap justify-center gap-3"><button type="button" disabled={testingMic} onClick={()=>void joinRoom()} className="rounded-lg bg-blue-700 px-4 py-2.5 text-white">Join with microphone</button><button type="button" disabled={testingMic} onClick={()=>void joinRoom(true)} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-4 py-2.5 font-semibold text-blue-700"><Headphones size={17}/> Join without microphone</button></div>}
          {onEndMeeting&&<button type="button" onClick={()=>{if(window.confirm("End the meeting and process its minutes?"))onEndMeeting();}} className="mt-3 rounded bg-red-600 px-4 py-2 text-sm text-white">End Meeting &amp; Process Minutes</button>}
          {joining && <div className="mx-auto mt-5 h-8 w-8 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />}
          {error && (
            <>
              <div className="mx-auto mt-4 max-w-xl rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>

            </>
          )}
        </div>
      ) : (
        <div className="ms-room">
          <div className="ms-room-status"><div className="flex items-center gap-2 flex-wrap"><span className="ms-live-pill"><Radio size={13}/> LIVE</span><strong>Live meeting</strong><span className="ms-room-count"><Users size={14}/> {participants.length}</span><span className="text-xs text-slate-500">{mediaConnected}/{Math.max(0,participants.length-1)} audio links</span>{roomLocked&&<span className="text-xs text-slate-600"><Lock size={12} className="inline"/> Locked</span>}</div><button type="button" onClick={()=>{setShowVideo(v=>!v);if(showVideo)setFocusLayout(false);}} className="ms-small-button">{showVideo?<VideoOff size={15}/>:<Video size={15}/>} {showVideo?"Hide cameras":"Show cameras"} ({videoParticipants.length})</button></div>
                    {connectionNotice&&<p role="status" aria-live="polite" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{connectionNotice==="offline"?"Internet connection lost. Stay on this page; you will reconnect automatically.":"Reconnecting to your meeting… Your microphone and speaker settings are retained."}</p>}
          {!hasMicrophone&&<p role="status" className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900"><strong>Listening only.</strong> Connect a microphone to speak. {micNotice}</p>}
          {forcedMuted&&<p role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Your microphone has been muted by the organizer.</p>}
          {resumePrompt&&!forcedMuted&&localMuted&&<div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-900"><span>The organizer has restored your microphone permission.</span><button type="button" onClick={()=>{setResumePrompt(false);toggleMute();}} className="rounded bg-green-700 px-3 py-2 font-semibold text-white">Unmute now</button></div>}
          {hasMicrophone&&micNotice&&<p className="text-xs text-amber-800">{micNotice}</p>}
          {speakerEnabled&&playbackBlocked&&<button type="button" onClick={unlockMeetingAudio} className="rounded border border-slate-200 px-3 py-2 text-xs font-medium text-blue-700">{playbackBlocked?"Tap to enable meeting audio":"Enable / retry audio"}</button>}

          <div className="ms-room-grid">
            <div ref={stageRef} className="ms-room-stage">
              {visibleVideo.length>0?<><div className="ms-video-grid">
                {visibleVideo.map(p=><div key={p.peer_id} className={(modeFor(p)==="screen"||focusLayout&&focus?.peer_id===p.peer_id)?"ms-video-primary":"ms-video-small"}>{tile(p,modeFor(p)==="screen"||focusLayout&&focus?.peer_id===p.peer_id)}</div>)}
              </div></>:<div className="ms-audio-stage"><Headphones size={28}/><strong>Audio-first meeting</strong><span>Cameras are optional. Share your screen when ready.</span><div className="ms-avatar-strip">{participants.slice(0,8).map(p=><span key={p.peer_id} title={p.name} className="ms-avatar">{p.name.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}</span>)}</div></div>}
              {visualError&&<p role="alert" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{visualError}</p>}
                          {expandedPeer&&<div role="dialog" aria-label="Expanded video" className="fixed inset-0 z-[120] flex flex-col bg-slate-950 p-2 text-white">
              <div className="flex items-center justify-between p-2"><span className="font-semibold">{expandedPeer.name} · {modeFor(expandedPeer)==="screen"?"Screen share":"Camera"}</span><button type="button" onClick={()=>setExpanded(null)} className="rounded border border-white/40 px-3 py-2 text-sm">Close expanded video</button></div>
              <div className="min-h-0 flex-1"><ExpandedVideo stream={streamFor(expandedPeer)}/></div>
            </div>}
            {shareMenu&&<div role="dialog" aria-label="Share screen" className="rounded border p-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Share screen</h3><button type="button" onClick={()=>setShareMenu(false)} className="rounded border px-2 py-1 text-xs">Cancel</button></div><p className="my-2 text-xs text-slate-600">Choose a source in your browser’s picker. The browser determines which screen, application window or tab you can share.</p><div className="grid gap-2 sm:grid-cols-3">{([["monitor","Entire screen"],["window","Application window"],["browser","Browser tab"]] as const).map(([surface,label])=><button key={surface} type="button" onClick={()=>void toggleVisual("screen",surface)} className="rounded border p-3 text-sm text-blue-700">{label}</button>)}</div></div>}

            </div>
            <div className="ms-room-toolbar">
              <button type="button" onClick={toggleMute} disabled={forcedMuted||changingMicrophone} className={"ms-room-tool "+(localMuted?"ms-tool-muted":"ms-tool-primary")}>{localMuted?<MicOff size={20}/>:<Mic size={20}/>}<span>{!hasMicrophone?"Connect mic":localMuted?"Unmute":"Mute"}</span></button>
              <button type="button" onClick={toggleSpeaker} className="ms-room-tool">{speakerEnabled?<Volume2 size={20}/>:<VolumeX size={20}/>}<span>Speaker</span></button>
              <button type="button" disabled={visualBusy} onClick={()=>void toggleVisual("camera")} className={"ms-room-tool "+(visualMode==="camera"?"ms-tool-selected":"")}>{visualMode==="camera"?<Video size={20}/>:<VideoOff size={20}/>}<span>Camera</span></button>
              <button type="button" disabled={visualBusy} onClick={()=>visualMode==="screen"?void toggleVisual("screen"):setShareMenu(v=>!v)} className="ms-room-tool ms-tool-selected">{visualMode==="screen"?<MonitorOff size={20}/>:<MonitorUp size={20}/>}<span>{visualMode==="screen"?"Stop share":"Share"}</span></button>
              <div className="ms-layout-tools">
              <button type="button" aria-label="Gallery layout" aria-pressed={gallery} onClick={()=>{setGallery(true);setPin(null);setShowVideo(true);setFocusLayout(false);}} className={"ms-room-tool "+(gallery?"ms-tool-selected":"")}><LayoutGrid size={18}/><span>Gallery layout</span></button>
              <button type="button" aria-label="Focus layout" aria-pressed={!gallery&&focusLayout} onClick={()=>{setGallery(false);setShowVideo(true);setFocusLayout(true);}} className={"ms-room-tool "+(focusLayout?"ms-tool-selected":"")}><PanelRight size={18}/><span>Focus layout</span></button>
              <button type="button" onClick={()=>setPortrait(v=>!v)} className="ms-room-tool"><span>{portrait?"9:16":"16:9"}</span></button>
              <button type="button" aria-label="Fullscreen" disabled={!visibleVideo.length} onClick={()=>setExpanded((focus||visibleVideo[0]).peer_id)} className="ms-room-tool"><Maximize size={18}/><span>Fullscreen</span></button></div>
              <button type="button" onClick={()=>{recoveryNeededRef.current=true;nextRecoveryRef.current=0;setConnectionNotice(navigator.onLine?"reconnecting":"offline");unlockMeetingAudio();}} className="ms-room-tool"><RefreshCw size={20}/><span>Reconnect my audio</span></button>
              {onEndMeeting?<button type="button" onClick={()=>{if(window.confirm("End the meeting and process its minutes?"))onEndMeeting();}} className="ms-end-button"><Square size={15} fill="currentColor"/> End Meeting &amp; Process Minutes</button>:<button type="button" onClick={()=>void leaveRoom()} className="ms-end-button"><PhoneOff size={17}/> Leave</button>}
            </div>
            <aside className="ms-room-side">
              <div className="ms-sheet-handle"/>
              <div className="ms-sheet-tabs"><button type="button" aria-pressed={panelTab==="participants"} onClick={()=>setPanelTab("participants")}><Users size={18}/> Participants ({participants.length})</button><button type="button" aria-pressed={panelTab==="health"} onClick={()=>setPanelTab("health")}><Activity size={18}/> Audio health</button></div>
              <div className={"ms-side-health "+(panelTab==="health"?"ms-tab-active":"")}>          <div aria-label="Live audio health" className="ms-room-health">
            <div className="flex items-center justify-between gap-2"><span className="ms-room-panel-title"><Activity size={19}/> Audio health</span><span className={"text-xs font-medium "+(audioIssues.some(i=>i.severity==="error")?"text-red-700":audioIssues.length?"text-amber-800":healthStatus==="healthy"?"text-green-700":"text-slate-500")}>{audioIssues.some(i=>i.severity==="error")?"Audio problem detected":audioIssues.length?"Attention needed":healthStatus==="healthy"?"Media links active":healthStatus==="waiting"?"Waiting for participants":"Checking connections…"}</span></div>
            <div className="ms-health-metrics"><span><Headphones size={15}/> Media links</span><b>{mediaConnected}/{otherParticipants.length}</b><span><Signal size={15}/> Audio quality</span><b>{healthStatus==="healthy"?"Active":healthStatus==="waiting"?"Waiting":"Checking"}</b><span><Clock size={15}/> Latency</span><b>{healthMetrics.rtt===null?"—":healthMetrics.rtt+" ms"}</b><span><Activity size={15}/> Packet loss</span><b>{healthMetrics.loss===null?"—":healthMetrics.loss.toFixed(1)+"%"}</b></div>
            {audioIssues.length>0&&<div role="status" aria-live="polite" className="mt-2 space-y-2">{audioIssues.map(issue=><div key={issue.code} className={"rounded border p-2 text-xs "+(issue.severity==="error"?"border-red-200 bg-red-50 text-red-900":issue.severity==="warning"?"border-amber-200 bg-amber-50 text-amber-900":"border-slate-200 bg-slate-50 text-slate-700")}><strong>{issue.title}</strong><p className="mt-1">{issue.detail}</p>{issue.action!=="none"&&<button type="button" disabled={issue.action==="mic"&&(forcedMuted||changingMicrophone)} onClick={()=>{if(issue.action==="speaker")unlockMeetingAudio();else if(issue.action==="mic"){if(localMuted&&hasMicrophone&&!localStreamRef.current?.getAudioTracks().some(t=>t.muted))toggleMute();else void changeMicrophone(currentMicrophone,true);}else{recoveryNeededRef.current=true;nextRecoveryRef.current=0;setConnectionNotice(navigator.onLine?"reconnecting":"offline");}}} className="mt-1.5 rounded border border-current px-2 py-1 font-semibold">{issue.action==="speaker"?"Enable audio":issue.action==="mic"?"Fix microphone":"Reconnect my audio"}</button>}</div>)}</div>}
          </div>
</div>
              <section className={"ms-room-people "+(panelTab==="participants"?"ms-tab-active":"")}>
                <div className="ms-panel-head"><h3 className="ms-room-panel-title"><Users size={18}/> Participants ({participants.length})</h3><div className="flex items-center gap-1">{onInvite&&<button type="button" onClick={onInvite} className="ms-small-button"><UserPlus size={15}/> Invite</button>}<button type="button" aria-label="Meeting options" onClick={()=>setOpenMenu(v=>v==="room"?null:"room")} className="ms-icon-button"><MoreVertical size={19}/></button></div></div>
                {openMenu==="room"&&<div className="ms-inline-menu"><button onClick={()=>{setShowSettings(true);setOpenMenu(null);setPanelTab("health");}}><Settings size={15}/> Audio settings</button><button onClick={()=>void moderate(peerIdRef.current,participants.find(p=>p.is_self)?.hand_raised?"lower-hand":"raise-hand")}><Hand size={15}/> {participants.find(p=>p.is_self)?.hand_raised?"Lower my hand":"Raise hand"}</button></div>}
                <div className="ms-people-list">{participants.map((p,i)=><div key={p.peer_id} className="ms-person"><span className={"ms-avatar ms-avatar-"+(i%3)}>{p.name.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}</span><div className="ms-person-main"><div className="flex items-center gap-1 flex-wrap"><b>{p.name}{p.is_self?" (You)":""}</b>{p.is_moderator&&<span className="ms-moderator"><Shield size={11}/> Moderator</span>}{p.hand_raised&&<Hand size={15} className="text-amber-600"/>}</div><div className="text-xs text-slate-500">{p.forced_muted?"Muted by organizer":p.muted?"Muted":p.microphone_available===false?"Listening only":p.is_moderator?"Meeting organizer":"Microphone on"}</div><AudioLevelMeter stream={p.is_self?localStreamRef.current:remoteStreams[p.peer_id]||null} muted={p.is_self?localMuted||forcedMuted:p.muted} label={p.is_self?"Your microphone input":p.name+" received audio"}/></div>
                {p.muted?<MicOff size={17} className="text-red-600 shrink-0"/>:<Mic size={17} className="text-green-700 shrink-0"/>}
                {isModerator&&!p.is_self&&p.forced_muted&&<button type="button" disabled={moderationBusy} onClick={()=>void moderate(p.peer_id,"release")} className="ms-small-button">Allow mic</button>}
                <button type="button" aria-label={"Options for "+p.name} className="ms-icon-button" onClick={()=>setOpenMenu(v=>v===p.peer_id?null:p.peer_id)}><MoreVertical size={18}/></button>
                {openMenu===p.peer_id&&<div className="ms-inline-menu ms-person-menu">{isModerator&&!p.is_self&&<button disabled={moderationBusy} onClick={()=>void moderate(p.peer_id,p.forced_muted?"release":"mute")}>{p.forced_muted?<Mic size={15}/>:<MicOff size={15}/>} {p.forced_muted?"Allow microphone":"Mute microphone"}</button>}{isModerator&&p.hand_raised&&<button onClick={()=>void moderate(p.peer_id,"lower-hand")}><Hand size={15}/> Lower hand</button>}{streamFor(p)&&<button onClick={()=>{setExpanded(p.peer_id);setOpenMenu(null);}}><Maximize size={15}/> Expand video</button>}{p.is_self&&<button onClick={()=>void moderate(p.peer_id,p.hand_raised?"lower-hand":"raise-hand")}><Hand size={15}/> {p.hand_raised?"Lower my hand":"Raise hand"}</button>}<button onClick={()=>setOpenMenu(null)}>Close</button></div>}</div>)}</div>
                {isModerator&&<div className="ms-moderation"><div className="ms-room-panel-title"><Shield size={16}/> Moderator controls</div><div className="ms-moderation-grid"><button disabled={moderationBusy||!otherParticipants.length} onClick={()=>void moderate("*","mute")}><MicOff size={19}/><span>Mute all others</span></button><button disabled={moderationBusy||!otherParticipants.some(p=>p.forced_muted)} onClick={()=>void moderate("*","release")}><Mic size={19}/><span>Allow all microphones</span></button><button disabled={moderationBusy||!participants.some(p=>p.hand_raised)} onClick={()=>void moderate("*","lower-all")}><Hand size={19}/><span>Lower all hands</span></button><button disabled={moderationBusy} onClick={()=>{if(roomLocked||window.confirm("Lock admission to new participants? Existing audio remains connected; participants who lose their connection may need you to unlock the room."))void moderate("*",roomLocked?"unlock":"lock");}}>{roomLocked?<Unlock size={19}/>:<Lock size={19}/>}<span>{roomLocked?"Unlock meeting":"Lock meeting"}</span></button><button onClick={()=>{setPanelTab("participants");setOpenMenu(openMenu==="permissions"?null:"permissions");}}><Users size={19}/><span>Manage permissions</span></button><button onClick={()=>{setShowSettings(true);setPanelTab("health");}}><Settings size={19}/><span>More</span></button></div>{openMenu==="permissions"&&<p className="text-xs text-slate-600 mt-2">Use the menu beside each participant to mute or restore microphone permission. Participants control their own microphone consent.</p>}{moderationNotice&&<p role="status" className="text-xs text-slate-600 mt-2">{moderationNotice}</p>}</div>}
                {!isModerator&&<button type="button" className="ms-small-button m-3" onClick={()=>void moderate(peerIdRef.current,participants.find(p=>p.is_self)?.hand_raised?"lower-hand":"raise-hand")}><Hand size={16}/> {participants.find(p=>p.is_self)?.hand_raised?"Lower my hand":"Raise hand"}</button>}
              </section>
              <div className="ms-room-settings-wrap">          <details open={showSettings||undefined} onToggle={e=>setShowSettings(e.currentTarget.open)} className="ms-room-settings"><summary className="cursor-pointer text-xs font-semibold">Audio settings</summary>
          <button type="button" onClick={()=>{if(!joinedRef.current)return;recoveryNeededRef.current=true;nextRecoveryRef.current=0;setConnectionNotice(navigator.onLine?"reconnecting":"offline");unlockMeetingAudio();}} className="mt-2 rounded border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700">Reconnect my audio</button>
          <p className="mt-1 text-xs text-slate-500">Reconnects only your audio session without ending the meeting or stopping its recording.</p>
          <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={resumeAfterModeration} onChange={e=>{setResumeAfterModeration(e.target.checked);consentResumeRef.current=e.target.checked;}}/> Automatically resume my microphone when the organizer lifts a mute, only if I was speaking before.</label>
          <button type="button" onClick={()=>void inspectAudio()} className="mt-2 rounded border px-3 py-2 text-xs font-semibold">Check audio connection</button>
          {audioReport&&<div className="mt-2"><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{audioReport}</pre><button type="button" onClick={()=>void navigator.clipboard.writeText(audioReport).catch(()=>{})} className="mt-1 rounded border px-2 py-1 text-xs">Copy audio report</button></div>}
          <label className="mt-2 block text-xs font-medium">Sound profile<select aria-label="Sound profile" value={profile} disabled={changingMicrophone} onChange={e=>{const next=e.target.value as AudioProfile;setProfile(next);try{localStorage.setItem("minuteseal-audio-profile",next);}catch{}if(hasMicrophone)void changeMicrophone(currentMicrophone,false,next);}} className="mt-1 w-full rounded border bg-white p-2 text-sm"><option value="voice">Clear voice (noise reduction)</option><option value="natural">Natural sound (less processing)</option></select></label>
          <p className="mt-1 text-xs text-slate-500">Natural sound keeps background sounds. Echo cancellation stays on in both modes. Headphones are recommended.</p><select aria-label="Meeting microphone" value={currentMicrophone} disabled={changingMicrophone} onChange={e=>void changeMicrophone(e.target.value)} className="mt-2 w-full rounded border bg-white p-2 text-sm"><option value="">System default</option>{microphones.map((m,i)=><option key={m.deviceId} value={m.deviceId}>{m.label||"Microphone "+(i+1)}</option>)}</select></details>
</div>
            </aside>
          </div>
          {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
                    <div
            className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
            aria-hidden="true"
          >
            {Object.entries(remoteStreams).filter(([id,stream])=>id!==peerIdRef.current&&!stream.getAudioTracks().some(t=>localStreamRef.current?.getAudioTracks().some(l=>l.id===t.id))).map(([remotePeerId, stream]) => (
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
    audio.volume = 1;

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

  return <audio ref={audioRef} data-meeting-remote-audio autoPlay playsInline preload="auto" />;
}


/** Analyses microphone/received audio locally; no audio is recorded or sent by this meter. */
function AudioLevelMeter({ stream, muted, label }: { stream: MediaStream | null; muted: boolean; label: string }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || muted || !stream.getAudioTracks().some((track) => track.readyState === "live" && track.enabled)) {
      return;
    }
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const amplitude = (sample - 128) / 128;
        sum += amplitude * amplitude;
      }
      const rms = Math.sqrt(sum / samples.length);
      setLevel(rms < 0.012 ? 0 : Math.min(1, rms * 7));
    }, 85);
    return () => {
      window.clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      void context.close();
    };
  }, [stream, muted]);

  const active = !muted && level > 0.08;
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={muted ? 0 : Math.round(level * 100)} className="flex items-center gap-2">
      <div className="flex h-5 items-center gap-[3px]" aria-hidden="true">
        {[0.65, 0.9, 1.1, 0.75, 1.2, 0.85, 0.6].map((factor, index) => (
          <span
            key={index}
            className={`w-[3px] rounded-full transition-[height,background-color] duration-75 ${active ? "bg-green-500" : "bg-slate-300"}`}
            style={{ height: `${Math.max(2, Math.round((muted ? 0 : level) * 19 * factor))}px` }}
          />
        ))}
      </div>
      <span className="text-[10px] text-slate-600">{muted ? "Muted" : active ? "Audio detected" : "Silent"}</span>
    </div>
  );
}

function MeetingTile({stream,label,screen,portrait,muted,focus,large=false}:{stream:MediaStream|null;label:string;screen:boolean;portrait:boolean;muted:boolean;focus:()=>void;large?:boolean}){const ref=useRef<HTMLVideoElement>(null);useEffect(()=>{const el=ref.current;if(!el)return;el.srcObject=stream;if(stream)void el.play().catch(()=>{});return()=>{el.srcObject=null;};},[stream]);return <div className={"relative min-w-0 overflow-hidden rounded-lg bg-slate-950 "+(large?"max-h-[55dvh] ":screen?"max-h-[180px] ":"max-h-[256px] ")+(screen||!portrait?"aspect-video":"aspect-[9/16]")}>{stream?<video ref={ref} autoPlay playsInline muted className={"absolute inset-0 h-full w-full "+(screen?"object-contain":"object-cover")}/>:<div className="absolute inset-0 flex items-center justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-xl font-semibold text-white">{label.slice(0,2).toUpperCase()}</span></div>}<button type="button" aria-label={"Expand "+label} onClick={focus} className="absolute right-2 top-2 rounded bg-black/60 p-2 text-white"><Maximize size={16}/></button>{screen&&<span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">Sharing screen</span>}<span className="absolute bottom-2 left-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs text-white">{muted?<MicOff size={14}/>:<Mic size={14}/>} {label}</span></div>;}


function ExpandedVideo({stream}:{stream:MediaStream|null}){
 const ref=useRef<HTMLVideoElement>(null);
 useEffect(()=>{const el=ref.current;if(!el)return;el.srcObject=stream;if(stream)void el.play().catch(()=>{});return()=>{el.srcObject=null;};},[stream]);
 return <video ref={ref} autoPlay playsInline muted className="h-full w-full object-contain"/>;
}
