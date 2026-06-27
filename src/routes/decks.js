const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const db = require('../config/db');

const router = Router();

// GET /api/decks
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT d.*, COUNT(dc.id) as card_count
     FROM decks d LEFT JOIN deck_cards dc ON dc.deck_id = d.id
     WHERE d.user_id = ? GROUP BY d.id ORDER BY d.updated_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/decks/:id — with full card list
router.get('/:id', requireAuth, async (req, res) => {
  const [decks] = await db.query(
    'SELECT * FROM decks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
  );
  if (!decks.length) return res.status(404).json({ error: 'Deck not found' });
  const [cards] = await db.query(
    `SELECT c.* FROM deck_cards dc JOIN cards c ON c.id = dc.card_id WHERE dc.deck_id = ?`,
    [req.params.id]
  );
  res.json({ ...decks[0], cards });
});

// POST /api/decks — create with exactly 30 card IDs
router.post('/', requireAuth, [
  body('name').trim().isLength({ min: 1, max: 50 }),
  body('cardIds').isArray({ min: 30, max: 30 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, cardIds } = req.body;
  const conn = await db.getConnection();
  try {
    const [owned] = await conn.query(
      'SELECT card_id FROM user_cards WHERE user_id = ? AND card_id IN (?)',
      [req.user.id, cardIds]
    );
    const ownedSet = new Set(owned.map(r => r.card_id));
    const missing = cardIds.filter(id => !ownedSet.has(id));
    if (missing.length) return res.status(400).json({ error: 'You do not own some cards', missing });

    const [result] = await conn.query('INSERT INTO decks (user_id, name) VALUES (?, ?)', [req.user.id, name]);
    const deckId = result.insertId;

    await conn.query(
      'INSERT INTO deck_cards (deck_id, card_id) VALUES ' + cardIds.map(() => '(?,?)').join(','),
      cardIds.flatMap(id => [deckId, id])
    );
    res.status(201).json({ id: deckId, name, cardCount: 30 });
  } finally {
    conn.release();
  }
});

// PUT /api/decks/:id — update name and/or cards
router.put('/:id', requireAuth, [
  body('name').optional().trim().isLength({ min: 1, max: 50 }),
  body('cardIds').optional().isArray({ min: 30, max: 30 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const [decks] = await db.query('SELECT id FROM decks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!decks.length) return res.status(404).json({ error: 'Deck not found' });

  const conn = await db.getConnection();
  try {
    if (req.body.name) await conn.query('UPDATE decks SET name = ? WHERE id = ?', [req.body.name, req.params.id]);
    if (req.body.cardIds) {
      await conn.query('DELETE FROM deck_cards WHERE deck_id = ?', [req.params.id]);
      await conn.query(
        'INSERT INTO deck_cards (deck_id, card_id) VALUES ' + req.body.cardIds.map(() => '(?,?)').join(','),
        req.body.cardIds.flatMap(id => [req.params.id, id])
      );
    }
    res.json({ message: 'Deck updated' });
  } finally {
    conn.release();
  }
});

// DELETE /api/decks/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const [r] = await db.query('DELETE FROM decks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Deck not found' });
  res.json({ message: 'Deck deleted' });
});

// POST /api/decks/:id/activate — set as the active deck for matchmaking
router.post('/:id/activate', requireAuth, async (req, res) => {
  await db.query('UPDATE decks SET is_active = 0 WHERE user_id = ?', [req.user.id]);
  const [r] = await db.query('UPDATE decks SET is_active = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Deck not found' });
  res.json({ message: 'Active deck set' });
});

module.exports = router;
