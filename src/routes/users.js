const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../config/db');

const router = Router();

// GET /api/users/me — own profile
router.get('/me', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, username, email, coins, gems, wins, losses, elo, rank, avatar, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// PATCH /api/users/me — update avatar
router.patch('/me', requireAuth, async (req, res) => {
  const ALLOWED_AVATARS = ['🏀', '⭐', '🦁', '🦅', '🔥', '👑', '💎', '🎯', '⚡', '🧊'];
  const { avatar } = req.body;
  if (avatar && !ALLOWED_AVATARS.includes(avatar)) return res.status(400).json({ error: 'Invalid avatar' });
  await db.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id]);
  res.json({ message: 'Updated' });
});

// GET /api/users/me/collection — user's card collection
router.get('/me/collection', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.*, uc.quantity FROM user_cards uc
     JOIN cards c ON c.id = uc.card_id
     WHERE uc.user_id = ?
     ORDER BY FIELD(c.rarity,'champion','legend','epic','rare','common'), c.name ASC`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/users/me/stats
router.get('/me/stats', requireAuth, async (req, res) => {
  const [user] = await db.query(
    'SELECT wins, losses, elo, rank FROM users WHERE id = ?', [req.user.id]
  );
  const [matches] = await db.query(
    `SELECT COUNT(*) as total,
            SUM(winner_id = ?) as won,
            AVG(TIMESTAMPDIFF(MINUTE, started_at, ended_at)) as avg_match_minutes
     FROM matches WHERE (player1_id = ? OR player2_id = ?) AND status = 'completed'`,
    [req.user.id, req.user.id, req.user.id]
  );
  res.json({ ...user[0], ...matches[0] });
});

// GET /api/users/:username — public profile
router.get('/:username', async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, username, wins, losses, elo, rank, avatar, created_at FROM users WHERE username = ?',
    [req.params.username]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

module.exports = router;
