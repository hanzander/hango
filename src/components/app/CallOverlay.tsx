"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useConnectionState,
  useIsSpeaking,
  useMediaDeviceSelect,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { ConnectionState, Track, type Participant } from "livekit-client";
import { Avatar } from "@/components/ui/Avatar";
import { playJoinSound, playLeaveSound, playUserJoinedSound, playUserLeftSound, playMuteSound, playUnmuteSound, playCameraOffSound, playCameraOnSound } from "@/lib/call-sounds";
import { cn } from "@/lib/utils";

export type CallMode = "voice" | "video";

type CallOverlayProps = {
  channelId: string;
  channelName: string;
  displayName: string;
  preferVideo?: boolean;
  onLeave: () => void;
  fullStage?: boolean;
};

export function CallOverlay({
  channelId,
  channelName,
  displayName,
  preferVideo = false,
  onLeave,
  fullStage = true,
}: CallOverlayProps) {
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      setLoading(true);
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
        setToken(data.token);
        setServerUrl(data.url);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to join call");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [channelId, displayName]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center bg-[#050505] text-sm text-text-muted",
          fullStage ? "min-h-0" : "min-h-[280px]",
        )}
      >
        Connecting to {channelName}…
      </div>
    );
  }

  if (error || !token || !serverUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#050505] px-6 text-center">
        <p className="text-sm text-danger">{error || "Missing call credentials"}</p>
        <button
          type="button"
          onClick={onLeave}
          className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-secondary hover:text-text"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio
      video={preferVideo}
      onDisconnected={onLeave}
      onError={(err) => {
        // Don't tear down the room for device failures — CallStage shows a banner.
        console.warn("[hango call]", err);
      }}
      onMediaDeviceFailure={(failure, kind) => {
        console.warn("[hango device]", kind, failure);
      }}
      className="flex min-h-0 flex-1 flex-col bg-[#050505]"
    >
      <CallStage channelName={channelName} onLeave={onLeave} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function CallStage({
  channelName,
  onLeave,
}: {
  channelName: string;
  onLeave: () => void;
}) {
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  const micOn = localParticipant.isMicrophoneEnabled;
  const camOn = localParticipant.isCameraEnabled;
  const connected = connectionState === ConnectionState.Connected;
  const playedJoinSound = useRef(false);
  const knownPeers = useRef<Set<string> | null>(null);
  const [deviceHint, setDeviceHint] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || playedJoinSound.current) return;
    playedJoinSound.current = true;
    playJoinSound();
  }, [connected]);

  // Peer join / leave cues (skip local + first snapshot)
  useEffect(() => {
    if (!connected) return;

    const ids = new Set(
      participants
        .filter((p) => !p.isLocal)
        .map((p) => p.identity),
    );

    if (knownPeers.current === null) {
      knownPeers.current = ids;
      return;
    }

    for (const id of ids) {
      if (!knownPeers.current.has(id)) playUserJoinedSound();
    }
    for (const id of knownPeers.current) {
      if (!ids.has(id)) playUserLeftSound();
    }
    knownPeers.current = ids;
  }, [participants, connected]);

  async function toggleMic() {
    try {
      setDeviceHint(null);
      const next = !micOn;
      await localParticipant.setMicrophoneEnabled(next);
      if (next) playUnmuteSound();
      else playMuteSound();
    } catch (err) {
      setDeviceHint(friendlyDeviceError(err, "microphone"));
    }
  }

  async function toggleCam() {
    try {
      setDeviceHint(null);
      const next = !camOn;
      await localParticipant.setCameraEnabled(next);
      if (next) playCameraOnSound();
      else playCameraOffSound();
    } catch (err) {
      setDeviceHint(friendlyDeviceError(err, "camera"));
    }
  }

  function handleLeave() {
    playLeaveSound();
    // Let the leave chime start before tearing down audio
    window.setTimeout(() => onLeave(), 120);
  }

  const gridClass = useMemo(() => {
    const n = Math.max(participants.length, 1);
    if (n === 1) return "grid-cols-1 max-w-3xl mx-auto";
    if (n === 2) return "grid-cols-1 sm:grid-cols-2 max-w-5xl mx-auto";
    if (n <= 4) return "grid-cols-2 max-w-5xl mx-auto";
    return "grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto";
  }, [participants.length]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
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
                connected
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : "bg-amber-400",
              )}
            />
            <h1 className="text-sm font-semibold tracking-tight text-text">
              {channelName}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {connected
              ? `${participants.length} connected`
              : String(connectionState)}
          </p>
        </div>
      </header>

      {deviceHint && (
        <div className="relative z-10 mx-5 mb-2 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <p>{deviceHint}</p>
          <button
            type="button"
            className="shrink-0 text-amber-200/80 hover:text-white"
            onClick={() => setDeviceHint(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 pb-32">
        <div className={cn("grid w-full gap-3", gridClass)}>
          {cameraTracks.map((trackRef) => (
            <ParticipantTile
              key={`${trackRef.participant.identity}-${trackRef.source}`}
              participant={trackRef.participant}
              trackRef={trackRef}
              showVideo={Boolean(
                trackRef.publication?.track &&
                  !trackRef.publication.isMuted &&
                  trackRef.participant.isCameraEnabled,
              )}
            />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-6">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-black/75 px-2 py-2 shadow-2xl backdrop-blur-xl">
          <DeviceControl
            kind="audioinput"
            label="Microphone"
            enabled={micOn}
            dangerWhenOff
            onToggle={toggleMic}
            onDeviceError={(msg) => setDeviceHint(msg)}
            iconOn={<IconMic />}
            iconOff={<IconMicOff />}
          />
          <DeviceControl
            kind="audiooutput"
            label="Speakers / headphones"
            enabled
            hideToggle
            onDeviceError={(msg) => setDeviceHint(msg)}
            iconOn={<IconHeadphones />}
            iconOff={<IconHeadphones />}
          />
          <DeviceControl
            kind="videoinput"
            label="Camera"
            enabled={camOn}
            onToggle={toggleCam}
            onDeviceError={(msg) => setDeviceHint(msg)}
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

function friendlyDeviceError(err: unknown, kind: string) {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  const message = err instanceof Error ? err.message : String(err);

  if (name === "NotReadableError" || /Could not start video source/i.test(message)) {
    return `Couldn’t start your ${kind}. Close other apps using it (Zoom, Teams, browser tabs), then try again.`;
  }
  if (name === "NotAllowedError" || /Permission/i.test(message)) {
    return `Permission denied for ${kind}. Allow access in your browser settings.`;
  }
  if (name === "NotFoundError") {
    return `No ${kind} found. Plug one in or pick another device.`;
  }
  return message || `Couldn’t use your ${kind}.`;
}

function DeviceControl({
  kind,
  label,
  enabled,
  onToggle,
  onDeviceError,
  iconOn,
  iconOff,
  dangerWhenOff,
  hideToggle,
}: {
  kind: MediaDeviceKind;
  label: string;
  enabled: boolean;
  onToggle?: () => void | Promise<void>;
  onDeviceError?: (message: string) => void;
  iconOn: ReactNode;
  iconOff: ReactNode;
  dangerWhenOff?: boolean;
  hideToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Only request getUserMedia after the track is already live (or for audio menus).
  // requestPermissions:true on videoinput at join causes NotReadableError overlays.
  const shouldRequestPermissions =
    open && (kind !== "videoinput" || enabled);

  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({
      kind,
      requestPermissions: shouldRequestPermissions,
      onError: (e) => onDeviceError?.(friendlyDeviceError(e, label.toLowerCase())),
    });

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const mutedLook = dangerWhenOff && !enabled;

  return (
    <div ref={rootRef} className="relative flex items-center">
      <div
        className={cn(
          "flex overflow-hidden rounded-full",
          mutedLook ? "bg-white text-black" : "bg-white/10 text-white",
        )}
      >
        {!hideToggle && onToggle ? (
          <button
            type="button"
            title={enabled ? `${label} on` : `${label} off`}
            onClick={() => void onToggle()}
            className="flex h-12 w-11 items-center justify-center transition-colors hover:bg-white/10"
          >
            <span className="flex h-5 w-5 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
              {enabled ? iconOn : iconOff}
            </span>
          </button>
        ) : (
          <button
            type="button"
            title={label}
            onClick={() => setOpen((v) => !v)}
            className="flex h-12 w-11 items-center justify-center transition-colors hover:bg-white/10"
          >
            <span className="flex h-5 w-5 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
              {iconOn}
            </span>
          </button>
        )}
        <button
          type="button"
          title={`Select ${label.toLowerCase()}`}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-12 w-7 items-center justify-center border-l transition-colors hover:bg-white/10",
            mutedLook ? "border-black/15" : "border-white/10",
          )}
          aria-expanded={open}
        >
          <IconChevron />
        </button>
      </div>

      {open && (
        <div className="absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-64 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-white/45">
            {label}
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {devices.length === 0 ? (
              <li className="px-3 py-2 text-xs text-white/40">
                {kind === "videoinput" && !enabled
                  ? "Turn camera on to list devices"
                  : "No devices found"}
              </li>
            ) : (
              devices.map((device) => {
                const active = device.deviceId === activeDeviceId;
                return (
                  <li key={device.deviceId || device.label}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await setActiveMediaDevice(device.deviceId);
                          setOpen(false);
                        } catch (err) {
                          onDeviceError?.(
                            friendlyDeviceError(err, label.toLowerCase()),
                          );
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/5",
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
                        {device.label || "Default device"}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ParticipantTile({
  participant,
  trackRef,
  showVideo,
}: {
  participant: Participant;
  trackRef: TrackReferenceOrPlaceholder;
  showVideo: boolean;
}) {
  const speaking = useIsSpeaking(participant);
  const name = participant.name || participant.identity.slice(0, 8);

  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-2xl bg-[#0c0c0c] ring-1 ring-white/5 transition-shadow",
        speaking &&
          "ring-2 ring-emerald-400/80 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]",
      )}
    >
      {showVideo && trackRef.publication?.track ? (
        <VideoTrack
          trackRef={trackRef}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#121212] to-[#080808]">
          <div
            className={cn(
              "rounded-full p-0.5 transition-all",
              speaking && "bg-emerald-400/30 p-1",
            )}
          >
            <Avatar name={name} size="xl" />
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">
            {name}
            {participant.isLocal ? " (you)" : ""}
          </span>
          {!participant.isMicrophoneEnabled && (
            <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-red-300">
              muted
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Clean stroke icons — fixed size, crisp on HiDPI */
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
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      aria-hidden
    >
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
