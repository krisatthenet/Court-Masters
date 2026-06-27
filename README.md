<div align="center">

<img src="public/favicon.svg" width="96" height="96" alt="Court Masters logo"/>

# Court Masters

**Where Basketball Strategy meets Card Game Mastery**

[![Live](https://img.shields.io/badge/status-live-brightgreen?style=flat-square)](https://court-legends.com)
[![Node.js](https://img.shields.io/badge/node-20.x-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/express-4.x-000000?style=flat-square&logo=express)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/mysql-8-4479A1?style=flat-square&logo=mysql&logoColor=white)](https://mysql.com)
[![Socket.io](https://img.shields.io/badge/socket.io-4.x-010101?style=flat-square&logo=socket.io)](https://socket.io)
[![License](https://img.shields.io/github/license/krisatthenet/Court-Masters?style=flat-square)](LICENSE.txt)
[![Last Commit](https://img.shields.io/github/last-commit/krisatthenet/Court-Masters?style=flat-square)](https://github.com/krisatthenet/Court-Masters/commits/master)
[![Stars](https://img.shields.io/github/stars/krisatthenet/Court-Masters?style=flat-square&logo=github)](https://github.com/krisatthenet/Court-Masters/stargazers)

[**▶ Play Now — court-legends.com**](https://court-legends.com) &nbsp;·&nbsp; [Report Bug](https://github.com/krisatthenet/Court-Masters/issues) &nbsp;·&nbsp; [Request Feature](https://github.com/krisatthenet/Court-Masters/issues)

---

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/krisatthenet)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/krisatthenet)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/krisatthenet)

</div>

---

## What is Court Masters?

A card strategy game that fuses **Hearthstone-style deckbuilding** with **NBA basketball rules**. Build a 30-card roster, play through 4 quarters, and outscore your opponent to win. Battle the AI instantly or challenge friends to a direct 1v1.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| API | Express.js |
| Real-time | Socket.io |
| Database | MySQL (mysql2 pool) |
| Auth | JWT (access + refresh tokens) |
| Frontend | Vanilla JS + Tailwind CSS (CDN) |
| Process manager | PM2 |

---

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register → receive 5 free Bronze Packs |
| POST | `/api/auth/login` | — | Login → access + refresh tokens |
| POST | `/api/auth/refresh` | — | Rotate access token |
| POST | `/api/auth/logout` | — | Invalidate refresh token |
| GET | `/api/users/me` | ✓ | Own profile |
| GET | `/api/users/me/collection` | ✓ | Cards you own |
| GET | `/api/users/me/stats` | ✓ | Win rate, ELO, match count |
| GET | `/api/cards` | — | Full card catalog (filter: rarity, position, search) |
| GET | `/api/shop/packs` | — | Available pack types + prices |
| GET | `/api/shop/inventory` | ✓ | Your unopened packs |
| POST | `/api/shop/buy` | ✓ | Buy a pack with coins |
| POST | `/api/shop/open/:id` | ✓ | Open a pack → receive cards |
| GET | `/api/decks` | ✓ | Your decks |
| POST | `/api/decks` | ✓ | Create a 30-card deck |
| PUT | `/api/decks/:id` | ✓ | Update deck |
| DELETE | `/api/decks/:id` | ✓ | Delete deck |
| POST | `/api/matches/vs-ai` | ✓ | Start instant AI match |
| POST | `/api/matches/join-queue` | ✓ | Enter ranked matchmaking |
| POST | `/api/matches/:id/action` | ✓ | Play a card |
| GET | `/api/matches` | ✓ | Match history |
| GET | `/api/friends` | ✓ | Friends list + pending requests |
| POST | `/api/friends/request` | ✓ | Send friend request by username |
| POST | `/api/friends/:id/accept` | ✓ | Accept friend request |
| POST | `/api/friends/challenge` | ✓ | Challenge a friend to a match |
| POST | `/api/friends/challenge/:id/accept` | ✓ | Accept a challenge → match starts |
| GET | `/api/leaderboard` | — | Top players by ELO |
| GET | `/api/health` | — | Health check |

**Socket.io** (connect with `{ auth: { token } }`):

| Emit | Receive | Description |
|---|---|---|
| `find_match { deckId }` | `queued` / `match_found` | Real-time matchmaking |
| `play_card { matchId, cardId }` | `card_played`, `quarter_end`, `match_end` | In-game actions |
| `rejoin_match { matchId }` | `rejoined` | Reconnect to active match |

---

## Game Rules

- **4 quarters**, 6 turns per player per quarter (12 total)
- **Win condition**: win 3 of 4 quarters
- **Card types**: PG · SG · SF · PF · C (player cards), PLAY, TACTIC, HYPE
- **Attack resolution**: card ATK ±2 vs opponent field defense ±3
- **Scoring**: SPD ≥ 4 → 3 pts, otherwise 2 pts; blocked = 0
- **Momentum**: builds on score (max 10), needed for HYPE cards; 50% carries into next quarter
- **ELO**: ±25 per match; rank updates automatically (Rookie → Champion)

---

## Card Shop

| Pack | Price | Contents |
|---|---|---|
| 📦 Bronze | 75 🪙 | 3 Common + 1 Rare + 1 Bonus (weighted) |
| 🎁 Silver | 200 🪙 | 2 Common + 2 Rare + 1 Epic+ |
| ✨ Gold | 450 🪙 | 1 Rare + 2 Epic + 1 Legend + 1 Wildcard |

New players receive **5 free Bronze Packs** on registration.

---

## Deploy to Hostinger via GitHub

### Step 1 — Create MySQL database
hPanel → Databases → MySQL Databases → Create new → note credentials

### Step 2 — Import schema
hPanel → Databases → phpMyAdmin → select DB → Import → `db/schema.sql` → Go
Then import `db/migrations.sql` the same way.

### Step 3 — Set up Node.js app
hPanel → Node.js → set entry point `server.js`, Node 20.x

### Step 4 — Connect GitHub repo
hPanel → Node.js → Git tab → paste `https://github.com/krisatthenet/Court-Masters.git`, branch `master` → Pull → Run npm install

### Step 5 — Environment variables

| Key | Value |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_SOCKET` | `/var/lib/mysql/mysql.sock` |
| `DB_USER` | your db username |
| `DB_PASSWORD` | your db password |
| `DB_NAME` | your db name |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_SECRET` | `openssl rand -hex 64` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | `https://yourdomain.com` |

### Step 6 — Start
hPanel → Node.js → Start

---

## Local Development

```bash
git clone https://github.com/krisatthenet/Court-Masters.git
cd Court-Masters
npm install
cp .env.example .env   # fill in your local DB credentials
mysql -u root -p court_masters < db/schema.sql
mysql -u root -p court_masters < db/migrations.sql
npm run dev            # → http://localhost:3000
```

---

## Project Structure

```
court-masters/
├── server.js              # Entry point
├── package.json
├── ecosystem.config.js    # PM2 config
├── public/
│   ├── index.html         # Full-stack SPA (landing + game client)
│   └── favicon.svg        # LTU flag basketball icon
├── src/
│   ├── config/db.js       # MySQL connection pool (socket + TCP)
│   ├── middleware/auth.js  # JWT verification
│   ├── routes/            # auth · users · cards · decks · matches · friends · shop · leaderboard
│   └── game/
│       ├── engine.js      # Turn resolution, quarters, scoring
│       └── socket.js      # Socket.io real-time handlers
└── db/
    ├── schema.sql         # All tables + 34 seeded cards
    └── migrations.sql     # Incremental schema changes
```

---

<div align="center">

Built with ☕ and 🏀 &nbsp;·&nbsp; [court-legends.com](https://court-legends.com)

</div>
