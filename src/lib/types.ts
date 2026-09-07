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
  created_at?: string;
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

export type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
  author?: Profile | null;
  reply_to?: Message | null;
  reactions?: MessageReaction[];
};

export type MessageReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
};

export type UserStatus = NonNullable<Profile["status"]>;
