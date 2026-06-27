const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { initGameState, playCard } = require('../game/engine');

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getBestDeck(conn, userId) {
  const [cards] = await conn.query(
    `SELECT uc.card_id FROM user_cards uc JOIN cards c ON c.id=uc.card_id
     WHERE uc.user_id=? ORDER BY FIELD(c.rarity,'champion','legend','epic','rare','common'), c.attack DESC LIMIT 30`,
    [userId]
  );
  if (cards.length >= 30) return cards.map(r => r.card_id);
  const [fill] = await conn.query('SELECT id as card_id FROM cards WHERE is_collectible=1 ORDER BY RAND() LIMIT 30');
  return fill.map(r => r.card_id);
}

async function aiAutoPlay(state, allCards) {
  const aiPlayer = state.players['AI'];
  if (!aiPlayer || !aiPlayer.hand.length) return null;
  const handCards = allCards.filter(c => aiPlayer.hand.includes(Number(c.id)));
  if (!handCards.length) return null;
  const best = handCards.sort((a, b) => (b.attack + b.speed) - (a.attack + a.speed))[0];
  return playCard(state, 'AI', Number(best.id), allCards);
}

async function updateMatchScores(conn, matchId, state, p1Id, p2Id) {
  const qs = (pid, q) => state.players[pid]?.quarterScores[q] ?? 0;
  await conn.query(
    `UPDATE matches SET game_state=?,q1_p1=?,q1_p2=?,q2_p1=?,q2_p2=?,q3_p1=?,q3_p2=?,q4_p1=?,q4_p2=? WHERE id=?`,
    [JSON.stringify(state),
     qs(p1Id,0), qs(p2Id,0), qs(p1Id,1), qs(p2Id,1),
     qs(p1Id,2), qs(p2Id,2), qs(p1Id,3), qs(p2Id,3),
     matchId]
  );
}

async function finaliseMatch(conn, matchId, winnerId, loserId) {
  await conn.query('UPDATE matches SET status="completed", winner_id=?, ended_at=NOW() WHERE id=?', [winnerId, matchId]);
  if (winnerId) {
    await conn.query('UPDATE users SET wins=wins+1, elo=elo+25, coins=coins+50 WHERE id=?', [winnerId]);
    if (loserId) await conn.query('UPDATE users SET losses=losses+1, elo=GREATEST(0,elo-25), coins=coins+10 WHERE id=?', [loserId]);
  }
  await conn.query(
    `UPDATE users SET rank=CASE
       WHEN elo>=2000 THEN 'Champion' WHEN elo>=1600 THEN 'Diamond'
       WHEN elo>=1300 THEN 'Platinum' WHEN elo>=1000 THEN 'Gold'
       WHEN elo>=700  THEN 'Silver'   WHEN elo>=400  THEN 'Bronze'
       ELSE 'Rookie' END
     WHERE id IN (?,?)`, [winnerId || 0, loserId || 0]
  );
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/matches
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.id, m.status, m.winner_id, m.is_ai_match, m.created_at, m.ended_at,
            u1.username AS player1, u2.username AS player2,
            m.q1_p1, m.q1_p2, m.q2_p1, m.q2_p2, m.q3_p1, m.q3_p2, m.q4_p1, m.q4_p2
     FROM matches m
     JOIN users u1 ON u1.id = m.player1_id
     LEFT JOIN users u2 ON u2.id = m.player2_id
     WHERE m.player1_id=? OR m.player2_id=?
     ORDER BY m.created_at DESC LIMIT 20`,
    [req.user.id, req.user.id]
  );
  res.json(rows);
});

// GET /api/matches/:id
router.get('/:id', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.*, u1.username AS player1, u2.username AS player2
     FROM matches m
     JOIN users u1 ON u1.id = m.player1_id
     LEFT JOIN users u2 ON u2.id = m.player2_id
     WHERE m.id=? AND (m.player1_id=? OR m.player2_id=? OR m.is_ai_match=1)`,
    [req.params.id, req.user.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Match not found' });

  const match = rows[0];
  if (match.game_state) {
    const state = JSON.parse(match.game_state);
    // Hide opponent hand cards (not in AI matches)
    if (!match.is_ai_match) {
      const opId = String(match.player1_id) === String(req.user.id)
        ? String(match.player2_id) : String(match.player1_id);
      if (state.players[opId]) {
        state.players[opId] = { ...state.players[opId], hand: state.players[opId].hand.length, deck: undefined };
      }
    }
    match.game_state = state;
  }
  res.json(match);
});

// POST /api/matches/vs-ai — start an instant AI match
router.post('/vs-ai', requireAuth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const p1Cards = await getBestDeck(conn, req.user.id);
    const [aiRaw] = await conn.query('SELECT id as card_id FROM cards WHERE is_collectible=1 ORDER BY RAND() LIMIT 30');
    const aiCards = aiRaw.map(r => r.card_id);

    const matchId = uuidv4();
    const gameState = initGameState(req.user.id, 'AI', p1Cards, aiCards);

    await conn.query(
      'INSERT INTO matches (id,player1_id,is_ai_match,status,game_state,started_at) VALUES (?,?,1,"active",?,NOW())',
      [matchId, req.user.id, JSON.stringify(gameState)]
    );
    res.json({ matchId, gameState });
  } finally {
    conn.release();
  }
});

