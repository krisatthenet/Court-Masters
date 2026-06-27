const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { initGameState } = require('../game/engine');
const db = require('../config/db');

const router = Router();

// GET /api/friends — list accepted friends + pending requests
router.get('/', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const [rows] = await db.query(
    `SELECT u.id, u.username, u.elo, u.rank, u.avatar,
            IF(f.requester_id = ?, 'sent', 'received') AS direction,
            f.status, f.id AS friendship_id
     FROM friendships f
     JOIN users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
     WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status != 'declined'
     ORDER BY f.status ASC, u.username ASC`,
    [uid, uid, uid, uid]
  );
  res.json(rows);
});

// POST /api/friends/request — send by username
router.post('/request', requireAuth, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  const [targets] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
  if (!targets.length) return res.status(404).json({ error: 'User not found' });

  const targetId = targets[0].id;
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });

  const [existing] = await db.query(
    'SELECT id, status FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)',
    [req.user.id, targetId, targetId, req.user.id]
  );
  if (existing.length && existing[0].status !== 'declined') {
    return res.status(409).json({ error: 'Friend request already exists' });
  }
  if (existing.length) {
    await db.query('UPDATE friendships SET status="pending", requester_id=?, addressee_id=? WHERE id=?',
      [req.user.id, targetId, existing[0].id]);
  } else {
    await db.query('INSERT INTO friendships (requester_id, addressee_id) VALUES (?,?)', [req.user.id, targetId]);
  }
  res.json({ message: 'Friend request sent' });
});

// POST /api/friends/:id/accept
router.post('/:id/accept', requireAuth, async (req, res) => {
  const [r] = await db.query(
    'UPDATE friendships SET status="accepted" WHERE id=? AND addressee_id=? AND status="pending"',
    [req.params.id, req.user.id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'Request not found' });
  res.json({ message: 'Friend added' });
});

// POST /api/friends/:id/decline
router.post('/:id/decline', requireAuth, async (req, res) => {
  await db.query('UPDATE friendships SET status="declined" WHERE id=? AND addressee_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Declined' });
});

// DELETE /api/friends/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await db.query(
    'DELETE FROM friendships WHERE id=? AND (requester_id=? OR addressee_id=?)',
    [req.params.id, req.user.id, req.user.id]
  );
  res.json({ message: 'Removed' });
});

// GET /api/friends/challenges — pending incoming challenges
router.get('/challenges', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.*, u.username AS challenger_name, u.avatar AS challenger_avatar
     FROM challenges c JOIN users u ON u.id = c.challenger_id
     WHERE c.challenged_id=? AND c.status='pending'`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/friends/challenge — challenge a friend
router.post('/challenge', requireAuth, async (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId required' });

  const [friendship] = await db.query(
    `SELECT id FROM friendships WHERE status='accepted'
     AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))`,
    [req.user.id, friendId, friendId, req.user.id]
  );
  if (!friendship.length) return res.status(400).json({ error: 'Not friends' });

  await db.query(
    'UPDATE challenges SET status="expired" WHERE challenger_id=? AND challenged_id=? AND status="pending"',
    [req.user.id, friendId]
  );
  const [result] = await db.query(
    'INSERT INTO challenges (challenger_id, challenged_id) VALUES (?,?)',
    [req.user.id, friendId]
  );
  res.json({ id: result.insertId, message: 'Challenge sent' });
});

// POST /api/friends/challenge/:id/accept
router.post('/challenge/:id/accept', requireAuth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM challenges WHERE id=? AND challenged_id=? AND status="pending" FOR UPDATE',
      [req.params.id, req.user.id]
    );
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Challenge not found' }); }
    const challenge = rows[0];

    const getBestCards = async (userId) => {
      const [cards] = await conn.query(
        `SELECT uc.card_id FROM user_cards uc JOIN cards c ON c.id=uc.card_id
         WHERE uc.user_id=? ORDER BY FIELD(c.rarity,'champion','legend','epic','rare','common'), c.attack DESC LIMIT 30`,
        [userId]
      );
      if (cards.length >= 30) return cards.map(r => r.card_id);
      const [fill] = await conn.query('SELECT id as card_id FROM cards WHERE is_collectible=1 ORDER BY RAND() LIMIT 30');
      return fill.map(r => r.card_id);
    };

    const [p1Cards, p2Cards] = await Promise.all([
      getBestCards(challenge.challenger_id),
      getBestCards(req.user.id),
    ]);

    const matchId = uuidv4();
    const gameState = initGameState(challenge.challenger_id, req.user.id, p1Cards, p2Cards);

    await conn.query(
      'INSERT INTO matches (id,player1_id,player2_id,status,game_state,started_at) VALUES (?,?,?,"active",?,NOW())',
      [matchId, challenge.challenger_id, req.user.id, JSON.stringify(gameState)]
    );
    await conn.query('UPDATE challenges SET status="accepted", match_id=? WHERE id=?', [matchId, challenge.id]);

    await conn.commit();
    res.json({ matchId, message: 'Match started' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/friends/challenge/:id/decline
router.post('/challenge/:id/decline', requireAuth, async (req, res) => {
  await db.query('UPDATE challenges SET status="declined" WHERE id=? AND challenged_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Declined' });
});

module.exports = router;
