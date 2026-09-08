"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createAudioAnalyser,
  type LocalAudioTrack,
  type LocalParticipant,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { Avatar } from "@/components/ui/Avatar";
import {
  playMuteSound,
  playUnmuteSound,
  playCameraOffSound,
  playCameraOnSound,
  playUserJoinedSound,
  playUserLeftSound,
  unlockAudio,
  playSoundboardClip,
  playStreamStartedSound,
  playStreamStoppedSound,
  playStreamWatcherJoinedSound,
  playStreamWatcherLeftSound,
  SOUNDBOARD_CLIPS,
  SOUNDBOARD_COOLDOWN_MS,
} from "@/lib/call-sounds";
import {
  getCachedDevices,
  refreshMediaDevices,
  warmDeviceCache,
  ensureMicAccess,
} from "@/lib/media-devices";
import {
  getNoiseSuppression,
  setNoiseSuppression,
  getStickyDevice,
  setStickyDevice,
  pickStickyDevice,
  micCaptureOpts,
  getPushToTalk,
  setPushToTalk,
  getPeerVolumes,
  setPeerVolume,
} from "@/lib/voice-prefs";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

export type VoiceControls = {
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  deafened: boolean;
  connected: boolean;
  toggleMic: () => void;
  toggleDeafen: () => void;
  toggleScreen: () => void;
  toggleCam: () => void;
};

type CallOverlayProps = {
  channelId: string;
  channelName: string;
  displayName: string;
  /** Local user's profile image */
  avatarUrl?: string | null;
  /** userId → avatar_url from server members / presence */
  avatarByUserId?: Record<string, string | null>;
  onLeave: () => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  /** Remote peers in this LiveKit room — used for Lounge sidebar when presence lags */
  onRemoteRoster?: (
    peers: {
      user_id: string;
      display_name: string;
      micOn: boolean;
      camOn: boolean;
      screenOn: boolean;
    }[],
  ) => void;
  /** Identities currently speaking (for member list rings) */
  onSpeakingChange?: (ids: string[]) => void;
  /** Expose mute/deafen/screen for Discord-style UserBar / connected strip */
  onVoiceControls?: (controls: VoiceControls | null) => void;
  /** Discord-style mini window while browsing text channels */
  variant?: "full" | "pip";
  /** Link back to the voice channel (PiP header) */
  returnHref?: string;
};

type PeerSnapshot = {
  identity: string;
  name: string;
  avatarUrl: string | null;
  isLocal: boolean;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
};

const CAM_OPTS = {
  resolution: VideoPresets.h360.resolution,
} as const;