// POST /api/matches/join-queue — matchmaking
router.post('/join-queue', requireAuth, async (req, res) => {
  const { deckId } = req.body;
  if (!deckId) return res.status(400).json({ error: 'deckId required' });

  const [decks] = await db.query(
    `SELECT d.id FROM decks d JOIN deck_cards dc ON dc.deck_id=d.id
     WHERE d.id=? AND d.user_id=? GROUP BY d.id HAVING COUNT(dc.id)=30`,
    [deckId, req.user.id]
  );
  if (!decks.length) return res.status(400).json({ error: 'Deck needs exactly 30 cards' });

  const [users] = await db.query('SELECT elo FROM users WHERE id=?', [req.user.id]);
  const elo = users[0]?.elo || 1000;

  await db.query(
    'INSERT INTO matchmaking_queue (user_id,deck_id,elo) VALUES (?,?,?) ON DUPLICATE KEY UPDATE deck_id=?,elo=?,joined_at=NOW()',
    [req.user.id, deckId, elo, deckId, elo]
  );

  const [opponents] = await db.query(
    'SELECT * FROM matchmaking_queue WHERE user_id!=? AND ABS(elo-?)<=300 ORDER BY joined_at ASC LIMIT 1',
    [req.user.id, elo]
  );
  if (!opponents.length) return res.json({ status: 'queued' });

  const opp = opponents[0];
  const matchId = uuidv4();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM matchmaking_queue WHERE user_id IN (?,?)', [req.user.id, opp.user_id]);
    const [d1] = await conn.query('SELECT card_id FROM deck_cards WHERE deck_id=?', [deckId]);
    const [d2] = await conn.query('SELECT card_id FROM deck_cards WHERE deck_id=?', [opp.deck_id]);
    const gs = initGameState(req.user.id, opp.user_id, d1.map(r => r.card_id), d2.map(r => r.card_id));
    await conn.query(
      'INSERT INTO matches (id,player1_id,player2_id,deck1_id,deck2_id,status,game_state,started_at) VALUES (?,?,?,?,?,"active",?,NOW())',
      [matchId, req.user.id, opp.user_id, deckId, opp.deck_id, JSON.stringify(gs)]
    );
    await conn.commit();
    res.json({ status: 'matched', matchId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// DELETE /api/matches/leave-queue
router.delete('/leave-queue', requireAuth, async (req, res) => {
  await db.query('DELETE FROM matchmaking_queue WHERE user_id=?', [req.user.id]);
  res.json({ message: 'Left queue' });
});

// POST /api/matches/:id/action
router.post('/:id/action', requireAuth, async (req, res) => {
  const { action, cardId } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM matches WHERE id=? AND status="active" AND (player1_id=? OR player2_id=?) FOR UPDATE',
      [req.params.id, req.user.id, req.user.id]
    );
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Active match not found' }); }

    const match = rows[0];
    const state = JSON.parse(match.game_state);
    const isAI = !!match.is_ai_match;

    if (String(state.currentTurn) !== String(req.user.id)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Not your turn' });
    }

    const [allCards] = await conn.query(
      isAI
        ? 'SELECT * FROM cards WHERE is_collectible=1'
        : 'SELECT * FROM cards WHERE id IN (SELECT card_id FROM deck_cards WHERE deck_id IN (?,?))',
      isAI ? [] : [match.deck1_id, match.deck2_id]
    );

    if (action !== 'play_card' || !cardId) {
      await conn.rollback();
      return res.status(400).json({ error: 'play_card action requires cardId' });
    }

    let result = playCard(state, req.user.id, Number(cardId), allCards);
    let aiEvents = [];

    // AI auto-responds immediately after the human's move
    if (isAI && !result.quarterResult && result.state.currentTurn === 'AI') {
      const aiResult = await aiAutoPlay(result.state, allCards);
      if (aiResult) {
        result.state = aiResult.state;
        aiEvents = aiResult.events;
        if (aiResult.quarterResult) result.quarterResult = aiResult.quarterResult;
      }
    }

    const p1Id = String(match.player1_id);
    const p2Id = isAI ? 'AI' : String(match.player2_id);
    await updateMatchScores(conn, req.params.id, result.state, p1Id, p2Id);

    if (result.quarterResult?.type === 'match_end') {
      const winnerStrId = result.quarterResult.winner;
      const winnerId = winnerStrId && winnerStrId !== 'AI' ? Number(winnerStrId) : null;
      const loserId = winnerId ? (winnerId === match.player1_id ? match.player2_id : match.player1_id) : null;
      await finaliseMatch(conn, req.params.id, winnerId, loserId);
    }

    await conn.commit();
    res.json({ events: result.events, aiEvents, quarterResult: result.quarterResult, state: result.state });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = router;
