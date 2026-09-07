"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
};

type PeerSnapshot = {
  identity: string;
  name: string;
  isLocal: boolean;
  micOn: boolean;
  camOn: boolean;
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
      x.camOn !== y.camOn
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
  const [mediaBusy, setMediaBusy] = useState(false);
  const [deviceHint, setDeviceHint] = useState<string | null>(null);
  const [needsMicAllow, setNeedsMicAllow] = useState(false);
  const [micAllowBusy, setMicAllowBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);

  const roomRef = useRef<Room | null>(null);
  const mediaBusyRef = useRef(false);
  const intentionalLeave = useRef(false);
  const knownRemotes = useRef<Set<string> | null>(null);
  const peerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onLeaveRef = useRef(onLeave);
  const onRemoteRosterRef = useRef(onRemoteRoster);
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onLeaveRef.current = onLeave;
  onRemoteRosterRef.current = onRemoteRoster;

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
      setMicOn((prev) => (prev === mic ? prev : mic));
      setCamOn((prev) => (prev === cam ? prev : cam));
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

    const attachedAudio = new Set<string>();

    function attachRemoteAudio(track: RemoteTrack, participantId: string) {
      if (track.kind !== Track.Kind.Audio) return;
      const key = `${participantId}:${track.sid}`;
      if (attachedAudio.has(key)) return;
      attachedAudio.add(key);
      const el = track.attach() as HTMLMediaElement;
      el.dataset.hangoTrack = key;
      el.autoplay = true;
      el.muted = false;
      el.volume = 1;
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
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) {
          setStatus("live");
          onConnectedRef.current?.();
          schedulePeers();
          knownRemotes.current = new Set(room.remoteParticipants.keys());
        } else if (
          state === ConnectionState.Disconnected &&
          !intentionalLeave.current
        ) {
          setStatus("error");
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
      audioHost.remove();
    };
  }, [channelId, displayName, schedulePeers]);

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
    try {
      const access = await ensureMicAccess();
      if (!access.ok) {
        setNeedsMicAllow(true);
        setDeviceHint(access.message);
        return;
      }
      const r = roomRef.current;
      if (r && r.state === ConnectionState.Connected) {
        await enableMicrophone(r, access.devices[0]?.deviceId);
        setMicOn(true);
        setNeedsMicAllow(false);
        playUnmuteSound();
        schedulePeers();
      }
    } catch (err) {
      setNeedsMicAllow(true);
      setDeviceHint(friendlyDeviceError(err, "microphone"));
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
            {live ? `${peers.length} connected` : "Connecting…"}
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
        <div className="relative z-10 mx-5 mb-2 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 flex-1">
            {deviceHint ||
              "Microphone needs permission. Click Allow microphone — if nothing pops up, use the lock icon in the address bar → Microphone → Allow."}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {(needsMicAllow || !micOn) && (
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
                onClick={() => setDeviceHint(null)}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 pb-32">
        <div className={cn("grid w-full gap-3", gridClass)}>
          {peers.map((p) => (
            <PeerTile key={p.identity} peer={p} room={room} />
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
            enabled={micOn}
            disabled={!room || mediaBusy}
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
          <DeviceControl
            room={room}
            kind="audiooutput"
            label="Speakers / headphones"
            enabled
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
}: {
  peer: PeerSnapshot;
  room: Room | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !room || !peer.camOn) {
      if (el) el.srcObject = null;
      return;
    }

    const participant: Participant | LocalParticipant | undefined = peer.isLocal
      ? room.localParticipant
      : room.remoteParticipants.get(peer.identity);
    if (!participant) return;

    const camPub = Array.from(participant.trackPublications.values()).find(
      (pub) => pub.source === Track.Source.Camera && pub.track && !pub.isMuted,
    );
    if (!camPub?.track) return;

    camPub.track.attach(el);
    return () => {
      camPub.track?.detach(el);
    };
  }, [peer.camOn, peer.identity, peer.isLocal, room]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0c0c0c] ring-1 ring-white/5">
      {peer.camOn ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted={peer.isLocal}
          playsInline
          autoPlay
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#121212] to-[#080808]">
          <Avatar name={peer.name} size="xl" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">
            {peer.name}
            {peer.isLocal ? " (you)" : ""}
          </span>
          {!peer.micOn && (
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-red-300">
              muted
            </span>
          )}
        </div>
      </div>
    </div>
  );
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
          setLocalHint(access.message);
          onDeviceError?.(access.message);
          return;
        }
        setDevices(access.devices);
        if (access.devices[0]) setActiveId(access.devices[0].deviceId);
        if (kind === "audioinput") {
          await enableMicrophone(room, access.devices[0]?.deviceId);
          onMicRecovered?.();
        }
        const outs = await refreshMediaDevices("audiooutput");
        if (kind === "audiooutput" && outs.length > 0) {
          setDevices(outs);
          setActiveId(outs[0].deviceId);
        }
      } else {
        const list = await refreshMediaDevices(kind, { requestPermission: true });
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
                    : "Browser hasn't allowed the microphone yet (common on a friend's PC).")}
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
