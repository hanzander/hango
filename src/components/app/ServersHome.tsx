"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Server } from "@/lib/types";
import { initials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ServerActionsModal } from "@/components/app/ServerActionsModal";
import { Avatar } from "@/components/ui/Avatar";
import { AuthMoment } from "@/components/auth/AuthMoment";
import { armAuthCover } from "@/lib/auth-cover";
import { getServerEnterHref } from "@/lib/app-cache";
import { enterServerNow } from "@/lib/leave-server";

type ServersHomeProps = {
  displayName: string;
  avatarUrl?: string | null;
  userId: string;
  servers: Server[];
  onSignOut?: () => void | Promise<void>;
};

export function ServersHome({
  displayName,
  avatarUrl,
  userId,
  servers: initialServers,
  onSignOut,
}: ServersHomeProps) {
  const router = useRouter();
  const [servers, setServers] = useState(initialServers);
  const [open, setOpen] = useState(false);
  const [sayingBye, setSayingBye] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Server | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setServers(initialServers);
  }, [initialServers]);

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

  const finishGoodbye = useCallback(async () => {
    armAuthCover("goodbye");
    await onSignOut?.();
  }, [onSignOut]);

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name || name === renaming.name) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("servers")
        .update({ name })
        .eq("id", renaming.id)
        .eq("owner_id", userId);
      if (err) throw err;
      setServers((prev) =>
        prev.map((s) => (s.id === renaming.id ? { ...s, name } : s)),
      );
      setRenaming(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename server");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(server: Server) {
    const ok = window.confirm(
      `Delete “${server.name}”? This removes the server and all of its channels for everyone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setMenuId(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("servers")
        .delete()
        .eq("id", server.id)
        .eq("owner_id", userId);
      if (err) throw err;
      setServers((prev) => prev.filter((s) => s.id !== server.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      {sayingBye && <AuthMoment kind="goodbye" onDone={finishGoodbye} />}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -12%, rgba(255,196,140,0.09), transparent 55%),
            radial-gradient(ellipse 45% 35% at 100% 10%, rgba(180,120,80,0.05), transparent 50%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,210,160,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,210,160,0.05) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 70% 55% at 50% 20%, black, transparent)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-text transition-opacity hover:opacity-80"
        >
          hango
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/app/friends"
            className="text-sm text-text-muted transition-colors hover:text-text"
          >
            Friends
          </Link>
          {onSignOut ? (
            <button
              type="button"
              onClick={() => setSayingBye(true)}
              title={`Log out · ${displayName}`}
              aria-label={`Log out of ${displayName}`}
              className="rounded-full ring-1 ring-transparent transition hover:opacity-90 hover:ring-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Avatar name={displayName} src={avatarUrl} size="sm" />
            </button>
          ) : (
            <Avatar name={displayName} src={avatarUrl} size="sm" />
          )}
        </div>
      </header>

      <main className="hango-servers-in relative z-10 mx-auto w-full max-w-3xl px-6 pb-24 pt-6 md:pt-10">
        <p className="text-sm text-text-muted">
          Hey {displayName.split(" ")[0] || displayName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text md:text-4xl">
          Your servers
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
          Pick a space to{" "}
          <span className="text-text">hango</span>
          <span className="text-text-secondary">ut</span>. Come back here anytime
          to switch.
        </p>

        {error && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {servers.map((server, i) => {
            const isOwner = server.owner_id === userId;
            return (
              <div
                key={server.id}
                className="hango-server-card relative"
                style={{ animationDelay: `${30 + i * 35}ms` }}
              >
                <Link
                  href={getServerEnterHref(server.id)}
                  prefetch
                  onClick={(e) => {
                    e.preventDefault();
                    enterServerNow(getServerEnterHref(server.id));
                  }}
                  className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border-strong bg-[#141312]/90 p-4 pr-12 transition-all duration-200 hover:-translate-y-0.5 hover:border-text-muted hover:bg-bg-subtle"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(ellipse 80% 70% at 0% 50%, rgba(255,196,140,0.07), transparent 55%)",
                    }}
                  />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-active text-sm font-medium text-text ring-1 ring-border transition-transform duration-200 group-hover:scale-[1.03]">
                    {initials(server.name)}
                  </span>
                  <div className="relative min-w-0 flex-1">
                    <p className="truncate font-medium text-text">
                      {server.name}
                    </p>
                    <p className="text-xs text-text-muted">
                      {isOwner ? "Owner · Enter server" : "Enter server"}
                    </p>
                  </div>
                  <span className="relative text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text">
                    →
                  </span>
                </Link>

                {isOwner && (
                  <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
                    <button
                      type="button"
                      title="Server options"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        setMenuId((id) =>
                          id === server.id ? null : server.id,
                        );
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-white/10 hover:text-text"
                    >
                      ···
                    </button>
                    {menuId === server.id && (
                      <div
                        ref={menuRef}
                        role="menu"
                        className="hango-anim-pop absolute right-0 top-[calc(100%+4px)] w-40 overflow-hidden rounded-xl border border-border-strong bg-[#161412] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full px-3 py-2 text-left text-sm text-text hover:bg-white/[0.06]"
                          onClick={() => {
                            setRenaming(server);
                            setRenameValue(server.name);
                            setMenuId(null);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
                          onClick={() => void handleDelete(server)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hango-server-card flex items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-transparent p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-text-muted hover:bg-[#141312]/60"
            style={{ animationDelay: `${80 + servers.length * 60}ms` }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-xl text-text-muted ring-1 ring-border-strong">
              +
            </span>
            <div>
              <p className="font-medium text-text">Add a server</p>
              <p className="text-xs text-text-muted">Create or join with invite</p>
            </div>
          </button>
        </div>

        {servers.length === 0 && (
          <p className="mt-8 text-sm text-text-secondary">
            No servers yet — create one or join with an invite code.
          </p>
        )}
      </main>

      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={(e) => void handleRename(e)}
            className="w-full max-w-sm rounded-2xl border border-border-strong bg-[#141312] p-5 shadow-xl"
          >
            <h2 className="text-base font-semibold text-text">Rename server</h2>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border-strong bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-text-muted"
              maxLength={80}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="rounded-lg px-3 py-2 text-sm text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !renameValue.trim()}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      <ServerActionsModal
        open={open}
        onClose={() => setOpen(false)}
        onJoined={(serverId) => {
          enterServerNow(serverId);
        }}
      />
    </div>
  );
}
