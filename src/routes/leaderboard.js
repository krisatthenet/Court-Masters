const { Router } = require('express');
const db = require('../config/db');

const router = Router();

// GET /api/leaderboard?page=1&limit=50
router.get('/', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT id, username, elo, rank, wins, losses, avatar,
            ROUND(wins / GREATEST(wins + losses, 1) * 100, 1) as win_rate
     FROM users ORDER BY elo DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  res.json(rows.map((r, i) => ({ ...r, position: offset + i + 1 })));
});

// GET /api/leaderboard/rank/:userId — position of a specific user
router.get('/rank/:userId', async (req, res) => {
  const [rows] = await db.query(
    'SELECT COUNT(*) + 1 as position FROM users WHERE elo > (SELECT elo FROM users WHERE id = ?)',
    [req.params.userId]
  );
  res.json(rows[0]);
});

module.exports = router;