/** Try LiveKit mic with constraints, then bare enable (friends hit NotFound on strict opts). */
async function enableMicrophone(room: Room, deviceId?: string) {
  const preferred =
    deviceId ||
    getStickyDevice("audioinput") ||
    room.getActiveDevice("audioinput") ||
    undefined;
  // Fast path first: sticky device / bare enable usually works; heavy opts as fallback.
  const attempts: (MediaTrackConstraints | undefined)[] = [
    preferred ? { deviceId: preferred } : undefined,
    {},
    micCaptureOpts(preferred || undefined),
    preferred ? micCaptureOpts() : undefined,
  ];
  let lastErr: unknown;
  for (const opts of attempts) {
    if (opts === undefined && preferred) continue;
    try {
      if (opts === undefined) {
        await room.localParticipant.setMicrophoneEnabled(true);
      } else {
        await room.localParticipant.setMicrophoneEnabled(true, opts);
      }
      const active = room.getActiveDevice("audioinput");
      if (active) setStickyDevice("audioinput", active);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function enableMicrophoneWithRetry(
  room: Room,
  deviceId?: string,
  tries = 2,
) {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    if (room.state !== ConnectionState.Connected) {
      throw lastErr ?? new Error("Room not connected");
    }
    try {
      await enableMicrophone(room, deviceId);
      return;
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) {
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

const CONNECTING_HINT = "Still connecting — try again in a moment.";

function parseAvatarMeta(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const data = JSON.parse(metadata) as { avatar_url?: string | null };
    return data.avatar_url || null;
  } catch {
    return null;
  }
}

function localPlaceholder(
  displayName: string,
  avatarUrl: string | null = null,
): PeerSnapshot {
  return {
    identity: "__local__",
    name: displayName,
    avatarUrl,
    isLocal: true,
    micOn: false,
    camOn: false,
    screenOn: false,
  };
}

function snapshotPeers(
  room: Room,
  avatarByUserId?: Record<string, string | null>,
  localAvatarUrl?: string | null,
): PeerSnapshot[] {
  const all: Participant[] = [
    room.localParticipant,
    ...Array.from(room.remoteParticipants.values()),
  ];
  return all.map((p) => {
    const fromMeta = parseAvatarMeta(p.metadata);
    const fromMap = avatarByUserId?.[p.identity] ?? null;
    const avatarUrl =
      fromMeta || fromMap || (p.isLocal ? localAvatarUrl || null : null);
    return {
      identity: p.identity,
      name: p.name || p.identity.slice(0, 8),
      avatarUrl,
      isLocal: p.isLocal,
      micOn: p.isMicrophoneEnabled,
      camOn: p.isCameraEnabled,
      screenOn: p.isScreenShareEnabled,
    };
  });
}

function peersEqual(a: PeerSnapshot[], b: PeerSnapshot[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.identity !== y.identity ||
      x.name !== y.name ||
      x.avatarUrl !== y.avatarUrl ||
      x.micOn !== y.micOn ||
      x.camOn !== y.camOn ||
      x.screenOn !== y.screenOn
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Lean voice UI. Updates React state rarely; audio attach is DOM-only.
 */
export function CallOverlay({
  channelId,
  channelName,
  displayName,
  avatarUrl = null,
  avatarByUserId,
  onLeave,
  onConnected,
  onDisconnected,
  onRemoteRoster,
  onSpeakingChange,
  onVoiceControls,
  variant = "full",
  returnHref,
}: CallOverlayProps) {
  const [status, setStatus] = useState<
    "connecting" | "live" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerSnapshot[]>(() => [
    localPlaceholder(displayName, avatarUrl),
  ]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [pttMode, setPttMode] = useState(() => getPushToTalk());
  const [pttHeld, setPttHeld] = useState(false);
  const [connLabel, setConnLabel] = useState("Connecting…");
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>(
    () => getPeerVolumes(),
  );
  const [mediaBusy, setMediaBusy] = useState(false);
  const [deviceHint, setDeviceHint] = useState<string | null>(null);
  const [micHelpSteps, setMicHelpSteps] = useState<string[]>([]);
  const [needsMicAllow, setNeedsMicAllow] = useState(false);
  const [micAllowBusy, setMicAllowBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardReady, setBoardReady] = useState(true);
  const [noiseSuppression, setNoiseSuppressionState] = useState(false);
  const [focusedIdentity, setFocusedIdentity] = useState<string | null>(null);
  const [stageFullscreen, setStageFullscreen] = useState(false);
  const [streamViewers, setStreamViewers] = useState<
    { id: string; name: string }[]
  >([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const prevScreenIds = useRef<Set<string>>(new Set());
  const screenAnnounceReady = useRef(false);
  const prevRemoteScreen = useRef<Map<string, boolean>>(new Map());
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const wasReconnecting = useRef(false);
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const avatarUrlRef = useRef(avatarUrl);
  avatarUrlRef.current = avatarUrl;
  const avatarByUserIdRef = useRef(avatarByUserId);
  avatarByUserIdRef.current = avatarByUserId;

  useEffect(() => {
    setNoiseSuppressionState(getNoiseSuppression());
  }, []);

  const roomRef = useRef<Room | null>(null);
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const deafenedRef = useRef(false);
  const peerVolumesRef = useRef<Record<string, number>>(getPeerVolumes());
  const mediaBusyRef = useRef(false);
  const intentionalLeave = useRef(false);
  const intentionalScreenStop = useRef(false);
  const reconnectAttempts = useRef(0);
  const micBeforeDeafen = useRef(true);
  const pttModeRef = useRef(false);
  const knownRemotes = useRef<Set<string> | null>(null);
  const peerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onLeaveRef = useRef(onLeave);
  const onRemoteRosterRef = useRef(onRemoteRoster);
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onLeaveRef.current = onLeave;
  onRemoteRosterRef.current = onRemoteRoster;
  onSpeakingChangeRef.current = onSpeakingChange;

  const schedulePeers = useCallback(() => {
    if (peerTimer.current != null) return;
    peerTimer.current = setTimeout(() => {
      peerTimer.current = null;
      const room = roomRef.current;
      if (!room) return;
      const next = snapshotPeers(
        room,
        avatarByUserIdRef.current,
        avatarUrlRef.current,
      );
      setPeers((prev) => (peersEqual(prev, next) ? prev : next));
      const mic = room.localParticipant.isMicrophoneEnabled;
      const cam = room.localParticipant.isCameraEnabled;
      const screen = room.localParticipant.isScreenShareEnabled;
      setMicOn((prev) => (prev === mic ? prev : mic));
      setCamOn((prev) => (prev === cam ? prev : cam));
      setScreenOn((prev) => (prev === screen ? prev : screen));
      onRemoteRosterRef.current?.(
        next
          .filter((p) => !p.isLocal)
          .map((p) => ({
            user_id: p.identity,
            display_name: p.name,
            micOn: p.micOn,
            camOn: p.camOn,
            screenOn: p.screenOn,
          })),
      );
    }, 80);
  }, []);

  // Refresh tiles when member avatars load after join
  useEffect(() => {
    schedulePeers();
  }, [avatarByUserId, avatarUrl, schedulePeers]);

  useEffect(() => {
    let cancelled = false;
    intentionalLeave.current = false;
    knownRemotes.current = null;

    const room = new Room({
      // Keep the call alive across SPA channel switches (Discord-style).
      // LiveKit's default pageleave/freeze handlers were dropping people when
      // browsing text channels or sharing screen.
      disconnectOnPageLeave: false,
      adaptiveStream: false,
      dynacast: false,
      stopLocalTrackOnUnpublish: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: getNoiseSuppression(),
        autoGainControl: true,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });
    roomRef.current = room;
    setRoom(room);

    // Still hang up on a real tab close / refresh
    function onBrowserUnload() {
      intentionalLeave.current = true;
      void room.disconnect();
    }
    window.addEventListener("beforeunload", onBrowserUnload);

    // display:none can mute HTMLAudioElement in Chrome — keep off-screen instead
    const audioHost = document.createElement("div");
    audioHost.setAttribute("data-hango-audio", "true");
    audioHost.style.cssText =
      "position:fixed;width:1px;height:1px;left:-9999px;top:0;overflow:hidden;opacity:0;pointer-events:none";
    document.body.appendChild(audioHost);
    audioHostRef.current = audioHost;

    const attachedAudio = new Set<string>();
    /** Remotes only — local speaking uses mic VAD (SFU active-speaker lags for self). */
    const remoteSpeakingIds: string[] = [];
    let localSpeaking = false;
    let localSpeakOffTimer: ReturnType<typeof setTimeout> | null = null;
    let vadCleanup: (() => void) | null = null;
    let vadTimer: ReturnType<typeof setInterval> | null = null;
    let isSoftReconnecting = false;

    function stripFreezeDisconnect(r: Room) {
      // livekit-client always binds window "freeze" → disconnect, which can fire
      // during heavy screen-share + SPA navigation. Remove it; we unload ourselves.
      const handler = (
        r as unknown as { onPageLeave?: EventListener }
      ).onPageLeave;
      if (!handler) return;
      window.removeEventListener("freeze", handler);
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    }

    function emitSpeaking() {
      const localId = room.localParticipant.identity;
      const remotes = remoteSpeakingIds.filter((id) => id !== localId);
      const ids =
        localSpeaking && localId ? [localId, ...remotes] : remotes;
      setSpeakingIds((prev) => {
        if (
          prev.length === ids.length &&
          prev.every((id, i) => id === ids[i])
        ) {
          return prev;
        }
        return ids;
      });
      onSpeakingChangeRef.current?.(ids);
    }

    function stopLocalVad() {
      if (vadTimer != null) {
        clearInterval(vadTimer);
        vadTimer = null;
      }
      if (localSpeakOffTimer != null) {
        clearTimeout(localSpeakOffTimer);
        localSpeakOffTimer = null;
      }
      try {
        vadCleanup?.();
      } catch {
        /* ignore */
      }
      vadCleanup = null;
      if (localSpeaking) {
        localSpeaking = false;
        emitSpeaking();
      }
    }

    function startLocalVad(track: LocalAudioTrack) {
      stopLocalVad();
      try {
        const { calculateVolume, cleanup } = createAudioAnalyser(track, {
          // Snappy Discord-like local ring (server active-speaker is too slow for self)
          fftSize: 256,
          smoothingTimeConstant: 0.15,
          minDecibels: -90,
          maxDecibels: -25,
        });
        vadCleanup = cleanup;
        const SPEAK_ON = 0.045;
        const SPEAK_OFF = 0.028;
        vadTimer = setInterval(() => {
          if (
            !room.localParticipant.isMicrophoneEnabled ||
            track.isMuted
          ) {
            if (localSpeakOffTimer != null) {
              clearTimeout(localSpeakOffTimer);
              localSpeakOffTimer = null;
            }
            if (localSpeaking) {
              localSpeaking = false;
              emitSpeaking();
            }
            return;
          }
          let vol = 0;
          try {
            vol = calculateVolume();
          } catch {
            return;
          }
          if (vol >= SPEAK_ON) {
            if (localSpeakOffTimer != null) {
              clearTimeout(localSpeakOffTimer);
              localSpeakOffTimer = null;
            }
            if (!localSpeaking) {
              localSpeaking = true;
              emitSpeaking();
            }
          } else if (vol < SPEAK_OFF && localSpeaking) {
            if (localSpeakOffTimer == null) {
              localSpeakOffTimer = setTimeout(() => {
                localSpeakOffTimer = null;
                localSpeaking = false;
                emitSpeaking();
              }, 180);
            }
          }
        }, 32);
      } catch {
        /* analyser unsupported — fall back to SFU speakers only */
      }
    }

    function attachRemoteAudio(track: RemoteTrack, participantId: string) {
      if (track.kind !== Track.Kind.Audio) return;
      const key = `${participantId}:${track.sid}`;
      if (attachedAudio.has(key)) return;
      attachedAudio.add(key);
      const el = track.attach() as HTMLMediaElement;
      el.dataset.hangoTrack = key;
      el.dataset.hangoPeer = participantId;
      el.autoplay = true;
      el.muted = deafenedRef.current;
      const vol = peerVolumesRef.current[participantId] ?? 1;
      el.volume = Math.min(1, Math.max(0, vol));
      audioHost.appendChild(el);
      void el.play().catch(() => {
        setAudioBlocked(true);
      });
    }

    function attachExistingRemoteAudio() {
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.track && pub.kind === Track.Kind.Audio) {
            attachRemoteAudio(pub.track as RemoteTrack, p.identity);
          }
        });
      });
    }

    function detachTrack(track: RemoteTrack, participantId?: string) {
      const sid = track.sid;
      if (participantId) attachedAudio.delete(`${participantId}:${sid}`);
      else {
        for (const k of [...attachedAudio]) {
          if (k.endsWith(`:${sid}`)) attachedAudio.delete(k);
        }
      }
      track.detach().forEach((el) => el.remove());
    }

    room
      .on(RoomEvent.ParticipantConnected, (p) => {
        schedulePeers();
        if (knownRemotes.current) {
          if (!knownRemotes.current.has(p.identity)) {
            knownRemotes.current.add(p.identity);
            playUserJoinedSound();
            toastRef.current(`${p.name || "Someone"} joined`);
          }
        }
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        schedulePeers();
        if (knownRemotes.current?.has(p.identity)) {
          knownRemotes.current.delete(p.identity);
          playUserLeftSound();
          toastRef.current(`${p.name || "Someone"} left`);
        }
        setStreamViewers((prev) => {
          if (!prev.some((v) => v.id === p.identity)) return prev;
          return prev.filter((v) => v.id !== p.identity);
        });
      })
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        schedulePeers();
        if (pub.track?.kind === Track.Kind.Audio) {
          startLocalVad(pub.track as LocalAudioTrack);
        }
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        schedulePeers();
        if (
          pub.track?.kind === Track.Kind.Audio ||
          pub.source === Track.Source.Microphone
        ) {
          stopLocalVad();
        }
        if (pub.source === Track.Source.ScreenShare) {
          setScreenOn(false);
          setStreamViewers([]);
          if (!intentionalScreenStop.current) {
            playStreamStoppedSound();
            toastRef.current("Screen share stopped — you’re still in voice");
          }
          intentionalScreenStop.current = false;
        }
      })
      // Throttled mute sync so remote "muted" badges stay accurate (Discord-like)
      .on(RoomEvent.TrackMuted, () => schedulePeers())
      .on(RoomEvent.TrackUnmuted, () => schedulePeers())
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (!participant.isLocal && track.kind === Track.Kind.Audio) {
          attachRemoteAudio(track as RemoteTrack, participant.identity);
        }
        if (track.kind === Track.Kind.Video) schedulePeers();
        // Tell the sharer we're watching (Discord stream watcher ping)
        if (
          !participant.isLocal &&
          pub.source === Track.Source.ScreenShare &&
          track.kind === Track.Kind.Video
        ) {
          void (async () => {
            try {
              const data = new TextEncoder().encode(
                JSON.stringify({ t: "sw", on: 1, at: Date.now() }),
              );
              await room.localParticipant.publishData(data, { reliable: true });
            } catch {
              /* ignore */
            }
          })();
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        detachTrack(track as RemoteTrack, participant.identity);
        if (track.kind === Track.Kind.Video) schedulePeers();
        if (
          !participant.isLocal &&
          pub.source === Track.Source.ScreenShare &&
          track.kind === Track.Kind.Video
        ) {
          void (async () => {
            try {
              const data = new TextEncoder().encode(
                JSON.stringify({ t: "sw", on: 0, at: Date.now() }),
              );
              await room.localParticipant.publishData(data, { reliable: true });
            } catch {
              /* ignore */
            }
          })();
        }
      })
      .on(RoomEvent.MediaDevicesError, (err) => {
        setDeviceHint(friendlyDeviceError(err, "device"));
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const localId = room.localParticipant.identity;
        remoteSpeakingIds.length = 0;
        for (const s of speakers) {
          if (s.identity !== localId) remoteSpeakingIds.push(s.identity);
        }
        emitSpeaking();
      })
      .on(RoomEvent.DataReceived, (payload, participant) => {
        if (participant?.isLocal) return;
        try {
          const text = new TextDecoder().decode(payload);
          const msg = JSON.parse(text) as {
            t?: string;
            id?: string;
            on?: number;
          };
          if (msg.t === "sb" && typeof msg.id === "string") {
            // Sender already rate-limited; force play so we stay in sync
            playSoundboardClip(msg.id, { force: true });
            return;
          }
          if (msg.t === "sw" && participant) {
            // Only the active sharer cares about watchers
            if (!room.localParticipant.isScreenShareEnabled) return;
            const id = participant.identity;
            const name = participant.name || id.slice(0, 8);
            const watching = msg.on === 1;
            setStreamViewers((prev) => {
              const has = prev.some((v) => v.id === id);
              if (watching) {
                if (has) return prev;
                queueMicrotask(() => {
                  playStreamWatcherJoinedSound();
                  toastRef.current(`${name} is watching your stream`);
                });
                return [...prev, { id, name }];
              }
              if (!has) return prev;
              queueMicrotask(() => {
                playStreamWatcherLeftSound();
                toastRef.current(`${name} left your stream`);
              });
              return prev.filter((v) => v.id !== id);
            });
          }
        } catch {
          /* ignore */
        }
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) {
          stripFreezeDisconnect(room);
          setStatus("live");
          setConnLabel("Voice Connected");
          setDeviceHint((prev) => (prev === CONNECTING_HINT ? null : prev));
          if (wasReconnecting.current) {
            wasReconnecting.current = false;
            toast("Voice reconnected", "success");
          }
          onConnectedRef.current?.();
          schedulePeers();
          knownRemotes.current = new Set(room.remoteParticipants.keys());
          // Mic may already be published — attach local VAD
          const micPub = room.localParticipant.getTrackPublication(
            Track.Source.Microphone,
          );
          if (micPub?.track?.kind === Track.Kind.Audio) {
            startLocalVad(micPub.track as LocalAudioTrack);
          }
        } else if (state === ConnectionState.Connecting) {
          setConnLabel("Connecting…");
        } else if (state === ConnectionState.Reconnecting) {
          setConnLabel("Reconnecting…");
          wasReconnecting.current = true;
          toast("Reconnecting to voice…");
        } else if (
          state === ConnectionState.Disconnected &&
          !intentionalLeave.current &&
          !cancelled &&
          !isSoftReconnecting
        ) {
          // Discord-style: never dump you out of the VC on a blip — soft reconnect
          void softReconnect();
        }
      });

    async function softReconnect() {
      if (intentionalLeave.current || cancelled || isSoftReconnecting) return;
      if (reconnectAttempts.current >= 4) {
        setStatus("error");
        setConnLabel("Disconnected");
        setError("Disconnected from the call.");
        toast("Disconnected from voice", "danger");
        onDisconnectedRef.current?.();
        return;
      }
      isSoftReconnecting = true;
      reconnectAttempts.current += 1;
      setStatus("connecting");
      setConnLabel("Reconnecting…");
      setError(null);
      toast(
        reconnectAttempts.current === 1
          ? "Reconnecting to voice…"
          : `Still reconnecting (${reconnectAttempts.current})…`,
      );
      try {
        if (room.state !== ConnectionState.Disconnected) {
          await room.disconnect(false);
        }
        await new Promise((r) => setTimeout(r, 250 * reconnectAttempts.current));
        if (cancelled || intentionalLeave.current) return;

        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId,
            displayName: displayNameRef.current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to reconnect");

        await room.connect(data.url, data.token, { autoSubscribe: true });
        stripFreezeDisconnect(room);
        attachExistingRemoteAudio();
        await room.startAudio().catch(() => setAudioBlocked(true));

        try {
          const stickyMic = getStickyDevice("audioinput") || undefined;
          await enableMicrophoneWithRetry(room, stickyMic);
          setMicOn(true);
          const micPub = room.localParticipant.getTrackPublication(
            Track.Source.Microphone,
          );
          if (micPub?.track?.kind === Track.Kind.Audio) {
            startLocalVad(micPub.track as LocalAudioTrack);
          }
        } catch {
          setMicOn(false);
          setNeedsMicAllow(true);
        }

        reconnectAttempts.current = 0;
        setStatus("live");
        setConnLabel("Voice Connected");
        setScreenOn(room.localParticipant.isScreenShareEnabled);
        onConnectedRef.current?.();
        schedulePeers();
        toast("Voice reconnected", "success");
      } catch {
        if (!cancelled && !intentionalLeave.current) {
          window.setTimeout(() => void softReconnect(), 800);
        }
      } finally {
        isSoftReconnecting = false;
      }
    }

    async function start() {
      setStatus("connecting");
      setError(null);
      void warmDeviceCache();
      void refreshMediaDevices("audioinput");
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId,
            displayName: displayNameRef.current,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to join call");
        if (cancelled) return;

        await room.connect(data.url, data.token, {
          autoSubscribe: true,
        });
        if (cancelled) return;
        stripFreezeDisconnect(room);
        reconnectAttempts.current = 0;

        attachExistingRemoteAudio();

        const audioReady = room.startAudio().then(
          () => setAudioBlocked(!room.canPlaybackAudio),
          () => setAudioBlocked(true),
        );

        // One paint frame before getUserMedia (avoids Chrome "Page Unresponsive")
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (cancelled) return;

        try {
          const stickyMic = getStickyDevice("audioinput") || undefined;
          await enableMicrophoneWithRetry(room, stickyMic);
          setMicOn(true);
          setNeedsMicAllow(false);
          setDeviceHint(null);
          setMicHelpSteps([]);
          const micPub = room.localParticipant.getTrackPublication(
            Track.Source.Microphone,
          );
          if (micPub?.track?.kind === Track.Kind.Audio) {
            startLocalVad(micPub.track as LocalAudioTrack);
          }
        } catch (micErr) {
          try {
            await new Promise((r) => setTimeout(r, 120));
            if (cancelled) return;
            await enableMicrophoneWithRetry(room, undefined, 2);
            setMicOn(true);
            setNeedsMicAllow(false);
            setDeviceHint(null);
            setMicHelpSteps([]);
            const micPub = room.localParticipant.getTrackPublication(
              Track.Source.Microphone,
            );
            if (micPub?.track?.kind === Track.Kind.Audio) {
              startLocalVad(micPub.track as LocalAudioTrack);
            }
          } catch {
            setDeviceHint(friendlyDeviceError(micErr, "microphone"));
            setMicOn(false);
            setNeedsMicAllow(true);
            setMicHelpSteps([
              "Click Allow microphone below (or in the mic menu)",
              "If a popup appears, choose Allow",
              "If it says blocked: address bar lock → Microphone → Allow, then reload",
              "Windows: Settings → Privacy → Microphone must be on for your browser",
            ]);
          }
        }
        await audioReady;
        schedulePeers();
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to join call");
        onDisconnectedRef.current?.();
      }
    }

    void start();

    return () => {
      cancelled = true;
      intentionalLeave.current = true;
      window.removeEventListener("beforeunload", onBrowserUnload);
      stopLocalVad();
      if (peerTimer.current) {
        clearTimeout(peerTimer.current);
        peerTimer.current = null;
      }
      try {
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub: RemoteTrackPublication) => {
            if (pub.track) detachTrack(pub.track, p.identity);
          });
        });
      } catch {
        /* ignore */
      }
      // Defer disconnect so Leave → servers home can paint first
      const closing = room;
      const host = audioHost;
      roomRef.current = null;
      setRoom(null);
      audioHostRef.current = null;
      window.setTimeout(() => {
        void closing.disconnect();
        closing.removeAllListeners();
        host.remove();
      }, 0);
    };
  }, [channelId, schedulePeers]);

  function applyDeafenedToAudio(muted: boolean) {
    const host = audioHostRef.current;
    if (!host) return;
    host.querySelectorAll("audio, video").forEach((node) => {
      const el = node as HTMLMediaElement;
      el.muted = muted;
    });
  }

  function applyPeerVolume(peerId: string, volume: number) {
    const host = audioHostRef.current;
    if (!host) return;
    host.querySelectorAll(`[data-hango-peer="${peerId}"]`).forEach((node) => {
      const el = node as HTMLMediaElement;
      el.volume = Math.min(1, Math.max(0, volume));
    });
  }

  async function toggleDeafen() {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    applyDeafenedToAudio(next);
    playMuteSound();
    const r = roomRef.current;
    if (!r) return;
    if (next) {
      micBeforeDeafen.current = r.localParticipant.isMicrophoneEnabled;
      if (micBeforeDeafen.current) {
        try {
          await r.localParticipant.setMicrophoneEnabled(false);
          setMicOn(false);
        } catch {
          /* ignore */
        }
      }
    } else if (micBeforeDeafen.current && !pttModeRef.current) {
      try {
        await enableMicrophone(r, r.getActiveDevice("audioinput") || undefined);
        setMicOn(true);
        playUnmuteSound();
      } catch {
        /* ignore */
      }
    }
  }

  async function toggleNoiseSuppression() {
    const next = !noiseSuppression;
    setNoiseSuppression(next);
    setNoiseSuppressionState(next);
    const r = roomRef.current;
    if (r?.localParticipant.isMicrophoneEnabled) {
      try {
        await enableMicrophoneWithRetry(
          r,
          r.getActiveDevice("audioinput") || undefined,
        );
        toast(next ? "Noise suppression on" : "Noise suppression off");
      } catch {
        toast("Couldn’t apply noise suppression", "danger");
      }
    } else {
      toast(next ? "Noise suppression on" : "Noise suppression off");
    }
  }

  async function withMediaLock(fn: () => Promise<void>) {
    if (mediaBusyRef.current) return;
    const r = roomRef.current;
    if (!r || r.state !== ConnectionState.Connected) {
      setDeviceHint(CONNECTING_HINT);
      window.setTimeout(() => {
        setDeviceHint((prev) => (prev === CONNECTING_HINT ? null : prev));
      }, 2200);
      return;
    }
    mediaBusyRef.current = true;
    setMediaBusy(true);
    try {
      await fn();
    } finally {
      mediaBusyRef.current = false;
      setMediaBusy(false);
      schedulePeers();
    }
  }

  async function toggleMic() {
    await withMediaLock(async () => {
      const r = roomRef.current!;
      const next = !r.localParticipant.isMicrophoneEnabled;
      setDeviceHint(null);
      setMicOn(next);
      try {
        if (next) {
          const preferred = r.getActiveDevice("audioinput") || undefined;
          await enableMicrophoneWithRetry(r, preferred);
          setNeedsMicAllow(false);
          playUnmuteSound();
          void warmDeviceCache();
        } else {
          await r.localParticipant.setMicrophoneEnabled(false);
          playMuteSound();
        }
      } catch (err) {
        setMicOn(false);
        setNeedsMicAllow(true);
        setDeviceHint(friendlyDeviceError(err, "microphone"));
      }
    });
  }

  async function allowMicrophone() {
    setMicAllowBusy(true);
    setDeviceHint(null);
    setMicHelpSteps([]);
    try {
      const access = await ensureMicAccess();
      if (!access.ok) {
        setNeedsMicAllow(true);
        setDeviceHint(access.message);
        setMicHelpSteps(access.steps);
        return;
      }
      // Wait briefly if the room is still connecting (common right after join)
      let r = roomRef.current;
      const deadline = Date.now() + 6000;
      while (
        (!r || r.state !== ConnectionState.Connected) &&
        Date.now() < deadline
      ) {
        await new Promise((res) => setTimeout(res, 100));
        r = roomRef.current;
      }
      if (r && r.state === ConnectionState.Connected) {
        const preferred =
          access.deviceId || access.devices[0]?.deviceId || undefined;
        await enableMicrophoneWithRetry(r, preferred);
        setMicOn(true);
        setNeedsMicAllow(false);
        setMicHelpSteps([]);
        setDeviceHint(null);
        playUnmuteSound();
        schedulePeers();
      } else {
        setNeedsMicAllow(true);
        setDeviceHint(CONNECTING_HINT);
      }
    } catch (err) {
      setNeedsMicAllow(true);
      setDeviceHint(friendlyDeviceError(err, "microphone"));
      setMicHelpSteps([
        "Click the lock icon in the address bar → Microphone → Allow",
        "Windows: Settings → Privacy → Microphone → enable for your browser",
        "Close other apps using the mic, then click Allow microphone again",
      ]);
    } finally {
      setMicAllowBusy(false);
    }
  }

  async function toggleCam() {
    await withMediaLock(async () => {
      const r = roomRef.current!;
      const next = !r.localParticipant.isCameraEnabled;
      setDeviceHint(null);
      setCamOn(next);
      try {
        const deviceId = r.getActiveDevice("videoinput");
        await r.localParticipant.setCameraEnabled(next, {
          ...CAM_OPTS,
          ...(deviceId ? { deviceId } : {}),
        });
        if (next) playCameraOnSound();
        else playCameraOffSound();
      } catch (err) {
        try {
          await r.localParticipant.setCameraEnabled(next, CAM_OPTS);
          if (next) playCameraOnSound();
          else playCameraOffSound();
        } catch (err2) {
          setCamOn(!next);
          setDeviceHint(friendlyDeviceError(err2, "camera"));
        }
      }
    });
  }

  async function toggleScreen() {
    await withMediaLock(async () => {
      const r = roomRef.current!;
      const next = !r.localParticipant.isScreenShareEnabled;
      setDeviceHint(null);
      try {
        if (!next) intentionalScreenStop.current = true;
        await r.localParticipant.setScreenShareEnabled(
          next,
          next
            ? {
                audio: true,
                // Don't capture this Hango tab — navigating text channels would
                // end the share (and feel like you left the call).
                selfBrowserSurface: "exclude",
                surfaceSwitching: "include",
                systemAudio: "include",
              }
            : undefined,
        );
        setScreenOn(next);
        if (next) {
          playStreamStartedSound();
          toast("You're sharing your screen");
        } else {
          playStreamStoppedSound();
          setStreamViewers([]);
          toast("Screen share stopped");
        }
      } catch (err) {
        intentionalScreenStop.current = false;
        setScreenOn(false);
        setStreamViewers([]);
        setDeviceHint(
          err instanceof Error
            ? err.message
            : "Screen share failed — check browser permission",
        );
      }
    });
  }

  // Discord-like: announce when someone else starts/stops a stream
  useEffect(() => {
    if (status !== "live") {
      screenAnnounceReady.current = false;
      prevRemoteScreen.current = new Map();
      return;
    }
    const nextMap = new Map<string, boolean>();
    for (const p of peers) {
      if (p.isLocal) continue;
      nextMap.set(p.identity, p.screenOn);
    }
    if (!screenAnnounceReady.current) {
      prevRemoteScreen.current = nextMap;
      screenAnnounceReady.current = true;
      return;
    }
    const prev = prevRemoteScreen.current;
    for (const [id, on] of nextMap) {
      const was = prev.get(id) ?? false;
      if (on && !was) {
        const name = peers.find((p) => p.identity === id)?.name || "Someone";
        playStreamStartedSound();
        toast(`${name} started a stream`);
      } else if (!on && was) {
        const name = peers.find((p) => p.identity === id)?.name || "Someone";
        playStreamStoppedSound();
        toast(`${name} stopped streaming`);
      }
    }
    for (const [id, was] of prev) {
      if (was && !nextMap.has(id)) {
        const name = peers.find((p) => p.identity === id)?.name || "Someone";
        playStreamStoppedSound();
        toast(`${name} stopped streaming`);
      }
    }
    prevRemoteScreen.current = nextMap;
  }, [peers, status, toast]);

  // Push-to-talk: hold Space while PTT mode is on
  useEffect(() => {
    pttModeRef.current = pttMode;
  }, [pttMode]);

  // Global voice keybinds: Ctrl+Shift+M mute, Ctrl+Shift+D deafen
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "KeyM") {
        e.preventDefault();
        void toggleMic();
      }
      if (e.code === "KeyD") {
        e.preventDefault();
        void toggleDeafen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!pttMode || status !== "live") return;

    async function setTalking(on: boolean) {
      const r = roomRef.current;
      if (!r || deafenedRef.current) return;
      setPttHeld(on);
      try {
        if (on) {
          await enableMicrophone(r, r.getActiveDevice("audioinput") || undefined);
          setMicOn(true);
        } else {
          await r.localParticipant.setMicrophoneEnabled(false);
          setMicOn(false);
        }
      } catch {
        /* ignore */
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      void setTalking(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      e.preventDefault();
      void setTalking(false);
    }

    // Start muted in PTT mode
    void setTalking(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pttMode, status]);

  function handlePeerVolume(peerId: string, volume: number) {
    setPeerVolumes((prev) => {
      const next = { ...prev, [peerId]: volume };
      peerVolumesRef.current = next;
      return next;
    });
    setPeerVolume(peerId, volume);
    applyPeerVolume(peerId, volume);
  }

  function handleLeave() {
    intentionalLeave.current = true;
    const r = roomRef.current;
    window.setTimeout(() => {
      void r?.disconnect();
      onLeaveRef.current();
    }, 80);
  }

  async function enableCallAudio() {
    unlockAudio();
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.startAudio();
      setAudioBlocked(!r.canPlaybackAudio);
    } catch {
      setAudioBlocked(true);
    }
  }

  async function fireSoundboard(id: string) {
    unlockAudio();
    // Gate locally first — only broadcast what we actually play
    if (!playSoundboardClip(id)) return;
    setBoardReady(false);
    window.setTimeout(() => setBoardReady(true), SOUNDBOARD_COOLDOWN_MS);
    const r = roomRef.current;
    if (!r || r.state !== ConnectionState.Connected) return;
    try {
      const data = new TextEncoder().encode(
        JSON.stringify({ t: "sb", id, at: Date.now() }),
      );
      await r.localParticipant.publishData(data, { reliable: true });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const screenIds = new Set(
      peers.filter((p) => p.screenOn).map((p) => p.identity),
    );
    const prev = prevScreenIds.current;
    for (const id of screenIds) {
      if (!prev.has(id)) setFocusedIdentity(id);
    }
    if (focusedIdentity && !peers.some((p) => p.identity === focusedIdentity)) {
      setFocusedIdentity(
        peers.find((p) => p.screenOn)?.identity ?? peers[0]?.identity ?? null,
      );
    }
    if (screenIds.size === 0 && focusedIdentity) {
      setFocusedIdentity(null);
    }
    prevScreenIds.current = screenIds;
  }, [peers, focusedIdentity]);

  useEffect(() => {
    function onFsChange() {
      const el = stageRef.current;
      setStageFullscreen(Boolean(el && document.fullscreenElement === el));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleStageFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* browser blocked */
    }
  }

  // Discord chrome: UserBar / VoiceConnectedBar need these outside the overlay
  useEffect(() => {
    if (!onVoiceControls) return;
    onVoiceControls({
      micOn,
      camOn,
      screenOn,
      deafened,
      connected: status === "live",
      toggleMic: () => {
        void toggleMic();
      },
      toggleDeafen: () => {
        void toggleDeafen();
      },
      toggleScreen: () => {
        void toggleScreen();
      },
      toggleCam: () => {
        void toggleCam();
      },
    });
    return () => onVoiceControls(null);
    // Intentionally omit toggle fns — they close over latest room via refs/state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micOn, camOn, screenOn, deafened, status, onVoiceControls]);

  const live = status === "live";
  const focusedPeer =
    focusedIdentity != null
      ? peers.find((p) => p.identity === focusedIdentity) ?? null
      : peers.find((p) => p.screenOn) ?? null;
  const stageMode = Boolean(focusedPeer?.screenOn);
  const stripPeers = stageMode
    ? peers.filter((p) => p.identity !== focusedPeer!.identity)
    : peers;
  const n = Math.max(peers.length, 1);
  const gridClass =
    n === 1
      ? "grid-cols-1 max-w-3xl mx-auto"
      : n === 2
        ? "grid-cols-1 sm:grid-cols-2 max-w-5xl mx-auto"
        : n <= 4
          ? "grid-cols-2 max-w-5xl mx-auto"
          : "grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto";

  if (status === "error") {
    if (variant === "pip") {
      return (
        <DraggablePip>
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#111] p-3 text-center">
            <p className="text-xs text-red-300">{error || "Call failed"}</p>
            <button
              type="button"
              onClick={handleLeave}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white"
            >
              Dismiss
            </button>
          </div>
        </DraggablePip>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#050505] px-6 text-center">
        <p className="text-sm text-danger">{error || "Call failed"}</p>
        <button
          type="button"
          onClick={handleLeave}
          className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-secondary hover:text-text"
        >
          Back
        </button>
      </div>
    );
  }

  if (variant === "pip") {
    const focus =
      peers.find((p) => p.screenOn) ||
      peers.find((p) => !p.isLocal && p.camOn) ||
      peers.find((p) => p.isLocal) ||
      peers[0];

    return (
      <DraggablePip>
        <div className="flex h-full flex-col overflow-hidden rounded-xl bg-[#0c0c0c] shadow-2xl ring-1 ring-white/15">
          <div
            data-pip-drag
            className="flex cursor-grab items-center gap-2 border-b border-white/10 bg-[#151515] px-2.5 py-1.5 active:cursor-grabbing"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                live ? "bg-emerald-400" : "animate-pulse bg-amber-400",
              )}
            />
            {returnHref ? (
              <Link
                href={returnHref}
                className="min-w-0 flex-1 truncate text-xs font-medium text-white hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {channelName}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
                {channelName}
              </span>
            )}
            <span className="text-[10px] text-white/40">{peers.length}</span>
            <button
              type="button"
              title="Leave call"
              onClick={handleLeave}
              className="rounded p-1 text-red-300 hover:bg-red-500/20"
            >
              <IconLeave />
            </button>
          </div>

          <div className="relative min-h-0 flex-1 bg-[#080808]">
            {focus ? (
              <PeerTile
                peer={focus}
                room={room}
                compact
                speaking={speakingIds.includes(focus.identity)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/40">
                {live ? "In call" : "Connecting…"}
              </div>
            )}
            {peers.length > 1 && (
              <div className="absolute bottom-2 right-2 flex -space-x-2">
                {peers.slice(0, 4).map((p) => (
                  <div
                    key={p.identity}
                    className="rounded-full ring-2 ring-black"
                    title={p.name}
                  >
                    <Avatar
                      name={p.name}
                      src={p.avatarUrl}
                      size="sm"
                      className="!h-6 !w-6 !text-[9px]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-1 border-t border-white/10 bg-[#111] px-2 py-1.5">
            <button
              type="button"
              title={micOn ? "Mute" : "Unmute"}
              disabled={!room || mediaBusy}
              onClick={() => void toggleMic()}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                micOn ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-black",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
                {micOn ? <IconMic /> : <IconMicOff />}
              </span>
            </button>
            <button
              type="button"
              title={camOn ? "Camera off" : "Camera on"}
              disabled={!room || mediaBusy}
              onClick={() => void toggleCam()}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                camOn ? "bg-white/10 text-white hover:bg-white/15" : "bg-white/10 text-white/70",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
                {camOn ? <IconCamera /> : <IconCameraOff />}
              </span>
            </button>
            <button
              type="button"
              title={deafened ? "Undeafen" : "Deafen"}
              disabled={!room || mediaBusy}
              onClick={() => void toggleDeafen()}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                deafened
                  ? "bg-white text-black"
                  : "bg-white/10 text-white hover:bg-white/15",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
                {deafened ? <IconDeafened /> : <IconHeadphones />}
              </span>
            </button>
            <button
              type="button"
              title={screenOn ? "Stop sharing" : "Share screen"}
              disabled={!room || mediaBusy}
              onClick={() => void toggleScreen()}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                screenOn
                  ? "bg-emerald-500 text-black"
                  : "bg-white/10 text-white hover:bg-white/15",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
                <IconScreen />
              </span>
            </button>
            {returnHref && (
              <Link
                href={returnHref}
                className="ml-1 rounded-full bg-emerald-500/90 px-2.5 py-1.5 text-[10px] font-medium text-black hover:bg-emerald-400"
              >
                Open
              </Link>
            )}
          </div>

          {audioBlocked && (
            <button
              type="button"
              className="bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-100 hover:bg-emerald-500/30"
              onClick={() => void enableCallAudio()}
            >
              Click to enable sound
            </button>
          )}
        </div>
      </DraggablePip>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#050505]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(16,185,129,0.08), transparent 60%), radial-gradient(ellipse 50% 50% at 80% 100%, rgba(255,255,255,0.03), transparent)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                live
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-amber-400",
              )}
            />
            <h1 className="text-sm font-semibold tracking-tight text-text">
              {channelName}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {live ? `${peers.length} · ${connLabel}` : connLabel}
            {deafened ? " · Deafened" : ""}
            {pttMode ? (pttHeld ? " · PTT live" : " · PTT (hold Space)") : ""}
            {screenOn
              ? streamViewers.length > 0
                ? ` · ${streamViewers.length} watching your stream`
                : " · Sharing your screen"
              : peers.some((p) => p.screenOn)
                ? ` · Watching ${peers.find((p) => p.screenOn && !p.isLocal)?.name || "screen"}`
                : ""}
          </p>
        </div>
        {screenOn && streamViewers.length > 0 && (
          <div className="flex max-w-[min(420px,55vw)] flex-wrap items-center justify-end gap-1.5">
            {streamViewers.slice(0, 5).map((v) => (
              <span
                key={v.id}
                className="truncate rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200 ring-1 ring-emerald-500/30"
                title={`${v.name} is watching`}
              >
                {v.name}
              </span>
            ))}
            {streamViewers.length > 5 && (
              <span className="text-[10px] text-text-muted">
                +{streamViewers.length - 5}
              </span>
            )}
          </div>
        )}
      </header>

      {audioBlocked && (
        <div className="relative z-10 mx-5 mb-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50">
          <p>Browser blocked call audio. Click to hear others.</p>
          <button
            type="button"
            className="shrink-0 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400"
            onClick={() => void enableCallAudio()}
          >
            Enable sound
          </button>
        </div>
      )}

      {(needsMicAllow || (deviceHint && deviceHint !== CONNECTING_HINT)) && (
        <div className="relative z-10 mx-5 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium text-amber-100">
                {deviceHint ||
                  "Your mic isn’t on yet. Click Allow microphone — a browser popup should ask for access."}
              </p>
              {micHelpSteps.length > 0 && (
                <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-amber-100/80">
                  {micHelpSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {needsMicAllow && (
                <button
                  type="button"
                  disabled={micAllowBusy}
                  className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
                  onClick={() => void allowMicrophone()}
                >
                  {micAllowBusy ? "Requesting…" : "Allow microphone"}
                </button>
              )}
              {deviceHint && (
                <button
                  type="button"
                  className="text-amber-200/80 hover:text-white"
                  onClick={() => {
                    setDeviceHint(null);
                    setMicHelpSteps([]);
                  }}
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        ref={stageRef}
        className={cn(
          "relative z-10 flex min-h-0 flex-1 overflow-hidden p-4 pb-32",
          stageFullscreen && "bg-black",
        )}
      >
        {stageMode && focusedPeer ? (
          <div className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:flex-row">
            <div className="relative min-h-[40vh] min-w-0 flex-1 lg:min-h-0">
              <PeerTile
                peer={focusedPeer}
                room={room}
                expanded
                speaking={speakingIds.includes(focusedPeer.identity)}
                volume={peerVolumes[focusedPeer.identity] ?? 1}
                onVolumeChange={
                  focusedPeer.isLocal
                    ? undefined
                    : (v) => handlePeerVolume(focusedPeer.identity, v)
                }
                onFocusToggle={() => setFocusedIdentity(null)}
                onFullscreen={() => void toggleStageFullscreen()}
                isFocused
                isFullscreen={stageFullscreen}
              />
            </div>
            {stripPeers.length > 0 && (
              <div className="flex shrink-0 gap-2 overflow-x-auto lg:w-44 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
                {stripPeers.map((p) => (
                  <div
                    key={p.identity}
                    role={p.screenOn ? "button" : undefined}
                    tabIndex={p.screenOn ? 0 : undefined}
                    className={cn(
                      "relative h-24 w-36 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 lg:h-28 lg:w-full",
                      p.screenOn && "cursor-pointer",
                    )}
                    onClick={() => {
                      if (p.screenOn) setFocusedIdentity(p.identity);
                    }}
                    onKeyDown={(e) => {
                      if (p.screenOn && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setFocusedIdentity(p.identity);
                      }
                    }}
                    title={
                      p.screenOn ? `Focus ${p.name}'s screen` : p.name
                    }
                  >
                    <PeerTile
                      peer={p}
                      room={room}
                      compact
                      speaking={speakingIds.includes(p.identity)}
                      volume={peerVolumes[p.identity] ?? 1}
                      onVolumeChange={
                        p.isLocal
                          ? undefined
                          : (v) => handlePeerVolume(p.identity, v)
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "m-auto grid w-full gap-3 self-center",
              gridClass,
            )}
          >
            {[...peers]
              .sort((a, b) => Number(b.screenOn) - Number(a.screenOn))
              .map((p) => (
                <PeerTile
                  key={p.identity}
                  peer={p}
                  room={room}
                  speaking={speakingIds.includes(p.identity)}
                  volume={peerVolumes[p.identity] ?? 1}
                  onVolumeChange={
                    p.isLocal
                      ? undefined
                      : (v) => handlePeerVolume(p.identity, v)
                  }
                  onFocusToggle={
                    p.screenOn
                      ? () => setFocusedIdentity(p.identity)
                      : undefined
                  }
                  onFullscreen={
                    p.screenOn
                      ? () => {
                          setFocusedIdentity(p.identity);
                          void toggleStageFullscreen();
                        }
                      : undefined
                  }
                />
              ))}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-6">
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/75 px-2 py-2 shadow-2xl backdrop-blur-xl",
            (!live || mediaBusy) && "opacity-80",
          )}
        >
          <DeviceControl
            room={room}
            kind="audioinput"
            label="Microphone"
            enabled={micOn && !deafened}
            disabled={!room || mediaBusy || deafened || pttMode}
            dangerWhenOff
            onToggle={toggleMic}
            onDeviceError={setDeviceHint}
            onMicRecovered={() => {
              setMicOn(true);
              setNeedsMicAllow(false);
              setDeviceHint(null);
              schedulePeers();
            }}
            iconOn={<IconMic />}
            iconOff={<IconMicOff />}
          />
          <button
            type="button"
            title={
              noiseSuppression
                ? "Noise suppression on"
                : "Noise suppression off"
            }
            disabled={!room || mediaBusy}
            onClick={() => void toggleNoiseSuppression()}
            className={cn(
              "flex h-12 w-11 items-center justify-center rounded-full text-[10px] font-bold transition-colors disabled:opacity-50",
              noiseSuppression
                ? "bg-emerald-500/25 text-emerald-300"
                : "bg-white/10 text-white/70 hover:bg-white/15",
            )}
          >
            NS
          </button>
          <button
            type="button"
            title={deafened ? "Undeafen" : "Deafen"}
            disabled={!room || mediaBusy}
            onClick={() => void toggleDeafen()}
            className={cn(
              "flex h-12 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-50",
              deafened
                ? "bg-white text-black"
                : "bg-white/10 text-white hover:bg-white/15",
            )}
          >
            {deafened ? <IconDeafened /> : <IconHeadphones />}
          </button>
          <button
            type="button"
            title={pttMode ? "Switch to voice activity" : "Push to talk"}
            disabled={!live || deafened}
            onClick={() => {
              const next = !pttMode;
              setPttMode(next);
              setPushToTalk(next);
              toast(next ? "Push to talk on" : "Voice activity on");
            }}
            className={cn(
              "flex h-12 items-center rounded-full px-3 text-[11px] font-medium transition-colors disabled:opacity-50",
              pttMode
                ? "bg-emerald-500 text-black"
                : "bg-white/10 text-white hover:bg-white/15",
            )}
          >
            PTT
          </button>
          <DeviceControl
            room={room}
            kind="audiooutput"
            label="Speakers / headphones"
            enabled={!deafened}
            disabled={!room || mediaBusy}
            hideToggle
            onDeviceError={setDeviceHint}
            iconOn={<IconHeadphones />}
            iconOff={<IconHeadphones />}
          />
          <DeviceControl
            room={room}
            kind="videoinput"
            label="Camera"
            enabled={camOn}
            disabled={!room || mediaBusy}
            onToggle={toggleCam}
            onDeviceError={setDeviceHint}
            iconOn={<IconCamera />}
            iconOff={<IconCameraOff />}
          />
          <button
            type="button"
            title={screenOn ? "Stop sharing" : "Share screen"}
            disabled={!room || mediaBusy}
            onClick={() => void toggleScreen()}
            className={cn(
              "flex h-12 items-center rounded-full px-3 text-[11px] font-medium transition-colors disabled:opacity-50",
              screenOn
                ? "bg-emerald-500 text-black"
                : "bg-white/10 text-white hover:bg-white/15",
            )}
          >
            Screen
          </button>
          <div className="relative">
            <button
              type="button"
              title="Soundboard"
              disabled={!live || deafened}
              onClick={() => setBoardOpen((v) => !v)}
              className="flex h-12 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/15 disabled:opacity-50"
            >
              <IconSoundboard />
            </button>
            {boardOpen && (
              <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-56 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl">
                <p className="border-b border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-white/45">
                  Soundboard
                </p>
                <div className="grid grid-cols-2 gap-1 p-2">
                  {SOUNDBOARD_CLIPS.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      disabled={!boardReady}
                      onClick={() => {
                        void fireSoundboard(clip.id);
                      }}
                      className="rounded-lg bg-white/5 px-2 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {clip.label}
                    </button>
                  ))}
                </div>
                {!boardReady && (
                  <p className="border-t border-white/10 px-3 py-1.5 text-[10px] text-white/35">
                    Cooldown…
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleLeave}
            className="ml-1 flex h-12 items-center gap-2 rounded-full bg-[#ed4245] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            title="Leave call"
          >
            <IconLeave />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

const PeerTile = function PeerTile({
  peer,
  room,
  compact,
  expanded,
  speaking,
  volume = 1,
  onVolumeChange,
  onFocusToggle,
  onFullscreen,
  isFocused,
  isFullscreen,
}: {
  peer: PeerSnapshot;
  room: Room | null;
  compact?: boolean;
  expanded?: boolean;
  speaking?: boolean;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  onFocusToggle?: () => void;
  onFullscreen?: () => void;
  isFocused?: boolean;
  isFullscreen?: boolean;
}) {
  const screenRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const [volOpen, setVolOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const screenEl = screenRef.current;
    const camEl = camRef.current;
    if (!room || (!peer.camOn && !peer.screenOn)) {
      if (screenEl) screenEl.srcObject = null;
      if (camEl) camEl.srcObject = null;
      return;
    }

    const participant: Participant | LocalParticipant | undefined = peer.isLocal
      ? room.localParticipant
      : room.remoteParticipants.get(peer.identity);
    if (!participant) return;

    const pubs = Array.from(participant.trackPublications.values());
    const screenPub = pubs.find(
      (pub) =>
        pub.source === Track.Source.ScreenShare && pub.track && !pub.isMuted,
    );
    const camPub = pubs.find(
      (pub) => pub.source === Track.Source.Camera && pub.track && !pub.isMuted,
    );

    const cleanups: Array<() => void> = [];

    if (screenEl && screenPub?.track) {
      screenPub.track.attach(screenEl);
      cleanups.push(() => screenPub.track?.detach(screenEl));
    } else if (screenEl) {
      screenEl.srcObject = null;
    }

    // Keep webcam visible even while screen sharing (PiP bubble)
    if (camEl && camPub?.track) {
      camPub.track.attach(camEl);
      cleanups.push(() => camPub.track?.detach(camEl));
    } else if (camEl) {
      camEl.srcObject = null;
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [peer.camOn, peer.screenOn, peer.identity, peer.isLocal, room]);

  useEffect(() => {
    if (!volOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVolOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [volOpen]);

  function openVolumeMenu(e: ReactMouseEvent) {
    if (!onVolumeChange || peer.isLocal) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setVolOpen(true);
  }

  const showScreen = peer.screenOn;
  const showCam = peer.camOn;
  const showVideo = showScreen || showCam;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[#0c0c0c] transition-[box-shadow] duration-150",
        compact
          ? "h-full w-full"
          : expanded
            ? "h-full w-full rounded-2xl ring-1 ring-white/5"
            : "aspect-video rounded-2xl ring-1 ring-white/5",
        onVolumeChange && !peer.isLocal && "cursor-pointer",
        speaking &&
          (compact
            ? "shadow-[inset_0_0_0_3px_rgba(52,211,153,0.95)]"
            : "ring-2 ring-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.35)]"),
      )}
      onClick={compact ? undefined : openVolumeMenu}
      onContextMenu={openVolumeMenu}
    >
      {showVideo ? (
        <>
          <video
            ref={screenRef}
            className={cn(
              "pointer-events-none h-full w-full bg-black",
              showScreen ? "object-contain" : "hidden",
            )}
            muted={peer.isLocal}
            playsInline
            autoPlay
          />
          <video
            ref={camRef}
            className={cn(
              "pointer-events-none bg-black object-cover",
              showScreen && showCam
                ? "absolute bottom-3 right-3 z-[5] h-24 w-24 rounded-xl object-cover ring-2 ring-white/20 shadow-lg sm:h-28 sm:w-28"
                : showCam
                  ? "h-full w-full"
                  : "hidden",
            )}
            muted={peer.isLocal}
            playsInline
            autoPlay
          />
          {showScreen && !showCam && (
            <div className="pointer-events-none absolute bottom-3 right-3 z-[5] flex h-24 w-24 items-center justify-center rounded-xl bg-black/50 ring-2 ring-white/10 sm:h-28 sm:w-28">
              <Avatar name={peer.name} src={peer.avatarUrl} size="lg" />
            </div>
          )}
        </>
      ) : (
        <div
          className={cn(
            "pointer-events-none flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#121212] to-[#080808]",
            compact ? "gap-1.5" : "gap-3",
          )}
        >
          <div
            className={cn(
              "rounded-full transition-[box-shadow] duration-150",
              speaking &&
                "shadow-[0_0_0_3px_rgba(52,211,153,0.95),0_0_20px_rgba(52,211,153,0.5)]",
            )}
          >
            <Avatar
              name={peer.name}
              src={peer.avatarUrl}
              size={compact ? "lg" : "xl"}
            />
          </div>
        </div>
      )}

      {!compact && (onFocusToggle || onFullscreen) && peer.screenOn && (
        <div className="absolute right-2 top-2 z-[8] flex gap-1">
          {onFocusToggle && (
            <button
              type="button"
              title={isFocused ? "Exit focus" : "Focus screen"}
              onClick={(e) => {
                e.stopPropagation();
                onFocusToggle();
              }}
              className="rounded-lg bg-black/60 px-2 py-1 text-[10px] font-medium text-white ring-1 ring-white/15 hover:bg-black/80"
            >
              {isFocused ? "Grid" : "Focus"}
            </button>
          )}
          {onFullscreen && (
            <button
              type="button"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={(e) => {
                e.stopPropagation();
                onFullscreen();
              }}
              className="rounded-lg bg-black/60 px-2 py-1 text-[10px] font-medium text-white ring-1 ring-white/15 hover:bg-black/80"
            >
              {isFullscreen ? "Exit FS" : "Full"}
            </button>
          )}
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-[6] bg-gradient-to-t from-black/70 to-transparent",
          compact ? "px-2 pb-1.5 pt-5" : "px-3 pb-3 pt-8",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate font-medium text-white",
              compact ? "text-[11px]" : "text-sm",
            )}
          >
            {peer.name}
            {peer.isLocal ? " (you)" : ""}
          </span>
          {!peer.micOn && (
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-red-300">
              muted
            </span>
          )}
          {peer.screenOn && (
            <span className="rounded bg-emerald-500/80 px-1.5 py-0.5 text-[10px] text-black">
              screen
            </span>
          )}
          {peer.screenOn && peer.camOn && (
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white">
              cam
            </span>
          )}
        </div>
      </div>

      {volOpen && onVolumeChange && menuPos && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[90]"
            aria-label="Close volume"
            onClick={(e) => {
              e.stopPropagation();
              setVolOpen(false);
            }}
          />
          <div
            className="fixed z-[91] w-56 rounded-xl border border-white/10 bg-[#161616] p-3 shadow-2xl"
            style={{
              left: Math.min(menuPos.x, window.innerWidth - 240),
              top: Math.min(menuPos.y, window.innerHeight - 100),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 truncate text-xs font-medium text-white">
              {peer.name}
            </p>
            <label className="flex items-center gap-2 text-[11px] text-white/60">
              Vol
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="h-1 w-full accent-emerald-400"
              />
              <span className="w-8 text-right tabular-nums text-white/50">
                {Math.round(volume * 100)}
              </span>
            </label>
            <button
              type="button"
              className="mt-2 w-full rounded-lg bg-white/5 px-2 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/10"
              onClick={() => {
                onVolumeChange(volume > 0 ? 0 : 1);
              }}
            >
              {volume > 0 ? "Mute user" : "Unmute user"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const PIP_W = 300;
const PIP_H = 220;

function DraggablePip({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Avoid a blank frame on full→pip (felt like leaving the call)
  const [mounted, setMounted] = useState(
    () => typeof document !== "undefined",
  );
  const drag = useRef<{
    ox: number;
    oy: number;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const handle = (e.target as HTMLElement).closest("[data-pip-drag]");
    if (!handle) return;
    // Don't start drag from interactive controls inside the header
    if ((e.target as HTMLElement).closest("a, button")) return;

    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const left = pos?.left ?? rect.left;
    const top = pos?.top ?? rect.top;
    drag.current = { ox: e.clientX, oy: e.clientY, left, top };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.ox;
    const dy = e.clientY - drag.current.oy;
    const maxL = Math.max(8, window.innerWidth - PIP_W - 8);
    const maxT = Math.max(8, window.innerHeight - PIP_H - 8);
    setPos({
      left: Math.min(maxL, Math.max(8, drag.current.left + dx)),
      top: Math.min(maxT, Math.max(8, drag.current.top + dy)),
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const node = (
    <div
      className="pointer-events-auto fixed z-[70]"
      style={
        pos
          ? { left: pos.left, top: pos.top, width: PIP_W, height: PIP_H }
          : { right: 16, bottom: 16, width: PIP_W, height: PIP_H }
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );

  // Portal to body so PiP shows over every text channel, not only #general
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function friendlyDeviceError(err: unknown, kind: string) {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  const message = err instanceof Error ? err.message : String(err);

  if (
    name === "NotReadableError" ||
    /Could not start video source/i.test(message)
  ) {
    return `Couldn’t start your ${kind}. Close Zoom, Teams, Discord, or other tabs using it, then click Allow microphone.`;
  }
  if (name === "NotAllowedError" || /Permission|dismissed/i.test(message)) {
    return `Microphone is blocked for this site. Click the lock icon in the address bar → Site settings → Microphone → Allow, then click Allow microphone here.`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return `No ${kind} detected (or Windows privacy is blocking it). Check Settings → Privacy → Microphone is on for your browser, then click Allow microphone.`;
  }
  if (/setSinkId|audio output/i.test(message)) {
    return "This browser can’t switch speakers. Try Chrome/Edge, or change output in OS settings.";
  }
  return message || `Couldn’t use your ${kind}.`;
}

function DeviceControl({
  room,
  kind,
  label,
  enabled,
  disabled,
  onToggle,
  onDeviceError,
  onMicRecovered,
  iconOn,
  iconOff,
  dangerWhenOff,
  hideToggle,
}: {
  room: Room | null;
  kind: MediaDeviceKind;
  label: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle?: () => void | Promise<void>;
  onDeviceError?: (message: string) => void;
  onMicRecovered?: () => void;
  iconOn: ReactNode;
  iconOff: ReactNode;
  dangerWhenOff?: boolean;
  hideToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const mutedLook = dangerWhenOff && !enabled;

  return (
    <div ref={rootRef} className="relative flex items-center">
      <div
        className={cn(
          "flex overflow-hidden rounded-full",
          mutedLook ? "bg-white text-black" : "bg-white/10 text-white",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {!hideToggle && onToggle ? (
          <button
            type="button"
            title={enabled ? `${label} on` : `${label} off`}
            disabled={disabled}
            onClick={() => void onToggle()}
            className="flex h-12 w-11 items-center justify-center transition-colors hover:bg-white/10 disabled:cursor-not-allowed"
          >
            <span className="flex h-5 w-5 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
              {enabled ? iconOn : iconOff}
            </span>
          </button>
        ) : (
          <button
            type="button"
            title={label}
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            className="flex h-12 w-11 items-center justify-center transition-colors hover:bg-white/10 disabled:cursor-not-allowed"
          >
            <span className="flex h-5 w-5 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
              {iconOn}
            </span>
          </button>
        )}
        <button
          type="button"
          title={`Select ${label.toLowerCase()}`}
          disabled={disabled || !room}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-12 w-7 items-center justify-center border-l transition-colors hover:bg-white/10 disabled:cursor-not-allowed",
            mutedLook ? "border-black/15" : "border-white/10",
          )}
          aria-expanded={open}
        >
          <IconChevron />
        </button>
      </div>

      {open && room && (
        <DeviceMenu
          room={room}
          kind={kind}
          label={label}
          onClose={() => setOpen(false)}
          onDeviceError={onDeviceError}
          onMicRecovered={onMicRecovered}
        />
      )}
    </div>
  );
}

function DeviceMenu({
  room,
  kind,
  label,
  onClose,
  onDeviceError,
  onMicRecovered,
}: {
  room: Room;
  kind: MediaDeviceKind;
  label: string;
  onClose: () => void;
  onDeviceError?: (message: string) => void;
  onMicRecovered?: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>(() =>
    getCachedDevices(kind),
  );
  const [activeId, setActiveId] = useState(() => {
    const cached = getCachedDevices(kind);
    const current = room.getActiveDevice(kind);
    if (current && cached.some((d) => d.deviceId === current)) return current;
    return cached[0]?.deviceId ?? "";
  });
  const [loading, setLoading] = useState(() => getCachedDevices(kind).length === 0);
  const [switching, setSwitching] = useState(false);
  const [allowBusy, setAllowBusy] = useState(false);
  const [localHint, setLocalHint] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const cached = getCachedDevices(kind);
      if (cached.length > 0) {
        setDevices(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const micLive = room.localParticipant.isMicrophoneEnabled;
        const camLive = room.localParticipant.isCameraEnabled;
        // Never open a second capture stream while LiveKit already owns mic/cam
        const requestPermission =
          (kind === "audioinput" && !micLive) ||
          (kind === "videoinput" && !camLive) ||
          (kind === "audiooutput" && !micLive);

        const list = await refreshMediaDevices(kind, { requestPermission });
        if (!alive) return;

        // Critical: empty refresh must NOT clear a list we already showed
        if (list.length > 0) {
          setDevices(list);
          const current = room.getActiveDevice(kind);
          const preferred = pickStickyDevice(kind, list, current);
          setActiveId(preferred ?? list[0].deviceId);
        }
      } catch (err) {
        if (alive) {
          onDeviceError?.(friendlyDeviceError(err, label.toLowerCase()));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function selectDevice(deviceId: string) {
    setSwitching(true);
    try {
      await room.switchActiveDevice(kind, deviceId, true);
      setActiveId(deviceId);
      setStickyDevice(kind, deviceId);

      if (kind === "audioinput") {
        await enableMicrophone(room, deviceId);
        onMicRecovered?.();
      }
      if (kind === "videoinput" && room.localParticipant.isCameraEnabled) {
        await room.localParticipant.setCameraEnabled(true, {
          ...CAM_OPTS,
          deviceId,
        });
      }

      onClose();
    } catch (err) {
      onDeviceError?.(friendlyDeviceError(err, label.toLowerCase()));
    } finally {
      setSwitching(false);
    }
  }

  async function allowAndList() {
    setAllowBusy(true);
    setLocalHint(null);
    try {
      if (kind === "audioinput" || kind === "audiooutput") {
        const access = await ensureMicAccess();
        if (!access.ok) {
          setLocalHint(
            [access.message, ...access.steps.map((s, i) => `${i + 1}. ${s}`)].join(
              " ",
            ),
          );
          onDeviceError?.(access.message);
          return;
        }
        setDevices(access.devices);
        const preferred =
          access.deviceId || access.devices[0]?.deviceId || undefined;
        if (preferred) setActiveId(preferred);
        if (kind === "audioinput") {
          await enableMicrophone(room, preferred);
          onMicRecovered?.();
        }
        const outs = await refreshMediaDevices("audiooutput");
        if (kind === "audiooutput" && outs.length > 0) {
          setDevices(outs);
          setActiveId(outs[0].deviceId);
        }
      } else {
        const list = await refreshMediaDevices(kind, {
          requestPermission: true,
        });
        if (list.length > 0) {
          setDevices(list);
          setActiveId(list[0].deviceId);
        } else {
          setLocalHint("No camera found. Check browser permissions.");
        }
      }
    } catch (err) {
      const msg = friendlyDeviceError(err, label.toLowerCase());
      setLocalHint(msg);
      onDeviceError?.(msg);
    } finally {
      setAllowBusy(false);
      setLoading(false);
    }
  }

  async function refresh() {
    if (devices.length === 0 && (kind === "audioinput" || kind === "audiooutput")) {
      await allowAndList();
      return;
    }
    setLoading(devices.length === 0);
    try {
      const list = await refreshMediaDevices(kind, {
        requestPermission: devices.length === 0,
      });
      if (list.length > 0) {
        setDevices(list);
        setActiveId(room.getActiveDevice(kind) ?? list[0].deviceId);
      }
    } finally {
      setLoading(false);
    }
  }

  const showEmpty = !loading && devices.length === 0;

  return (
    <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/45">
          {label}
        </span>
        <button
          type="button"
          className="text-[10px] text-white/40 hover:text-white/80"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {loading && devices.length === 0 ? (
          <li className="px-3 py-2 text-xs text-white/40">
            Looking for devices…
          </li>
        ) : showEmpty ? (
          <li className="space-y-2 px-3 py-2 text-xs text-white/50">
            <p>
              {localHint ||
                (kind === "videoinput"
                  ? "Camera blocked or missing."
                  : kind === "audiooutput"
                    ? "Allow mic once so the browser can list speakers."
                    : "Click Allow microphone. If Windows blocked it, turn on mic access for your browser in Privacy settings.")}
            </p>
            <button
              type="button"
              disabled={allowBusy}
              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
              onClick={() => void allowAndList()}
            >
              {allowBusy
                ? "Requesting…"
                : kind === "videoinput"
                  ? "Allow camera"
                  : "Allow microphone"}
            </button>
            <p className="text-[10px] leading-relaxed text-white/35">
              If no popup appears: address bar lock icon → Microphone → Allow.
              On Windows also check Settings → Privacy → Microphone.
            </p>
          </li>
        ) : (
          devices.map((device, i) => {
            const active = device.deviceId === activeId;
            return (
              <li key={device.deviceId || `${kind}-${i}`}>
                <button
                  type="button"
                  disabled={switching}
                  onClick={() => void selectDevice(device.deviceId)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/5 disabled:opacity-50",
                    active && "bg-white/10 text-white",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      active ? "bg-emerald-400" : "bg-transparent",
                    )}
                  />
                  <span className="truncate">
                    {device.label?.trim() || `${label} ${i + 1}`}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}


function IconMic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMicOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V6a3 3 0 0 0-5.94-.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.74 14.06A6.97 6.97 0 0 0 19 11M5 11a7 7 0 0 0 11.05 5.7M12 18v3M2 2l20 20"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="6"
        width="13"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M16 10.5 21 7v10l-5-3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCameraOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16 10.5 21 7v10l-2.2-1.54M3 3l18 18M7.2 6H14a2 2 0 0 1 2 2v6.8M3.4 7.2A2 2 0 0 0 3 8.5v7a2 2 0 0 0 2 2h9.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconScreen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M8 20h8M12 16v4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconHeadphones() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2ZM17 11h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M4 13a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDeafened() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2ZM17 11h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M4 13a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLeave() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M15.5 8.5c1.4 1.1 2.3 2.7 2.3 4.5 0 3.2-2.6 5.8-5.8 5.8S6.2 16.2 6.2 13c0-1.8.9-3.4 2.3-4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M12 3v9M8 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSoundboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M7 12v3M11 9v6M15 11v4M19 10v5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
