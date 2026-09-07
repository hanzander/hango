"use client";

import { useMemo, type ReactNode } from "react";
import type { PresenceUser } from "@/hooks/useServerPresence";
import type { Profile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";

export type ServerMember = Pick<Profile, "id" | "display_name" | "avatar_url">;

type MembersPanelProps = {
  serverMembers: ServerMember[];
  online: PresenceUser[];
};

type Row = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  status: "voice" | "online" | "offline";
};

export function MembersPanel({ serverMembers, online }: MembersPanelProps) {
  const rows = useMemo(() => {
    const presenceById = new Map(online.map((m) => [m.user_id, m]));
    const list: Row[] = serverMembers.map((m) => {
      const p = presenceById.get(m.id);
      return {
        user_id: m.id,
        display_name: p?.display_name || m.display_name,
        avatar_url: p?.avatar_url ?? m.avatar_url,
        status: p?.voice_channel_id
          ? "voice"
          : p
            ? "online"
            : "offline",
      };
    });

    for (const p of online) {
      if (list.some((r) => r.user_id === p.user_id)) continue;
      list.push({
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        status: p.voice_channel_id ? "voice" : "online",
      });
    }

    const rank = { voice: 0, online: 1, offline: 2 } as const;
    list.sort((a, b) => {
      const d = rank[a.status] - rank[b.status];
      if (d !== 0) return d;
      return a.display_name.localeCompare(b.display_name, undefined, {
        sensitivity: "base",
      });
    });
    return list;
  }, [serverMembers, online]);

  const inVoice = rows.filter((r) => r.status === "voice");
  const onlineIdle = rows.filter((r) => r.status === "online");
  const offline = rows.filter((r) => r.status === "offline");

  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col border-l border-border bg-sidebar lg:flex">
      <div className="flex h-12 items-center border-b border-border px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Members — {rows.length}
        </h2>
      </div>
      <div className="hango-scroll flex-1 overflow-y-auto px-2 py-3">
        {inVoice.length > 0 && (
          <Section title={`In voice — ${inVoice.length}`} accent>
            {inVoice.map((m) => (
              <MemberRow key={m.user_id} member={m} />
            ))}
          </Section>
        )}

        <Section title={`Online — ${onlineIdle.length}`}>
          {onlineIdle.length === 0 ? (
            <li className="px-2 py-1 text-xs text-text-muted">
              Nobody else online
            </li>
          ) : (
            onlineIdle.map((m) => <MemberRow key={m.user_id} member={m} />)
          )}
        </Section>

        <Section title={`Offline — ${offline.length}`}>
          {offline.length === 0 ? (
            <li className="px-2 py-1 text-xs text-text-muted">None</li>
          ) : (
            offline.map((m) => <MemberRow key={m.user_id} member={m} />)
          )}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <p
        className={
          accent
            ? "mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80"
            : "mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted"
        }
      >
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function MemberRow({ member }: { member: Row }) {
  const dim = member.status === "offline";
  return (
    <li
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${dim ? "opacity-50" : ""}`}
    >
      <div className="relative shrink-0">
        <Avatar
          name={member.display_name}
          src={member.avatar_url}
          size="sm"
        />
        <span
          className={
            member.status === "voice"
              ? "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar"
              : member.status === "online"
                ? "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500/90 ring-2 ring-sidebar"
                : "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-text-muted ring-2 ring-sidebar"
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{member.display_name}</p>
        {member.status === "voice" && (
          <p className="truncate text-[10px] text-emerald-400/80">Voice</p>
        )}
      </div>
    </li>
  );
}
