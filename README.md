# Hango

Clean, minimal Discord-like chat for the web. Dark mode, Next.js-inspired UI.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — Auth, Postgres, Realtime
- Electron desktop shell planned for a later phase

## Quick start

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Preview UI (no backend):** [/app/demo](http://localhost:3000/app/demo)
- **Realtime chat:** configure Supabase, then sign up

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Copy Project URL + anon key into `.env.local`
3. In the SQL Editor, run in order:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_ensure_lounge.sql` (optional legacy; app no longer auto-joins)
   - `supabase/migrations/003_onboarding_and_invites.sql`
   - `supabase/migrations/004_voice_channels.sql`
4. Auth → Providers → Email: for local testing, turn **off** “Confirm email”
5. Restart `npm run dev`, sign up → complete profile → create or join a server

Open the same channel in two browsers to verify realtime messages.

### Voice & video (LiveKit)

1. Create a free project at [cloud.livekit.io](https://cloud.livekit.io)
2. Copy **WebSocket URL**, **API Key**, and **API Secret** into `.env.local`
3. Run `supabase/migrations/004_voice_channels.sql` (adds **Lounge** voice channels)
4. Restart `npm run dev`
5. Enter a server → open a **Voice** channel (sidebar) → auto-joins the call
6. Use the floating bar: mute, camera, leave. **Leave server** returns to the home menu.

Same voice channel = same room.

### Invite flow

Each server has an **invite code** (shown under the server name). Share it so others can **Join** from the `+` button on the server rail.

## Scripts

| Command       | Description        |
|---------------|--------------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production   |

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing |
| `/login`, `/signup` | Auth |
| `/app` | Redirect into first server/channel |
| `/app/[serverId]/[channelId]` | Chat |
| `/app/demo` | Mock UI shell (no Supabase) |
