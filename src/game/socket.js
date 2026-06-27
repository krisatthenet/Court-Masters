const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { initGameState, playCard } = require('./engine');

// In-memory matchmaking queue: userId -> { socketId, deckId, elo }
const queue = new Map();

function registerSocketHandlers(io) {
  // Authenticate every socket connection via JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user.id);

    // Rejoin an active match room on reconnect
    socket.on('rejoin_match', async ({ matchId }) => {
      const [rows] = await db.query(
        'SELECT id FROM matches WHERE id = ? AND (player1_id = ? OR player2_id = ?) AND status = "active"',
        [matchId, userId, userId]
      );
      if (rows.length) {
        socket.join(`match:${matchId}`);
        socket.emit('rejoined', { matchId });
      }
    });

    // Real-time matchmaking
    socket.on('find_match', async ({ deckId }) => {
      if (!deckId) return socket.emit('error', { message: 'deckId required' });

      const [decks] = await db.query(
        `SELECT d.id FROM decks d JOIN deck_cards dc ON dc.deck_id = d.id
         WHERE d.id = ? AND d.user_id = ? GROUP BY d.id HAVING COUNT(dc.id) = 30`,
        [deckId, userId]
      );
      if (!decks.length) return socket.emit('error', { message: 'Deck invalid or missing 30 cards' });

      const [users] = await db.query('SELECT elo FROM users WHERE id = ?', [userId]);
      const elo = users[0]?.elo || 1000;

      queue.delete(userId); // clear any existing entry

      // Find compatible opponent
      let opponent = null;
      for (const [opId, opData] of queue.entries()) {
        if (opId !== userId && Math.abs(opData.elo - elo) <= 300) {
          opponent = { userId: opId, ...opData };
          queue.delete(opId);
          break;
        }
      }

      if (!opponent) {
        queue.set(userId, { socketId: socket.id, deckId, elo });
        return socket.emit('queued', { message: 'Searching for opponent...' });
      }

      try {
        const matchId = uuidv4();
        const [d1] = await db.query('SELECT card_id FROM deck_cards WHERE deck_id = ?', [deckId]);
        const [d2] = await db.query('SELECT card_id FROM deck_cards WHERE deck_id = ?', [opponent.deckId]);
        const gameState = initGameState(userId, opponent.userId, d1.map(r => r.card_id), d2.map(r => r.card_id));

        await db.query(
          'INSERT INTO matches (id, player1_id, player2_id, deck1_id, deck2_id, status, game_state, started_at) VALUES (?,?,?,?,?,"active",?,NOW())',
          [matchId, userId, opponent.userId, deckId, opponent.deckId, JSON.stringify(gameState)]
        );

        socket.join(`match:${matchId}`);
        const opSocket = io.sockets.sockets.get(opponent.socketId);
        if (opSocket) opSocket.join(`match:${matchId}`);

        io.to(`match:${matchId}`).emit('match_found', { matchId, state: gameState });
      } catch (err) {
        console.error('Match creation error:', err);
        socket.emit('error', { message: 'Failed to create match' });
      }
    });

    // Real-time card play
    socket.on('play_card', async ({ matchId, cardId }) => {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
          'SELECT * FROM matches WHERE id = ? AND status = "active" FOR UPDATE', [matchId]
        );
        if (!rows.length) { await conn.rollback(); return socket.emit('error', { message: 'Match not found' }); }

        const match = rows[0];
        const state = JSON.parse(match.game_state);

        if (String(state.currentTurn) !== userId) {
          await conn.rollback();
          return socket.emit('error', { message: 'Not your turn' });
        }

        const [allCards] = await conn.query(
          'SELECT * FROM cards WHERE id IN (SELECT card_id FROM deck_cards WHERE deck_id IN (?,?))',
          [match.deck1_id, match.deck2_id]
        );

        const result = playCard(state, userId, Number(cardId), allCards);
        const isOver = result.quarterResult?.type === 'match_end';
        const winnerId = isOver ? (result.quarterResult.winner || null) : null;

        const p1 = String(match.player1_id);
        const p2 = String(match.player2_id);
        const qs = (pid, q) => result.state.players[pid]?.quarterScores[q] ?? 0;

        await conn.query(
          `UPDATE matches SET game_state=?, status=?, winner_id=?, ended_at=?,
           q1_p1=?,q1_p2=?,q2_p1=?,q2_p2=?,q3_p1=?,q3_p2=?,q4_p1=?,q4_p2=? WHERE id=?`,
          [
            JSON.stringify(result.state),
            isOver ? 'completed' : 'active',
            winnerId, isOver ? new Date() : null,
            qs(p1,0), qs(p2,0), qs(p1,1), qs(p2,1),
            qs(p1,2), qs(p2,2), qs(p1,3), qs(p2,3),
            matchId,
          ]
        );

        if (isOver && winnerId) {
          const loserId = String(winnerId) === p1 ? match.player2_id : match.player1_id;
          await conn.query('UPDATE users SET wins=wins+1,elo=elo+25,coins=coins+50 WHERE id=?', [winnerId]);
          await conn.query('UPDATE users SET losses=losses+1,elo=GREATEST(0,elo-25),coins=coins+10 WHERE id=?', [loserId]);
          await conn.query(
            `UPDATE users SET rank=CASE
               WHEN elo>=2000 THEN 'Champion' WHEN elo>=1600 THEN 'Diamond'
               WHEN elo>=1300 THEN 'Platinum' WHEN elo>=1000 THEN 'Gold'
               WHEN elo>=700  THEN 'Silver'   WHEN elo>=400  THEN 'Bronze'
               ELSE 'Rookie' END WHERE id IN (?,?)`, [match.player1_id, match.player2_id]
          );
        }

        await conn.commit();

        io.to(`match:${matchId}`).emit('card_played', {
          playerId: userId, cardId, events: result.events,
          state: result.state, quarterResult: result.quarterResult,
        });

        if (result.quarterResult) {
          const evName = isOver ? 'match_end' : 'quarter_end';
          io.to(`match:${matchId}`).emit(evName, result.quarterResult);
        }
      } catch (err) {
        await conn.rollback();
        console.error('Socket play_card error:', err);
        socket.emit('error', { message: err.message || 'Server error' });
      } finally {
        conn.release();
      }
    });

    socket.on('cancel_matchmaking', () => {
      queue.delete(userId);
      socket.emit('matchmaking_cancelled');
    });

    socket.on('disconnect', () => {
      queue.delete(userId);
    });
  });
}

module.exports = { registerSocketHandlers };
