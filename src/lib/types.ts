export type Profile = {
  id: string;
  display_name: string;
  username?: string | null;
  avatar_url: string | null;
  onboarding_complete?: boolean;
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
  created_at?: string;
};

export type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile | null;
};
