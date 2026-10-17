# Chess

A real-time multiplayer chess app with authentication, ELO ranking, game history, and reconnection support.

**Live**: [https://chessfrontend1-2ke2gzaa.b4a.run/](https://chessfrontend1-2ke2gzaa.b4a.run/)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, WebSocket (`ws`), TypeScript |
| ORM | Prisma |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) |
| Logging | Winston |
| Deployment | Back4App (Docker) |

---

## Features

- **Real-time multiplayer** — WebSocket-based move sync between two players
- **Authentication** — Supabase JWT auth; token sent as first WebSocket message (not in URL)
- **Matchmaking** — Players are paired in order; same user cannot play both sides
- **ELO ranking** — Win/loss/draw updates ELO by ±10 per game
- **Game persistence** — Every game and move is saved to PostgreSQL via Prisma
- **Reconnection** — If a player disconnects, the game pauses for 30 seconds; reconnecting restores full board state, move history, and clocks
- **Draw offers** — Either player can offer a draw; opponent can accept or decline
- **Timers** — 10-minute clock per player; clock pauses on disconnect
- **Move sounds** — Web Audio API sounds for move, capture, check, and game over
- **Captured pieces** — Displayed above/below the board
- **Move history** — Scrollable SAN move list in the sidebar
- **Profile page** — Shows username, ELO, wins, draws, losses

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Frontend (React)                │
│  useSocket.ts → WebSocket → sends auth token first  │
│  Game.tsx     → handles all WS message types        │
│  Profile.tsx  → fetches /me over HTTP               │
└────────────────────────┬────────────────────────────┘
                         │ ws:// + http://
┌────────────────────────▼────────────────────────────┐
│              Backend (Node.js, port 3001)           │
│  HTTP server  → GET /me (returns user stats)        │
│  WS server    → attached to same HTTP server        │
│  index.ts     → auth handshake (5s timeout)         │
│  GameManager  → matchmaking, userToGame map         │
│  Game         → move validation, timers, reconnect  │
└────────────────────────┬────────────────────────────┘
                         │ Prisma
┌────────────────────────▼────────────────────────────┐
│           Supabase PostgreSQL                       │
│  User  →  Game  →  Move                             │
└─────────────────────────────────────────────────────┘
```

### WebSocket Message Flow

```
Client                          Server
  │── { type: "auth", token } ──▶│  verify JWT, 5s timeout
  │◀── INIT_GAME ────────────────│  color, time, opponent info
  │── INIT_GAME ─────────────────▶│  join matchmaking queue
  │◀── INIT_GAME ────────────────│  game starts (both players)
  │── MOVE ──────────────────────▶│  validate + broadcast
  │◀── MOVE ─────────────────────│  move echoed to both
  │◀── TIME_UPDATE ──────────────│  every second
  │── DRAW_OFFER ────────────────▶│  forwarded to opponent
  │◀── DRAW_OFFER / DRAW_DECLINE─│
  │◀── GAME_OVER ────────────────│  winner + DB update
  │◀── RECONNECT_GAME ───────────│  fen, moves, times, color
```

---

## Database Schema

```prisma
model User {
  id       String  @id @default(uuid())
  email    String  @unique
  username String  @unique
  elo      Int     @default(1200)
  wins     Int     @default(0)
  losses   Int     @default(0)
  draws    Int     @default(0)
}

model Game {
  id             String      @id @default(uuid())
  whitePlayerId  String
  blackPlayerId  String
  winner         GameResult?  // white | black | draw
  pgn            String?
  eloChangeWhite Int?
  eloChangeBlack Int?
  startedAt      DateTime
  endedAt        DateTime?
  moves          Move[]
}

model Move {
  id         String   @id @default(uuid())
  gameId     String
  moveSan    String
  moveNumber Int
  playedAt   DateTime @default(now())
}
```

---

## Local Development

### Prerequisites

- Node.js 22+
- A Supabase project with the schema migrated

### Backend

```bash
cd backend1
npm install
npx prisma generate
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

### Backend — `backend1/.env`

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:6543/<db>?sslmode=require
DIRECT_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require
```

> Use the Supabase **connection pooler** URL for `DATABASE_URL` (port 6543) and the direct URL for `DIRECT_URL` (used by Prisma migrations).

### Frontend — `frontend/.env`

```env
VITE_WS_URL=ws://localhost:3001
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

---

## Docker

Both services have multi-stage Dockerfiles.

### Backend

```bash
cd backend1
docker build -t chess-backend .
docker run -p 3001:3001 --env-file .env chess-backend
```

Build stages:
1. `builder` — installs all deps, runs `prisma generate`, compiles TypeScript
2. `runner` — installs prod-only deps, copies `dist/` and `generated/`

### Frontend

```bash
cd frontend
docker build \
  --build-arg VITE_WS_URL=wss://chessbackend-0ahgkusj.b4a.run \
  --build-arg VITE_API_URL=https://chessbackend-0ahgkusj.b4a.run \
  --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon-key> \
  -t chess-frontend .
```

> Vite env vars are baked in at build time — they must be passed as `--build-arg`.

Served by nginx with SPA routing (`try_files $uri $uri/ /index.html`).

---

## Deployment (Back4App)

| Service | URL |
|---|---|
| Frontend | https://chessfrontend1-2ke2gzaa.b4a.run |
| Backend | https://chessbackend-0ahgkusj.b4a.run |

Back4App terminates TLS, so use `wss://` and `https://` in production — no port needed in the URL.

---

## Project Structure

```
Chess/
├── backend1/
│   ├── src/
│   │   ├── index.ts        # HTTP + WS server, auth handshake
│   │   ├── GameManager.ts  # matchmaking, userToGame map
│   │   ├── Game.ts         # game logic, timers, reconnect, DB writes
│   │   ├── auth.ts         # Supabase JWT verification
│   │   ├── db.ts           # singleton PrismaClient
│   │   ├── logger.ts       # Winston logger
│   │   └── messages.ts     # WS message type constants
│   ├── prisma/
│   │   └── schema.prisma
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── screens/
    │   │   ├── Game.tsx     # main game UI + WS message handling
    │   │   ├── Landing.tsx  # home screen
    │   │   └── Profile.tsx  # stats page
    │   ├── hooks/
    │   │   └── useSocket.ts # WS connection with exponential backoff
    │   ├── components/
    │   │   └── ChessBoard.tsx
    │   └── pages/
    │       └── Login.tsx
    └── Dockerfile
```
