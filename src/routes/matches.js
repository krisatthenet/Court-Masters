const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { initGameState, playCard } = require('../game/engine');

const router = Router();

// GET /api/matches — match history
router.get('/', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.id, m.status, m.winner_id, m.created_at, m.ended_at,
            u1.username as player1, u2.username as player2,
            m.q1_p1, m.q1_p2, m.q2_p1, m.q2_p2,
            m.q3_p1, m.q3_p2, m.q4_p1, m.q4_p2
     FROM matches m
     JOIN users u1 ON u1.id = m.player1_id
     JOIN users u2 ON u2.id = m.player2_id
     WHERE m.player1_id = ? OR m.player2_id = ?
     ORDER BY m.created_at DESC LIMIT 20`,
    [req.user.id, req.user.id]
  );
  res.json(rows);
});

// GET /api/matches/:id — match state (opponent hand hidden)
router.get('/:id', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT m.*, u1.username as player1, u2.username as player2
     FROM matches m
     JOIN users u1 ON u1.id = m.player1_id
     JOIN users u2 ON u2.id = m.player2_id
     WHERE m.id = ? AND (m.player1_id = ? OR m.player2_id = ?)`,
    [req.params.id, req.user.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Match not found' });

  const match = rows[0];
  if (match.game_state) {
    const state = JSON.parse(match.game_state);
    const opponentId = String(match.player1_id) === String(req.user.id)
      ? String(match.player2_id) : String(match.player1_id);
    if (state.players[opponentId]) {
      state.players[opponentId].handSize = state.players[opponentId].hand.length;
      delete state.players[opponentId].hand;
      delete state.players[opponentId].deck;
    }
    match.game_state = state;
  }
  res.json(match);
});

