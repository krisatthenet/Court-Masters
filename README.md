# Court Masters

Card strategy game powered by basketball rules. Built with Node.js, Express, MySQL, and Socket.io.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| API | Express.js |
| Real-time | Socket.io |
| Database | MySQL (mysql2 pool) |
| Auth | JWT (access + refresh tokens) |
| Frontend | Plain HTML + Tailwind CSS (CDN) |

---

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register + receive starter card pack |
| POST | `/api/auth/login` | — | Login → access + refresh tokens |
| POST | `/api/auth/refresh` | — | Rotate access token |
| POST | `/api/auth/logout` | — | Invalidate refresh token |
| GET | `/api/users/me` | ✓ | Own profile |
| GET | `/api/users/me/collection` | ✓ | All cards you own |
| GET | `/api/users/me/stats` | ✓ | Win rate, ELO, match count |
| GET | `/api/users/:username` | — | Public profile |
| GET | `/api/cards` | — | Full card catalog (filter: rarity, position, search) |
| POST | `/api/cards/open-pack` | ✓ | Spend 100 coins → 5 cards |
| GET | `/api/decks` | ✓ | Your decks |
| POST | `/api/decks` | ✓ | Create deck (requires exactly 30 card IDs you own) |
| PUT | `/api/decks/:id` | ✓ | Update deck |
| DELETE | `/api/decks/:id` | ✓ | Delete deck |
| POST | `/api/decks/:id/activate` | ✓ | Set active deck for matchmaking |
| POST | `/api/matches/join-queue` | ✓ | Enter matchmaking (ELO ±300) |
| DELETE | `/api/matches/leave-queue` | ✓ | Leave queue |
| POST | `/api/matches/:id/action` | ✓ | Submit a play (`play_card`) |
| GET | `/api/matches` | ✓ | Match history (last 20) |
| GET | `/api/matches/:id` | ✓ | Match state (opponent hand is hidden) |
| GET | `/api/leaderboard` | — | Top players by ELO |
| GET | `/api/leaderboard/rank/:userId` | — | A player's leaderboard position |
| GET | `/api/health` | — | Health check |

**Socket.io events** (connect with `{ auth: { token } }`):

| Emit | Receive | Description |
|---|---|---|
| `find_match { deckId }` | `queued` / `match_found` | Real-time matchmaking |
| `play_card { matchId, cardId }` | `card_played`, `quarter_end`, `match_end` | In-game actions |
| `rejoin_match { matchId }` | `rejoined` | Reconnect to active match |
| `cancel_matchmaking` | `matchmaking_cancelled` | Leave queue |

---

## Deploy to Hostinger via GitHub

### Prerequisites

- A Hostinger plan that includes **Node.js** hosting (Business Web Hosting or above)
- A **MySQL database** (included in most Hostinger plans)
- Your code pushed to a **GitHub repository** (public or private)

---

### Step 1 — Push the repo to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/court-masters.git
git push -u origin main
```

---

### Step 2 — Create the MySQL database

1. Log in to **hPanel** → **Databases** → **MySQL Databases**
2. Click **Create a new database**
3. Note down:
   - Database name (e.g. `u123456789_court_masters`)
   - Username (e.g. `u123456789_cm_user`)
   - Password (you set this)
   - Host (usually `127.0.0.1` or `localhost`)

---

### Step 3 — Import the database schema

**Option A — phpMyAdmin (easiest)**
1. hPanel → **Databases** → **phpMyAdmin**
2. Select your new database in the left sidebar
3. Click **Import** tab
4. Upload `db/schema.sql` → click **Go**

**Option B — SSH**
```bash
mysql -u YOUR_DB_USER -p YOUR_DB_NAME < db/schema.sql
```

---

### Step 4 — Set up the Node.js application

1. hPanel → **Node.js**
2. Click **Create Application**
3. Fill in:
   - **Node.js version**: `20.x`
   - **Application mode**: Production
   - **Application root**: `/` (or the subdirectory you uploaded to, e.g. `/court-masters`)
   - **Application URL**: your domain or subdomain
   - **Application startup file**: `server.js`
4. Click **Create**

---

### Step 5 — Connect the GitHub repository

1. Inside your Node.js app panel, find the **Git** section
2. Click **Manage** (or the Git icon)
3. Fill in:
   - **Repository URL**: `https://github.com/YOUR_USERNAME/court-masters.git`
     (for a **private repo** use SSH: `git@github.com:YOUR_USERNAME/court-masters.git`)
   - **Branch**: `main`
4. If using a **private repo**:
   - Hostinger will show you an **SSH public key**
   - Go to GitHub → your repo → **Settings** → **Deploy keys** → **Add deploy key**
   - Paste Hostinger's public key, check **Allow read access**, save
5. Click **Pull** to deploy the first time

After pulling, Hostinger will prompt you to run `npm install`. Click the button in hPanel, or run via SSH:
```bash
npm install --omit=dev
```

---

### Step 6 — Set environment variables

In hPanel → Node.js → your app → **Environment Variables**, add each of these:

| Key | Value |
|---|---|
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_USER` | your database username |
| `DB_PASSWORD` | your database password |
| `DB_NAME` | your database name |
| `JWT_SECRET` | a random 64-char string (run: `openssl rand -hex 64`) |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_SECRET` | another random 64-char string |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | `https://yourdomain.com` |

> **Never commit `.env` to git.** The `.gitignore` already excludes it.

---

### Step 7 — Start the application

In hPanel → Node.js → your app → click **Start** (or **Restart** if already running).

Visit your domain — the landing page loads from `public/index.html` and the API is live at `/api/`.

---

### Auto-deploy on every push (optional)

1. In hPanel → Node.js → Git section → enable **Auto-deploy** (or copy the webhook URL)
2. Go to GitHub → your repo → **Settings** → **Webhooks** → **Add webhook**
   - Payload URL: the URL Hostinger gave you
   - Content type: `application/json`
   - Event: **Just the push event**
3. Save — every `git push origin main` now redeploys automatically

---

## Local Development

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/court-masters.git
cd court-masters
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your local MySQL credentials

# 3. Import schema into local MySQL
mysql -u root -p court_masters < db/schema.sql

# 4. Start with hot-reload
npm run dev
# → http://localhost:3000
```

---

## Project Structure

```
court-masters/
├── server.js              # Entry point
├── package.json
├── ecosystem.config.js    # PM2 config
├── .nvmrc                 # Node.js version pin (20)
├── .env.example           # Environment variable template
├── public/
│   └── index.html         # Landing page (served at /)
├── src/
│   ├── config/db.js       # MySQL connection pool
│   ├── middleware/auth.js  # JWT verification
│   ├── routes/            # auth · users · cards · decks · matches · leaderboard
│   └── game/
│       ├── engine.js      # Turn resolution, quarter system, scoring
│       └── socket.js      # Socket.io real-time handlers
└── db/
    └── schema.sql         # All tables + 34 seeded cards
```

---

## Game Rules (Engine)

- **4 quarters**, 6 turns per player per quarter (12 total)
- **Win condition**: win 3 of 4 quarters
- **Card types**: PG · SG · SF · PF · C (player cards), PLAY, TACTIC, HYPE
- **Attack resolution**: card ATK ±2 vs opponent field defense value ±3
- **Scoring**: SPD ≥ 4 → 3 pts, otherwise 2 pts; blocked = 0
- **Momentum**: builds on every score (max 10), required for HYPE cards; carries over at 50% between quarters
- **ELO**: ±25 per match; rank updates automatically (Rookie → Champion)
