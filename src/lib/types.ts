export type Profile = {
  id: string;
  display_name: string;
  username?: string | null;
  avatar_url: string | null;
  onboarding_complete?: boolean;
  status?: "online" | "idle" | "dnd" | "invisible";
  custom_status?: string | null;
  bio?: string | null;
  created_at?: string;
};

export type Server = {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
  invite_code?: string;
  invite_expires_at?: string | null;
  invite_max_uses?: number | null;
  invite_uses?: number;
  created_at?: string;
};

export type ServerEmoji = {
  id: string;
  server_id: string;
  name: string;
  url: string;
};

export type Channel = {
  id: string;
  server_id: string;
  name: string;
  position: number;
  kind?: "text" | "voice";
  topic?: string | null;
  created_at?: string;
};

export type MessageAttachment = {
  id: string;
  message_id: string;
  url: string;
  filename: string;
  content_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
};

export type MessageEmbed = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site?: string | null;
};

export type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  thread_id?: string | null;
  embed_json?: MessageEmbed | MessageEmbed[] | null;
  author?: Profile | null;
  reply_to?: Message | null;
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
};

export type MessageReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at?: string;
  requester?: Profile | null;
  addressee?: Profile | null;
};

export type DmChannel = {
  id: string;
  created_at?: string;
  other?: Profile | null;
};

export type DmMessage = {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  author?: Profile | null;
};

export type ServerRole = {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  permissions: number;
};

export type UserStatus = NonNullable<Profile["status"]>;

export type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
};