// POST /api/matches/join-queue — enter matchmaking
router.post('/join-queue', requireAuth, async (req, res) => {
  const { deckId } = req.body;
  if (!deckId) return res.status(400).json({ error: 'deckId required' });

  const [decks] = await db.query(
    `SELECT d.id FROM decks d
     JOIN deck_cards dc ON dc.deck_id = d.id
     WHERE d.id = ? AND d.user_id = ?
     GROUP BY d.id HAVING COUNT(dc.id) = 30`,
    [deckId, req.user.id]
  );
  if (!decks.length) return res.status(400).json({ error: 'Deck not found or must have exactly 30 cards' });

  const [users] = await db.query('SELECT elo FROM users WHERE id = ?', [req.user.id]);
  const elo = users[0]?.elo || 1000;

  await db.query(
    'INSERT INTO matchmaking_queue (user_id, deck_id, elo) VALUES (?,?,?) ON DUPLICATE KEY UPDATE deck_id=?, elo=?, joined_at=NOW()',
    [req.user.id, deckId, elo, deckId, elo]
  );

  const [opponents] = await db.query(
    'SELECT * FROM matchmaking_queue WHERE user_id != ? AND ABS(elo - ?) <= 300 ORDER BY joined_at ASC LIMIT 1',
    [req.user.id, elo]
  );
  if (!opponents.length) return res.json({ status: 'queued', message: 'Waiting for opponent...' });

  const opp = opponents[0];
  const matchId = uuidv4();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM matchmaking_queue WHERE user_id IN (?,?)', [req.user.id, opp.user_id]);

    const [d1] = await conn.query('SELECT card_id FROM deck_cards WHERE deck_id = ?', [deckId]);
    const [d2] = await conn.query('SELECT card_id FROM deck_cards WHERE deck_id = ?', [opp.deck_id]);

    const gameState = initGameState(req.user.id, opp.user_id, d1.map(r => r.card_id), d2.map(r => r.card_id));

    await conn.query(
      'INSERT INTO matches (id, player1_id, player2_id, deck1_id, deck2_id, status, game_state, started_at) VALUES (?,?,?,?,?,"active",?,NOW())',
      [matchId, req.user.id, opp.user_id, deckId, opp.deck_id, JSON.stringify(gameState)]
    );
    await conn.commit();
    res.json({ status: 'matched', matchId, opponentId: opp.user_id });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// DELETE /api/matches/leave-queue
router.delete('/leave-queue', requireAuth, async (req, res) => {
  await db.query('DELETE FROM matchmaking_queue WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'Left queue' });
});

// POST /api/matches/:id/action — submit a play
router.post('/:id/action', requireAuth, async (req, res) => {
  const { action, cardId } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM matches WHERE id = ? AND status = "active" AND (player1_id = ? OR player2_id = ?) FOR UPDATE',
      [req.params.id, req.user.id, req.user.id]
    );
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Active match not found' }); }

    const match = rows[0];
    const state = JSON.parse(match.game_state);

    if (String(state.currentTurn) !== String(req.user.id)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Not your turn' });
    }

    const [allCards] = await conn.query(
      'SELECT * FROM cards WHERE id IN (SELECT card_id FROM deck_cards WHERE deck_id IN (?,?))',
      [match.deck1_id, match.deck2_id]
    );

    let result;
    if (action === 'play_card') {
      if (!cardId) { await conn.rollback(); return res.status(400).json({ error: 'cardId required' }); }
      result = playCard(state, req.user.id, Number(cardId), allCards);
    } else {
      await conn.rollback();
      return res.status(400).json({ error: 'Unknown action' });
    }

    const q = result.state.quarter - 1;
    const p1 = String(match.player1_id);
    const p2 = String(match.player2_id);
    const q1_p1 = result.state.players[p1]?.quarterScores[0] ?? match.q1_p1;
    const q1_p2 = result.state.players[p2]?.quarterScores[0] ?? match.q1_p2;
    const q2_p1 = result.state.players[p1]?.quarterScores[1] ?? match.q2_p1;
    const q2_p2 = result.state.players[p2]?.quarterScores[1] ?? match.q2_p2;
    const q3_p1 = result.state.players[p1]?.quarterScores[2] ?? match.q3_p1;
    const q3_p2 = result.state.players[p2]?.quarterScores[2] ?? match.q3_p2;
    const q4_p1 = result.state.players[p1]?.quarterScores[3] ?? match.q4_p1;
    const q4_p2 = result.state.players[p2]?.quarterScores[3] ?? match.q4_p2;

    const isOver = result.quarterResult?.type === 'match_end';
    const winnerId = isOver ? (result.quarterResult.winner || null) : null;

    await conn.query(
      `UPDATE matches SET game_state=?, status=?, winner_id=?, ended_at=?,
       q1_p1=?,q1_p2=?,q2_p1=?,q2_p2=?,q3_p1=?,q3_p2=?,q4_p1=?,q4_p2=? WHERE id=?`,
      [
        JSON.stringify(result.state),
        isOver ? 'completed' : 'active',
        winnerId,
        isOver ? new Date() : null,
        q1_p1, q1_p2, q2_p1, q2_p2, q3_p1, q3_p2, q4_p1, q4_p2,
        req.params.id,
      ]
    );

    if (isOver) {
      const loserId = winnerId
        ? (String(winnerId) === p1 ? match.player2_id : match.player1_id)
        : null;

      if (winnerId) {
        await conn.query('UPDATE users SET wins=wins+1, elo=elo+25, coins=coins+50 WHERE id=?', [winnerId]);
        await conn.query('UPDATE users SET losses=losses+1, elo=GREATEST(0,elo-25), coins=coins+10 WHERE id=?', [loserId]);
      }
      await conn.query(
        `UPDATE users SET rank = CASE
           WHEN elo>=2000 THEN 'Champion' WHEN elo>=1600 THEN 'Diamond'
           WHEN elo>=1300 THEN 'Platinum' WHEN elo>=1000 THEN 'Gold'
           WHEN elo>=700  THEN 'Silver'   WHEN elo>=400  THEN 'Bronze'
           ELSE 'Rookie' END
         WHERE id IN (?,?)`, [match.player1_id, match.player2_id]
      );
    }

    await conn.commit();
    res.json({ events: result.events, quarterResult: result.quarterResult, state: result.state });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = router;
