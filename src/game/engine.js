const TURNS_PER_QUARTER = 6; // per player; 12 total per quarter
const TOTAL_QUARTERS    = 4;
const PLAYER_POSITIONS  = new Set(['PG', 'SG', 'SF', 'PF', 'C']);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initGameState(player1Id, player2Id, deck1CardIds, deck2CardIds) {
  const p1 = String(player1Id);
  const p2 = String(player2Id);
  const d1 = shuffle(deck1CardIds.map(Number));
  const d2 = shuffle(deck2CardIds.map(Number));
  return {
    quarter: 1,
    turnInQuarter: 0,    // resets each quarter; max = TURNS_PER_QUARTER * 2
    currentTurn: p1,
    players: {
      [p1]: { hand: d1.slice(0, 4), deck: d1.slice(4), field: [], momentum: 0, quarterScores: [0, 0, 0, 0] },
      [p2]: { hand: d2.slice(0, 4), deck: d2.slice(4), field: [], momentum: 0, quarterScores: [0, 0, 0, 0] },
    },
    log: [],
  };
}

function defenseValue(opponentPlayer, allCards) {
  const fieldCards = opponentPlayer.field
    .map(id => allCards.find(c => c.id === id))
    .filter(Boolean);
  const base = fieldCards.length
    ? fieldCards.reduce((s, c) => s + Math.floor(c.health / 2), 0) / fieldCards.length
    : 3;
  return base + Math.floor(Math.random() * 3); // ±0-2 randomness
}

function playCard(state, playerId, cardId, allCards) {
  const pid = String(playerId);
  const cid = Number(cardId);
  const player   = state.players[pid];
  if (!player) throw new Error('Player not in this match');

  const opponentId = Object.keys(state.players).find(id => id !== pid);
  const opponent   = state.players[opponentId];
  const card       = allCards.find(c => c.id === cid);
  if (!card) throw new Error(`Card ${cid} not found`);
  if (!player.hand.includes(cid)) throw new Error('Card not in hand');

  // Remove from hand
  player.hand = player.hand.filter(id => id !== cid);

  const events = [];
  let pointsScored = 0;

  if (PLAYER_POSITIONS.has(card.position)) {
    // Put player on field if not already there
    if (!player.field.includes(cid)) player.field.push(cid);

    const atk = card.attack + Math.floor(Math.random() * 5) - 2; // ATK ± 2
    const def = defenseValue(opponent, allCards);
    const scored = atk > def;
    pointsScored  = scored ? (card.speed >= 4 ? 3 : 2) : 0;
    events.push({ type: scored ? 'score' : 'blocked', card: card.name, points: pointsScored, atk, def: Math.floor(def) });

  } else if (card.position === 'PLAY') {
    const success = Math.random() > 0.4;
    pointsScored  = success ? (card.cost >= 2 ? 3 : 2) : 0;
    events.push({ type: success ? 'play_success' : 'play_failed', card: card.name, points: pointsScored });

  } else if (card.position === 'TACTIC') {
    opponent.momentum = Math.max(0, opponent.momentum - 2);
    events.push({ type: 'tactic', card: card.name, effect: 'opponent -2 momentum' });

  } else if (card.position === 'HYPE') {
    if (player.momentum < 10) throw new Error('Momentum not full');
    pointsScored   = 5;
    player.momentum = 0;
    events.push({ type: 'hype_move', card: card.name, points: 5 });
  }

  player.quarterScores[state.quarter - 1] += pointsScored;
  if (pointsScored > 0) player.momentum = Math.min(10, player.momentum + pointsScored);

  // Draw replacement card
  if (player.deck.length > 0) player.hand.push(player.deck.shift());

  state.turnInQuarter++;
  state.currentTurn = opponentId;
  state.log.push({ quarter: state.quarter, turn: state.turnInQuarter, player: pid, card: card.name, events });

  const quarterResult = state.turnInQuarter >= TURNS_PER_QUARTER * 2
    ? advanceQuarter(state, pid, opponentId)
    : null;

  return { state, events, pointsScored, quarterResult };
}

function advanceQuarter(state, p1Id, p2Id) {
  const q  = state.quarter - 1;
  const s1 = state.players[p1Id].quarterScores[q];
  const s2 = state.players[p2Id].quarterScores[q];
  const quarterWinner = s1 > s2 ? p1Id : s2 > s1 ? p2Id : null;

  if (state.quarter >= TOTAL_QUARTERS) {
    return { type: 'match_end', quarterWinner, ...matchWinner(state, p1Id, p2Id) };
  }

  state.quarter++;
  state.turnInQuarter = 0;

  for (const pid of [p1Id, p2Id]) {
    const p = state.players[pid];
    const draw = Math.min(4, p.deck.length);
    p.hand = p.deck.splice(0, draw);
    p.momentum = Math.floor(p.momentum / 2); // carry 50% momentum
  }

  return { type: 'quarter_end', quarterWinner, nextQuarter: state.quarter };
}

function matchWinner(state, p1Id, p2Id) {
  let w1 = 0, w2 = 0;
  for (let q = 0; q < TOTAL_QUARTERS; q++) {
    const s1 = state.players[p1Id].quarterScores[q];
    const s2 = state.players[p2Id].quarterScores[q];
    if (s1 > s2) w1++; else if (s2 > s1) w2++;
  }
  return { winner: w1 > w2 ? p1Id : w2 > w1 ? p2Id : null, quartersWon: { [p1Id]: w1, [p2Id]: w2 } };
}

module.exports = { initGameState, playCard };
