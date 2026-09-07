"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  type LocalParticipant,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { Avatar } from "@/components/ui/Avatar";
import {
  playLeaveSound,
  playMuteSound,
  playUnmuteSound,
  playCameraOffSound,
  playCameraOnSound,
  unlockAudio,
  playSoundboardClip,
  SOUNDBOARD_CLIPS,
  SOUNDBOARD_COOLDOWN_MS,
} from "@/lib/call-sounds";
import {
  getCachedDevices,
  refreshMediaDevices,
  warmDeviceCache,
  ensureMicAccess,
} from "@/lib/media-devices";
import { cn } from "@/lib/utils";

type CallOverlayProps = {
  channelId: string;
  channelName: string;
  displayName: string;
  onLeave: () => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  /** Remote peers in this LiveKit room — used for Lounge sidebar when presence lags */
  onRemoteRoster?: (
    peers: { user_id: string; display_name: string }[],
  ) => void;
  /** Identities currently speaking (for member list rings) */
  onSpeakingChange?: (ids: string[]) => void;
  /** Discord-style mini window while browsing text channels */
  variant?: "full" | "pip";
  /** Link back to the voice channel (PiP header) */
  returnHref?: string;
};

type PeerSnapshot = {
  identity: string;
  name: string;
  isLocal: boolean;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
};

const MIC_OPTS = {
  echoCancellation: true,
  // noiseSuppression is CPU-heavy and was locking the tab for some users
  noiseSuppression: false,
  autoGainControl: true,
} as const;

const CAM_OPTS = {
  resolution: VideoPresets.h360.resolution,
} as const;

