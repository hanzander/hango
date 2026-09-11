"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Friendship, Profile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { HangoLogo } from "@/components/brand/HangoLogo";
import { useToast } from "@/components/ui/Toast";
import { isSupabaseConfigured } from "@/lib/utils";

export function FriendsHome({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const configured = isSupabaseConfigured();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pending, setPending] = useState<Friendship[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("friendships")
      .select(
        "*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)",
      )
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    const rows = (data as Friendship[]) ?? [];
    setFriends(rows.filter((f) => f.status === "accepted"));
    setPending(
      rows.filter((f) => f.status === "pending" && f.addressee_id === userId),
    );
    setLoading(false);
  }, [configured, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function sendRequest(e: FormEvent) {
    e.preventDefault();
    const username = query.trim().replace(/^@/, "");
    if (!username) return;
    const supabase = createClient();
    const { data: other } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    if (!other) {
      toast("User not found", "danger");
      return;
    }
    if ((other as Profile).id === userId) {
      toast("That’s you", "danger");
      return;
    }
    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: (other as Profile).id,
      status: "pending",
    });
    if (error) {
      toast(error.message, "danger");
      return;
    }
    toast("Friend request sent", "success");
    setQuery("");
    void reload();
  }

  async function accept(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", id);
    if (error) toast(error.message, "danger");
    else {
      toast("Friend added", "success");
      void reload();
    }
  }

  async function openDm(otherId: string) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("open_dm", {
      p_other_user: otherId,
    });
    if (error) {
      toast(
        /open_dm|function/i.test(error.message)
          ? "Run migration 006 for DMs"
          : error.message,
        "danger",
      );
      return;
    }
    const channel = Array.isArray(data) ? data[0] : data;
    if (channel?.id) router.push(`/app/dm/${channel.id}`);
  }

  function otherOf(f: Friendship): Profile | null {
    if (f.requester_id === userId) return (f.addressee as Profile) ?? null;
    return (f.requester as Profile) ?? null;
  }

  return (
    <div className="relative min-h-dvh bg-bg text-text">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-6">
        <Link href="/app" className="transition-opacity hover:opacity-80">
          <HangoLogo size={28} />
        </Link>
        <p className="text-sm text-text-muted">{displayName}</p>
      </header>
      <main className="mx-auto w-full max-w-2xl px-6 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">Friends</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Add by username, accept requests, open DMs.
        </p>

        <form onSubmit={(e) => void sendRequest(e)} className="mt-6 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username"
            className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            Add
          </button>
        </form>

        {loading ? (
          <p className="mt-8 text-sm text-text-muted">Loading…</p>
        ) : (
          <>
            {pending.length > 0 && (
              <section className="mt-8">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Pending
                </h2>
                <ul className="mt-2 space-y-1">
                  {pending.map((f) => {
                    const p = otherOf(f);
                    if (!p) return null;
                    return (
                      <li
                        key={f.id}
                        className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <Avatar name={p.display_name} src={p.avatar_url} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {p.display_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => void accept(f.id)}
                          className="rounded-md bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300"
                        >
                          Accept
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                All friends — {friends.length}
              </h2>
              <ul className="mt-2 space-y-1">
                {friends.length === 0 && (
                  <li className="text-sm text-text-muted">No friends yet</li>
                )}
                {friends.map((f) => {
                  const p = otherOf(f);
                  if (!p) return null;
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <Avatar name={p.display_name} src={p.avatar_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{p.display_name}</p>
                        {p.username && (
                          <p className="text-[11px] text-text-muted">
                            @{p.username}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void openDm(p.id)}
                        className="rounded-md border border-border-strong px-2 py-1 text-xs text-text-secondary hover:text-text"
                      >
                        Message
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
