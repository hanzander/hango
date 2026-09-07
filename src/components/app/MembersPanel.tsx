"use client";

import type { PresenceUser } from "@/hooks/useServerPresence";
import { Avatar } from "@/components/ui/Avatar";

type MembersPanelProps = {
  members: PresenceUser[];
};

export function MembersPanel({ members }: MembersPanelProps) {
  const inVoice = members.filter((m) => m.voice_channel_id);
  const idle = members.filter((m) => !m.voice_channel_id);

  return (
    <aside className="hidden h-full w-56 shrink-0 flex-col border-l border-border bg-sidebar lg:flex">
      <div className="flex h-12 items-center border-b border-border px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Online — {members.length}
        </h2>
      </div>
      <div className="hango-scroll flex-1 overflow-y-auto px-2 py-3">
        {inVoice.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
              In voice
            </p>
            <ul className="space-y-0.5">
              {inVoice.map((m) => (
                <MemberRow key={m.user_id} member={m} voice />
              ))}
            </ul>
          </div>
        )}

        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Online
        </p>
        <ul className="space-y-0.5">
          {idle.map((m) => (
            <MemberRow key={m.user_id} member={m} />
          ))}
          {idle.length === 0 && inVoice.length === 0 && (
            <li className="px-2 text-xs text-text-muted">No one else here yet</li>
          )}
        </ul>
      </div>
    </aside>
  );
}

function MemberRow({
  member,
  voice,
}: {
  member: PresenceUser;
  voice?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5">
      <div className="relative shrink-0">
        <Avatar
          name={member.display_name}
          src={member.avatar_url}
          size="sm"
        />
        <span
          className={
            voice
              ? "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar"
              : "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500/90 ring-2 ring-sidebar"
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{member.display_name}</p>
        {voice && (
          <p className="truncate text-[10px] text-emerald-400/80">Voice</p>
        )}
      </div>
    </li>
  );
}