/** Try LiveKit mic with constraints, then bare enable (friends hit NotFound on strict opts). */
async function enableMicrophone(room: Room, deviceId?: string) {
  const attempts: (MediaTrackConstraints | undefined)[] = [
    deviceId ? { ...MIC_OPTS, deviceId } : { ...MIC_OPTS },
    deviceId ? { deviceId } : undefined,
    {},
  ];
  let lastErr: unknown;
  for (const opts of attempts) {
    try {
      if (opts === undefined) {
        await room.localParticipant.setMicrophoneEnabled(true);
      } else {
        await room.localParticipant.setMicrophoneEnabled(true, opts);
      }
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function localPlaceholder(displayName: string): PeerSnapshot {
  return {
    identity: "__local__",
    name: displayName,
    isLocal: true,
    micOn: false,
    camOn: false,
    screenOn: false,
  };
}

function snapshotPeers(room: Room): PeerSnapshot[] {
  const all: Participant[] = [
    room.localParticipant,
    ...Array.from(room.remoteParticipants.values()),
  ];
  return all.map((p) => ({
    identity: p.identity,
    name: p.name || p.identity.slice(0, 8),
    isLocal: p.isLocal,
    micOn: p.isMicrophoneEnabled,
    camOn: p.isCameraEnabled,
    screenOn: p.isScreenShareEnabled,
  }));
}

function peersEqual(a: PeerSnapshot[], b: PeerSnapshot[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.identity !== y.identity ||
      x.name !== y.name ||
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
  onLeave,
  onConnected,
  onDisconnected,
  onRemoteRoster,
  onSpeakingChange,
  variant = "full",
  returnHref,
}: CallOverlayProps) {
  const [status, setStatus] = useState<
    "connecting" | "live" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerSnapshot[]>(() => [
    localPlaceholder(displayName),
  ]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [pttMode, setPttMode] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [connLabel, setConnLabel] = useState("Connecting…");
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
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

  const roomRef = useRef<Room | null>(null);
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const deafenedRef = useRef(false);
  const peerVolumesRef = useRef<Record<string, number>>({});
  const mediaBusyRef = useRef(false);
  const intentionalLeave = useRef(false);
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
      const next = snapshotPeers(room);
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
          .map((p) => ({ user_id: p.identity, display_name: p.name })),
      );
    }, 80);
  }, []);

  useEffect(() => {
    let cancelled = false;
    intentionalLeave.current = false;
    knownRemotes.current = null;

    const room = new Room({
      // Audio-first Lounge: skip adaptive video work that hammers the main thread
      adaptiveStream: false,
      dynacast: false,
      stopLocalTrackOnUnpublish: true,
      audioCaptureDefaults: { ...MIC_OPTS },
    });
    roomRef.current = room;
    setRoom(room);

    // display:none can mute HTMLAudioElement in Chrome — keep off-screen instead
    const audioHost = document.createElement("div");
    audioHost.setAttribute("data-hango-audio", "true");
    audioHost.style.cssText =
      "position:fixed;width:1px;height:1px;left:-9999px;top:0;overflow:hidden;opacity:0;pointer-events:none";
    document.body.appendChild(audioHost);
    audioHostRef.current = audioHost;

    const attachedAudio = new Set<string>();

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
      .on(RoomEvent.ParticipantConnected, schedulePeers)
      .on(RoomEvent.ParticipantDisconnected, schedulePeers)
      .on(RoomEvent.LocalTrackPublished, schedulePeers)
      .on(RoomEvent.LocalTrackUnpublished, schedulePeers)
      // Intentionally NOT listening to TrackMuted/Unmuted — those fire too often
      // and were freezing the tab. Mute UI updates from local toggles + rare peer refresh.
      .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (!participant.isLocal && track.kind === Track.Kind.Audio) {
          attachRemoteAudio(track as RemoteTrack, participant.identity);
        }
        if (track.kind === Track.Kind.Video) schedulePeers();
      })
      .on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        detachTrack(track as RemoteTrack, participant.identity);
        if (track.kind === Track.Kind.Video) schedulePeers();
      })
      .on(RoomEvent.MediaDevicesError, (err) => {
        setDeviceHint(friendlyDeviceError(err, "device"));
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const ids = speakers.map((s) => s.identity);
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
      })
      .on(RoomEvent.DataReceived, (payload, participant) => {
        if (participant?.isLocal) return;
        try {
          const text = new TextDecoder().decode(payload);
          const msg = JSON.parse(text) as { t?: string; id?: string };
          if (msg.t === "sb" && typeof msg.id === "string") {
            // Sender already rate-limited; force play so we stay in sync
            playSoundboardClip(msg.id, { force: true });
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
          setStatus("live");
          setConnLabel("Voice Connected");
          onConnectedRef.current?.();
          schedulePeers();
          knownRemotes.current = new Set(room.remoteParticipants.keys());
        } else if (state === ConnectionState.Connecting) {
          setConnLabel("Connecting…");
        } else if (state === ConnectionState.Reconnecting) {
          setConnLabel("Reconnecting…");
        } else if (
          state === ConnectionState.Disconnected &&
          !intentionalLeave.current
        ) {
          setStatus("error");
          setConnLabel("Disconnected");
          setError("Disconnected from the call.");
          onDisconnectedRef.current?.();
        }
      });

    async function start() {
      setStatus("connecting");
      setError(null);
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, displayName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to join call");
        if (cancelled) return;

        await room.connect(data.url, data.token, {
          // Auto-subscribe audio; skip unused video until someone publishes
          autoSubscribe: true,
        });
        if (cancelled) return;

        attachExistingRemoteAudio();

        // Browser autoplay policy — required to hear remote participants
        try {
          await room.startAudio();
          setAudioBlocked(!room.canPlaybackAudio);
        } catch {
          setAudioBlocked(true);
        }

        // Yield so Chrome can paint before getUserMedia (avoids "Page Unresponsive")
        await new Promise<void>((r) => setTimeout(r, 120));
        if (cancelled) return;

        try {
          await enableMicrophone(room);
          setMicOn(true);
          void warmDeviceCache();
        } catch (micErr) {
          setDeviceHint(friendlyDeviceError(micErr, "microphone"));
          setMicOn(false);
          setNeedsMicAllow(true);
          setMicHelpSteps([
            "Click Allow microphone below (or in the mic menu)",
            "If a popup appears, choose Allow",
            "If it says blocked: address bar lock → Microphone → Allow, then reload",
            "Windows: Settings → Privacy → Microphone must be on for your browser",
          ]);
          void warmDeviceCache();
        }
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
      void room.disconnect();
      room.removeAllListeners();
      roomRef.current = null;
      setRoom(null);
      audioHostRef.current = null;
      audioHost.remove();
    };
  }, [channelId, displayName, schedulePeers]);

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

  async function withMediaLock(fn: () => Promise<void>) {
    if (mediaBusyRef.current) return;
    const r = roomRef.current;
    if (!r || r.state !== ConnectionState.Connected) {
      setDeviceHint("Still connecting — try again in a moment.");
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
          await enableMicrophone(r, preferred);
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
      const r = roomRef.current;
      if (r && r.state === ConnectionState.Connected) {
        const preferred =
          access.deviceId || access.devices[0]?.deviceId || undefined;
        await enableMicrophone(r, preferred);
        setMicOn(true);
        setNeedsMicAllow(false);
        setMicHelpSteps([]);
        playUnmuteSound();
        schedulePeers();
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
        await r.localParticipant.setScreenShareEnabled(next);
        setScreenOn(next);
      } catch (err) {
        setScreenOn(false);
        setDeviceHint(
          err instanceof Error
            ? err.message
            : "Screen share failed — check browser permission",
        );
      }
    });
  }

  // Push-to-talk: hold Space while PTT mode is on
  useEffect(() => {
    pttModeRef.current = pttMode;
  }, [pttMode]);

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
    applyPeerVolume(peerId, volume);
  }

  function handleLeave() {
    intentionalLeave.current = true;
    playLeaveSound();
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

  const live = status === "live";
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
                    <Avatar name={p.name} size="sm" className="!h-6 !w-6 !text-[9px]" />
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
          </p>
        </div>
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

      {(needsMicAllow || deviceHint) && (
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
              <button
                type="button"
                disabled={micAllowBusy}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50"
                onClick={() => void allowMicrophone()}
              >
                {micAllowBusy ? "Requesting…" : "Allow microphone"}
              </button>
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

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 pb-32">
        <div className={cn("grid w-full gap-3", gridClass)}>
          {peers.map((p) => (
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
            />
          ))}
        </div>
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
            onClick={() => setPttMode((v) => !v)}
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
  speaking,
  volume = 1,
  onVolumeChange,
}: {
  peer: PeerSnapshot;
  room: Room | null;
  compact?: boolean;
  speaking?: boolean;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !room || (!peer.camOn && !peer.screenOn)) {
      if (el) el.srcObject = null;
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
    const usePub = screenPub || camPub;
    if (!usePub?.track) return;

    usePub.track.attach(el);
    return () => {
      usePub.track?.detach(el);
    };
  }, [peer.camOn, peer.screenOn, peer.identity, peer.isLocal, room]);

  const showVideo = peer.camOn || peer.screenOn;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[#0c0c0c] transition-[box-shadow] duration-150",
        compact
          ? "h-full w-full"
          : "aspect-video rounded-2xl ring-1 ring-white/5",
        speaking &&
          (compact
            ? "shadow-[inset_0_0_0_3px_rgba(52,211,153,0.95)]"
            : "ring-2 ring-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.35)]"),
      )}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className="h-full w-full object-contain bg-black"
          muted={peer.isLocal}
          playsInline
          autoPlay
        />
      ) : (
        <div
          className={cn(
            "flex h-full flex-col items-center justify-center bg-gradient-to-b from-[#121212] to-[#080808]",
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
            <Avatar name={peer.name} size={compact ? "lg" : "xl"} />
          </div>
        </div>
      )}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent",
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
        </div>
        {onVolumeChange && !compact && (
          <label className="mt-1.5 flex items-center gap-2 text-[10px] text-white/60">
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
          </label>
        )}
      </div>
    </div>
  );
};

const PIP_W = 300;
const PIP_H = 220;

function DraggablePip({ children }: { children: ReactNode }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);
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
          setActiveId(
            current && list.some((d) => d.deviceId === current)
              ? current
              : list[0].deviceId,
          );
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
