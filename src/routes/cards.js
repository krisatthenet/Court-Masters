const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../config/db');

const router = Router();

const PACK_COST = 100;
const PACK_DISTRIBUTION = [
  { rarity: 'common', count: 3 },
  { rarity: 'rare',   count: 1 },
];
function bonusRarity() {
  const r = Math.random() * 100;
  if (r < 1)  return 'champion';
  if (r < 5)  return 'legend';
  if (r < 20) return 'epic';
  if (r < 50) return 'rare';
  return 'common';
}

// GET /api/cards — full catalog with optional filters
router.get('/', async (req, res) => {
  const { rarity, position, search } = req.query;
  let sql = 'SELECT * FROM cards WHERE is_collectible = 1';
  const params = [];
  if (rarity)   { sql += ' AND rarity = ?';    params.push(rarity); }
  if (position) { sql += ' AND position = ?';  params.push(position); }
  if (search)   { sql += ' AND name LIKE ?';   params.push(`%${search}%`); }
  sql += " ORDER BY FIELD(rarity,'champion','legend','epic','rare','common'), name ASC";
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

// GET /api/cards/:id
router.get('/:id', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM cards WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Card not found' });
  res.json(rows[0]);
});

// POST /api/cards/open-pack — spend 100 coins, get 5 cards
router.post('/open-pack', requireAuth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [users] = await conn.query('SELECT coins FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    if (!users[0] || users[0].coins < PACK_COST) {
      await conn.rollback();
      return res.status(400).json({ error: 'Not enough coins' });
    }
    await conn.query('UPDATE users SET coins = coins - ? WHERE id = ?', [PACK_COST, req.user.id]);

    const draws = [...PACK_DISTRIBUTION, { rarity: bonusRarity(), count: 1 }];
    const pulledIds = [];

    for (const { rarity, count } of draws) {
      const [cards] = await conn.query(
        'SELECT id FROM cards WHERE rarity = ? AND is_collectible = 1 ORDER BY RAND() LIMIT ?',
        [rarity, count]
      );
      for (const c of cards) {
        pulledIds.push(c.id);
        await conn.query(
          'INSERT INTO user_cards (user_id, card_id, quantity) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1',
          [req.user.id, c.id]
        );
      }
    }

    await conn.commit();
    const [full] = await conn.query('SELECT * FROM cards WHERE id IN (?)', [pulledIds]);
    res.json({ cards: full, coinsSpent: PACK_COST });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = router;
