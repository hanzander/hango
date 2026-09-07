"use client";

import { useMemo, type ReactNode } from "react";
import type { PresenceUser } from "@/hooks/useServerPresence";
import type { Profile, ServerRole } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  ContextMenuPortal,
  useContextMenu,
  type ContextMenuItem,
} from "@/components/ui/ContextMenu";

export type ServerMember = Pick<
  Profile,
  "id" | "display_name" | "avatar_url" | "status" | "custom_status" | "bio"
>;

type MembersPanelProps = {
  serverMembers: ServerMember[];
  online: PresenceUser[];
  speakingIds?: string[];
  currentUserId?: string;
  isOwner?: boolean;
  roles?: ServerRole[];
  memberRoleIds?: Record<string, string[]>;
  onOpenProfile?: (userId: string) => void;
  onKick?: (userId: string) => void;
  onTimeout?: (userId: string, minutes: number) => void;
  onAssignRole?: (userId: string, roleId: string) => void;
  onRemoveRole?: (userId: string, roleId: string) => void;
  onMessageUser?: (userId: string) => void;
};

type Row = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  inVoice: boolean;
  status: "online" | "offline";
  roleIds: string[];
};

export function MembersPanel({
  serverMembers,
  online,
  speakingIds = [],
  currentUserId,
  isOwner,
  roles = [],
  memberRoleIds = {},
  onOpenProfile,
  onKick,
  onTimeout,
  onAssignRole,
  onRemoveRole,
  onMessageUser,
}: MembersPanelProps) {
  const speaking = useMemo(() => new Set(speakingIds), [speakingIds]);
  const rolesById = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles],
  );
  const { menu, open, close } = useContextMenu();

  const rows = useMemo(() => {
    const presenceById = new Map(online.map((m) => [m.user_id, m]));
    const list: Row[] = serverMembers.map((m) => {
      const p = presenceById.get(m.id);
      return {
        user_id: m.id,
        display_name: p?.display_name || m.display_name,
        avatar_url: p?.avatar_url ?? m.avatar_url,
        inVoice: Boolean(p?.voice_channel_id),
        status: p ? "online" : "offline",
        roleIds: memberRoleIds[m.id] ?? [],
      };
    });

    for (const p of online) {
      if (list.some((r) => r.user_id === p.user_id)) continue;
      list.push({
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        inVoice: Boolean(p.voice_channel_id),
        status: "online",
        roleIds: memberRoleIds[p.user_id] ?? [],
      });
    }

    list.sort((a, b) => {
      if (a.status !== b.status) return a.status === "online" ? -1 : 1;
      if (a.inVoice !== b.inVoice) return a.inVoice ? -1 : 1;
      return a.display_name.localeCompare(b.display_name, undefined, {
        sensitivity: "base",
      });
    });
    return list;
  }, [serverMembers, online, memberRoleIds]);

  const onlineRows = rows.filter((r) => r.status === "online");
  const offline = rows.filter((r) => r.status === "offline");

  function topRole(m: Row): ServerRole | null {
    let best: ServerRole | null = null;
    for (const id of m.roleIds) {
      const role = rolesById.get(id);
      if (!role) continue;
      if (!best || role.position > best.position) best = role;
    }
    return best;
  }

  function menuFor(m: Row): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      {
        label: "Profile",
        onClick: () => onOpenProfile?.(m.user_id),
      },
    ];
    if (m.user_id !== currentUserId) {
      items.push({
        label: "Message",
        onClick: () => onMessageUser?.(m.user_id),
      });
    }
    if (isOwner && m.user_id !== currentUserId) {
      for (const role of roles) {
        const has = m.roleIds.includes(role.id);
        items.push({
          label: has ? `Remove ${role.name}` : `Give ${role.name}`,
          onClick: () =>
            has
              ? onRemoveRole?.(m.user_id, role.id)
              : onAssignRole?.(m.user_id, role.id),
        });
      }
      items.push({
        label: "Timeout 10m",
        onClick: () => onTimeout?.(m.user_id, 10),
      });
      items.push({
        label: "Kick",
        danger: true,
        onClick: () => onKick?.(m.user_id),
      });
    }
    return items;
  }

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-l border-border bg-sidebar lg:flex">
      <div className="flex h-12 items-center border-b border-border px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Members — {rows.length}
        </h2>
      </div>
      <div className="hango-scroll flex-1 overflow-y-auto px-2 py-3">
        <Section title={`Online — ${onlineRows.length}`}>
          {onlineRows.length === 0 ? (
            <li className="px-2 py-1 text-xs text-text-muted">Nobody online</li>
          ) : (
            onlineRows.map((m, i) => (
              <MemberRow
                key={m.user_id}
                member={m}
                role={topRole(m)}
                index={i}
                speaking={speaking.has(m.user_id)}
                onOpen={() => onOpenProfile?.(m.user_id)}
                onContextMenu={(e) => open(e, menuFor(m))}
              />
            ))
          )}
        </Section>

        <Section title={`Offline — ${offline.length}`}>
          {offline.length === 0 ? (
            <li className="px-2 py-1 text-xs text-text-muted">None</li>
          ) : (
            offline.map((m, i) => (
              <MemberRow
                key={m.user_id}
                member={m}
                role={topRole(m)}
                index={i + onlineRows.length}
                speaking={false}
                onOpen={() => onOpenProfile?.(m.user_id)}
                onContextMenu={(e) => open(e, menuFor(m))}
              />
            ))
          )}
        </Section>
      </div>
      <ContextMenuPortal menu={menu} onClose={close} />
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function MemberRow({
  member,
  role,
  index,
  speaking,
  onOpen,
  onContextMenu,
}: {
  member: Row;
  role: ServerRole | null;
  index: number;
  speaking: boolean;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const dim = member.status === "offline";
  return (
    <li
      className="hango-anim-fade-up"
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={onContextMenu}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition duration-150 hover:bg-bg-hover hover:translate-x-0.5",
          dim && "opacity-50",
        )}
      >
        <div className="relative shrink-0">
          <div
            className={cn(
              "rounded-full transition-[box-shadow] duration-150",
              speaking &&
                "shadow-[0_0_0_2px_rgba(52,211,153,0.95),0_0_12px_rgba(52,211,153,0.55)]",
            )}
          >
            <Avatar
              name={member.display_name}
              src={member.avatar_url}
              size="sm"
            />
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-sidebar",
              member.status === "online" ? "bg-emerald-500/90" : "bg-text-muted",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium transition-colors"
            style={role ? { color: role.color } : undefined}
          >
            <span className={role ? undefined : "text-text"}>
              {member.display_name}
            </span>
          </p>
          {member.inVoice ? (
            <p className="flex items-center gap-1 truncate text-[10px] text-emerald-400/80">
              <VoiceGlyph />
              Voice
            </p>
          ) : role ? (
            <p className="truncate text-[10px] text-text-muted opacity-0 transition group-hover:opacity-100">
              {role.name}
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function VoiceGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" aria-hidden>
      <path
        fill="currentColor"
        d="M8 2a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V4a2 2 0 0 0-2-2Zm-4 6a4 4 0 0 0 8 0h1.25a5.25 5.25 0 0 1-4.5 5.15V15h-1.5v-1.85A5.25 5.25 0 0 1 2.75 8H4Z"
      />
    </svg>
  );
}
