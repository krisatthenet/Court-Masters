const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

const router = Router();

function signAccess(user) {
  return jwt.sign(
    { id: user.id, username: user.username, elo: user.elo },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function signRefresh(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

// POST /api/auth/register
router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, email, password } = req.body;
  const conn = await db.getConnection();
  try {
    const [existing] = await conn.query(
      'SELECT id FROM users WHERE email = ? OR username = ?', [email, username]
    );
    if (existing.length) return res.status(409).json({ error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await conn.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    );
    const userId = result.insertId;

    // Give starter pack — 30 cards across rarities (enough for a full deck)
    const [starterCards] = await conn.query(
      `(SELECT id FROM cards WHERE rarity='common' AND is_collectible=1 ORDER BY RAND() LIMIT 18)
       UNION ALL
       (SELECT id FROM cards WHERE rarity='rare'   AND is_collectible=1 ORDER BY RAND() LIMIT 8)
       UNION ALL
       (SELECT id FROM cards WHERE rarity='epic'   AND is_collectible=1 ORDER BY RAND() LIMIT 3)
       UNION ALL
       (SELECT id FROM cards WHERE rarity='legend' AND is_collectible=1 ORDER BY RAND() LIMIT 1)`
    );
    if (starterCards.length) {
      await conn.query(
        'INSERT INTO user_cards (user_id, card_id, quantity) VALUES ' + starterCards.map(() => '(?,?,1)').join(','),
        starterCards.flatMap(c => [userId, c.id])
      );
    }

    const user = { id: userId, username, elo: 1000 };
    const accessToken = signAccess(user);
    const refreshToken = signRefresh(userId);

    await conn.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [userId, refreshToken]
    );

    res.status(201).json({ accessToken, refreshToken, user: { id: userId, username, email } });
  } finally {
    conn.release();
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user.id);

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
    [user.id, refreshToken]
  );

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email, elo: user.elo, rank: user.rank },
  });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const [rows] = await db.query(
      'SELECT id FROM refresh_tokens WHERE token = ? AND expires_at > NOW()', [refreshToken]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid refresh token' });

    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!users.length) return res.status(401).json({ error: 'User not found' });

    res.json({ accessToken: signAccess(users[0]) });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await db.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
  res.json({ message: 'Logged out' });
});

module.exports = router;
