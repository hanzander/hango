/** Role permission bitflags (stored on server_roles.permissions). */
export const ROLE_PERMS = {
  MANAGE_CHANNELS: 1 << 0,
  KICK_MEMBERS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_MESSAGES: 1 << 3,
} as const;

export type RolePermBit = (typeof ROLE_PERMS)[keyof typeof ROLE_PERMS];

export type ServerCapabilities = {
  isOwner: boolean;
  mask: number;
  canKick: boolean;
  canManageChannels: boolean;
  canManageRoles: boolean;
  canManageMessages: boolean;
};

export function permissionMask(
  roleIds: string[],
  roles: { id: string; permissions: number }[],
): number {
  const byId = new Map(roles.map((r) => [r.id, r.permissions ?? 0]));
  let mask = 0;
  for (const id of roleIds) {
    mask |= byId.get(id) ?? 0;
  }
  return mask;
}

export function serverCapabilities(
  isOwner: boolean,
  roleIds: string[],
  roles: { id: string; permissions: number }[],
): ServerCapabilities {
  const mask = isOwner ? ~0 : permissionMask(roleIds, roles);
  return {
    isOwner,
    mask,
    canKick: isOwner || Boolean(mask & ROLE_PERMS.KICK_MEMBERS),
    canManageChannels: isOwner || Boolean(mask & ROLE_PERMS.MANAGE_CHANNELS),
    canManageRoles: isOwner || Boolean(mask & ROLE_PERMS.MANAGE_ROLES),
    canManageMessages: isOwner || Boolean(mask & ROLE_PERMS.MANAGE_MESSAGES),
  };
}

export type NotificationLevel = "all" | "mentions" | "nothing";

export function isNotificationLevel(v: unknown): v is NotificationLevel {
  return v === "all" || v === "mentions" || v === "nothing";
}

/** Channel level overrides server; missing = all. Mute row without level = nothing. */
export function resolveNotificationLevel(
  serverLevel: NotificationLevel | undefined,
  channelLevel: NotificationLevel | undefined,
  serverMuted: boolean,
  channelMuted: boolean,
): NotificationLevel {
  if (channelLevel) return channelLevel;
  if (channelMuted) return "nothing";
  if (serverLevel) return serverLevel;
  if (serverMuted) return "nothing";
  return "all";
}

export function messageMentionsMe(
  content: string,
  displayName: string,
): boolean {
  const c = content.toLowerCase();
  return (
    c.includes(`@${displayName.toLowerCase()}`) ||
    c.includes("@everyone") ||
    c.includes("@here")
  );
}
