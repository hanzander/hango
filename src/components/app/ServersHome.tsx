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
import { cn } from "@/lib/utils";
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [renaming, setRenaming] = useState<Server | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!accountOpen) return;
    function onDoc(e: MouseEvent) {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

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

      <header className="relative z-30 mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-text transition-opacity hover:opacity-80"
        >
          hango
        </Link>
        <div ref={accountRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            title={displayName}
            aria-label={`Account menu for ${displayName}`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Avatar
              name={displayName}
              src={avatarUrl}
              size="sm"
              className="transition ring-1 ring-white/10 hover:ring-white/35"
            />
          </button>
          {accountOpen && (
            <div
              role="menu"
              className="hango-anim-pop absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-xl border border-border-strong bg-[#161412] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
            >
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-sm font-medium text-text">
                  {displayName}
                </p>
                <p className="text-[11px] text-text-muted">Signed in</p>
              </div>
              <Link
                href="/app/friends"
                role="menuitem"
                onClick={() => setAccountOpen(false)}
                className="mx-1 mt-1 flex items-center rounded-lg px-2.5 py-2 text-sm text-text-secondary transition hover:bg-bg-hover hover:text-text"
              >
                Friends
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  setOpen(true);
                }}
                className="mx-1 flex w-[calc(100%-0.5rem)] items-center rounded-lg px-2.5 py-2 text-left text-sm text-text-secondary transition hover:bg-bg-hover hover:text-text"
              >
                Create / join server
              </button>
              {onSignOut && (
                <>
                  <div className="mx-2 my-1 border-t border-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      setSayingBye(true);
                    }}
                    className="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center rounded-lg px-2.5 py-2 text-left text-sm text-rose-400 transition hover:bg-rose-500/10"
                  >
                    Log out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="hango-servers-in relative z-0 mx-auto w-full max-w-3xl px-6 pb-24 pt-6 md:pt-10">
        <p className="text-sm text-text-muted">
          Hey {displayName.split(" ")[0] || displayName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text md:text-4xl">
          Your servers
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-text-secondary">
          Pick a space to{" "}
          <span className="text-text">hango</span>
          <span className="text-text-secondary">ut</span>.
        </p>

        {error && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {servers.map((server, i) => {
            const isOwner = server.owner_id === userId;
            const hasBanner = Boolean(server.banner_url);
            return (
              <div
                key={server.id}
                className={cn(
                  "hango-server-card relative",
                  menuId === server.id && "z-20",
                )}
                style={{ animationDelay: `${30 + i * 35}ms` }}
              >
                <Link
                  href={getServerEnterHref(server.id)}
                  prefetch
                  onClick={(e) => {
                    e.preventDefault();
                    enterServerNow(getServerEnterHref(server.id));
                  }}
                  className="group relative block h-[168px] overflow-hidden rounded-2xl border border-border-strong bg-[#141312] transition-all duration-300 hover:-translate-y-0.5 hover:border-text-muted hover:shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 scale-100 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.04]"
                    style={
                      hasBanner
                        ? { backgroundImage: `url(${server.banner_url})` }
                        : {
                            background:
                              "radial-gradient(ellipse 90% 80% at 20% 0%, rgba(255,196,140,0.18), transparent 55%), linear-gradient(160deg, #2a241f 0%, #141312 70%)",
                          }
                    }
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent"
                  />

                  {server.icon_url && (
                    <span className="absolute left-4 top-4 h-11 w-11 overflow-hidden rounded-2xl ring-2 ring-black/40 shadow-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={server.icon_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </span>
                  )}

                  <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 pr-12">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
                        {server.name}
                      </p>
                      <p className="mt-0.5 text-xs text-white/65">
                        {isOwner ? "Owner · Enter server" : "Enter server"}
                      </p>
                    </div>
                    <span className="mb-0.5 text-white/55 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white">
                      →
                    </span>
                  </div>
                </Link>

                {isOwner && (
                  <div className="absolute right-2 top-2 z-20">
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
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/35 text-white/80 backdrop-blur-sm transition hover:bg-black/55 hover:text-white"
                    >
                      ···
                    </button>
                    {menuId === server.id && (
                      <div
                        ref={menuRef}
                        role="menu"
                        className="hango-anim-pop absolute right-0 top-[calc(100%+4px)] z-50 w-40 overflow-hidden rounded-xl border border-border-strong bg-[#161412] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
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
            className="hango-server-card group flex h-[168px] flex-col items-start justify-end gap-2 rounded-2xl border border-dashed border-border-strong bg-transparent p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-text-muted hover:bg-[#141312]/50"
            style={{ animationDelay: `${80 + servers.length * 60}ms` }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg text-text-muted ring-1 ring-border-strong transition group-hover:text-text group-hover:ring-text-muted">
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
