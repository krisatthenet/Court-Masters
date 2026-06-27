const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../config/db');

const router = Router();

// ─── Pack definitions ────────────────────────────────────────────────────────

const PACK_TYPES = {
  bronze: {
    name: 'Bronze Pack',
    price: 75,
    emoji: '📦',
    gradient: 'from-amber-900 to-yellow-950',
    border: 'border-amber-700/60',
    description: '5 cards · 3 Common + 1 Rare + 1 Bonus',
    draws: [
      { rarity: 'common', n: 3 },
      { rarity: 'rare',   n: 1 },
      { bonus: true,      n: 1 },
    ],
  },
  silver: {
    name: 'Silver Pack',
    price: 200,
    emoji: '🎁',
    gradient: 'from-slate-600 to-slate-900',
    border: 'border-slate-500/60',
    description: '5 cards · 2 Common + 2 Rare + 1 Epic+',
    draws: [
      { rarity: 'common', n: 2 },
      { rarity: 'rare',   n: 2 },
      { minEpic: true,    n: 1 },
    ],
  },
  gold: {
    name: 'Gold Pack',
    price: 450,
    emoji: '✨',
    gradient: 'from-yellow-700 to-amber-950',
    border: 'border-yellow-500/70',
    description: '5 cards · 1 Rare + 2 Epic + 1 Legend + 1 Wildcard',
    draws: [
      { rarity: 'rare',   n: 1 },
      { rarity: 'epic',   n: 2 },
      { rarity: 'legend', n: 1 },
      { wildcard: true,   n: 1 },
    ],
  },
};

function bonusRarity() {
  const r = Math.random() * 100;
  if (r < 1)  return 'champion';
  if (r < 5)  return 'legend';
  if (r < 18) return 'epic';
  if (r < 48) return 'rare';
  return 'common';
}

function wildcardRarity() {
  const r = Math.random() * 100;
  if (r < 5)  return 'champion';
  if (r < 35) return 'legend';
  return 'epic';
}

async function drawPackCards(conn, draws) {
  const ids = [];
  for (const draw of draws) {
    let rarity;
    if      (draw.bonus)    rarity = bonusRarity();
    else if (draw.wildcard) rarity = wildcardRarity();
    else if (draw.minEpic)  rarity = ['epic','epic','epic','legend','champion'][Math.floor(Math.random()*5)] || 'epic';
    else                    rarity = draw.rarity;

    const [cards] = await conn.query(
      'SELECT id FROM cards WHERE rarity=? AND is_collectible=1 ORDER BY RAND() LIMIT ?',
      [rarity, draw.n]
    );
    cards.forEach(c => ids.push(c.id));
  }
  return ids;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/shop/packs — catalog of buyable packs
router.get('/packs', (_req, res) => {
  res.json(Object.entries(PACK_TYPES).map(([type, p]) => ({
    type, name: p.name, price: p.price, emoji: p.emoji,
    gradient: p.gradient, border: p.border, description: p.description,
  })));
});

// GET /api/shop/inventory — user's unopened packs
router.get('/inventory', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, pack_type, created_at FROM user_packs WHERE user_id=? AND opened=0 ORDER BY created_at ASC',
    [req.user.id]
  );
  res.json(rows.map(r => ({
    id: r.id, pack_type: r.pack_type, created_at: r.created_at,
    ...Object.fromEntries(Object.entries(PACK_TYPES[r.pack_type] || {}).filter(([k]) => k !== 'draws')),
  })));
});

// POST /api/shop/buy — purchase a pack with coins
router.post('/buy', requireAuth, async (req, res) => {
  const { packType } = req.body;
  const pack = PACK_TYPES[packType];
  if (!pack) return res.status(400).json({ error: 'Invalid pack type' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.query('SELECT coins FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const coins = users[0]?.coins ?? 0;
    if (coins < pack.price) {
      await conn.rollback();
      return res.status(400).json({ error: `Not enough coins — need ${pack.price}, you have ${coins}` });
    }
    await conn.query('UPDATE users SET coins=coins-? WHERE id=?', [pack.price, req.user.id]);
    const [result] = await conn.query('INSERT INTO user_packs (user_id, pack_type) VALUES (?,?)', [req.user.id, packType]);
    await conn.commit();
    res.json({ packId: result.insertId, coinsSpent: pack.price, coinsRemaining: coins - pack.price });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/shop/open/:packId — open a pack and receive cards
router.post('/open/:packId', requireAuth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [packs] = await conn.query(
      'SELECT * FROM user_packs WHERE id=? AND user_id=? AND opened=0 FOR UPDATE',
      [req.params.packId, req.user.id]
    );
    if (!packs.length) { await conn.rollback(); return res.status(404).json({ error: 'Pack not found or already opened' }); }

    const packDef = PACK_TYPES[packs[0].pack_type];
    if (!packDef) { await conn.rollback(); return res.status(400).json({ error: 'Unknown pack type' }); }

    const cardIds = await drawPackCards(conn, packDef.draws);
    for (const cardId of cardIds) {
      await conn.query(
        'INSERT INTO user_cards (user_id, card_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1',
        [req.user.id, cardId]
      );
    }
    await conn.query('UPDATE user_packs SET opened=1 WHERE id=?', [packs[0].id]);
    await conn.commit();

    const [fullCards] = cardIds.length
      ? await conn.query('SELECT * FROM cards WHERE id IN (?)', [cardIds])
      : [[]];
    res.json({ cards: fullCards, packType: packs[0].pack_type });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = router;
module.exports.PACK_TYPES = PACK_TYPES;
