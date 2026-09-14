# Simple Video Call

A minimal room-based video calling app: peer-to-peer WebRTC video/audio, with
Supabase Realtime (Presence + Broadcast) doing the signaling and a couple
of Supabase tables logging which rooms get used. It's a pure static site
(no backend server/process to run), deployed on Vercel's free tier.

## How it works

- Open the app, type a room name, and share the invite link with whoever you're calling.
- Anyone who opens the same room link joins the same call.
- Video/audio streams directly between browsers (WebRTC, mesh topology — good
  for 2–4 people in a room). Supabase Realtime only relays the small
  handshake messages (offer/answer/ICE candidates); actual media never
  touches Supabase or Vercel.
- Every join/leave is logged to two small Postgres tables (rooms,
  room_events) via Supabase — purely a lightweight usage log, the call
  itself doesn't depend on the database.

## Project structure

- vercel.json — tells Vercel the static files live in public/
- supabase/schema.sql — rooms + room_events tables, RLS policies
- public/index.html — join screen + call screen
- public/style.css
- public/config.js — Supabase URL + publishable key
- public/client.js — getUserMedia, RTCPeerConnection mesh, Supabase Realtime signaling + DB logging

## Local testing

No install needed — just serve the public/ folder over localhost so
getUserMedia is allowed:

    npx serve public

Open the given http://localhost URL in two tabs and join the same room.

## Notes & limitations

- Mesh topology: every participant connects directly to every other
  participant. Simple, no media server needed, but doesn't scale much past
  4–5 people.
- STUN only, no TURN: uses Google's public STUN servers for NAT traversal.
  Some strict corporate/mobile networks may block peer-to-peer connections
  entirely and would need a TURN server to relay media in that case.
- No auth / open RLS policies: schema.sql uses permissive policies so the
  anon/publishable key can read/write freely — fine for a personal/demo
  project with no user accounts.
