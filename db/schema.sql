-- Court Masters — Database Schema + Seed Data
-- Run once on your Hostinger MySQL database
-- hPanel > Databases > phpMyAdmin > Import this file

SET NAMES utf8mb4;
SET foreign_key_checks = 0;

-- ─── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar        VARCHAR(10)  DEFAULT '🏀',
  coins         INT UNSIGNED DEFAULT 500,
  gems          INT UNSIGNED DEFAULT 50,
  wins          INT UNSIGNED DEFAULT 0,
  losses        INT UNSIGNED DEFAULT 0,
  elo           INT UNSIGNED DEFAULT 1000,
  rank          ENUM('Rookie','Bronze','Silver','Gold','Platinum','Diamond','Champion') DEFAULT 'Rookie',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_elo (elo DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cards (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  position      ENUM('PG','SG','SF','PF','C','PLAY','TACTIC','HYPE') NOT NULL,
  rarity        ENUM('common','rare','epic','legend','champion') DEFAULT 'common',
  cost          TINYINT UNSIGNED DEFAULT 1,
  speed         TINYINT UNSIGNED DEFAULT 1,
  attack        TINYINT UNSIGNED DEFAULT 1,
  health        TINYINT UNSIGNED DEFAULT 1,
  ability_text  TEXT,
  flavor_text   VARCHAR(255),
  emoji         VARCHAR(10) DEFAULT '🏀',
  is_collectible TINYINT(1) DEFAULT 1,
  INDEX idx_rarity   (rarity),
  INDEX idx_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_cards (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  card_id     INT UNSIGNED NOT NULL,
  quantity    SMALLINT UNSIGNED DEFAULT 1,
  acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_card (user_id, card_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS decks (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  name       VARCHAR(100) DEFAULT 'My Deck',
  is_active  TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS deck_cards (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  deck_id INT UNSIGNED NOT NULL,
  card_id INT UNSIGNED NOT NULL,
  FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id),
  INDEX idx_deck (deck_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS matches (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  player1_id  INT UNSIGNED NOT NULL,
  player2_id  INT UNSIGNED NOT NULL,
  deck1_id    INT UNSIGNED,
  deck2_id    INT UNSIGNED,
  status      ENUM('waiting','active','completed','abandoned') DEFAULT 'waiting',
  game_state  JSON,
  winner_id   INT UNSIGNED,
  q1_p1 TINYINT UNSIGNED DEFAULT 0, q1_p2 TINYINT UNSIGNED DEFAULT 0,
  q2_p1 TINYINT UNSIGNED DEFAULT 0, q2_p2 TINYINT UNSIGNED DEFAULT 0,
  q3_p1 TINYINT UNSIGNED DEFAULT 0, q3_p2 TINYINT UNSIGNED DEFAULT 0,
  q4_p1 TINYINT UNSIGNED DEFAULT 0, q4_p2 TINYINT UNSIGNED DEFAULT 0,
  started_at  TIMESTAMP NULL,
  ended_at    TIMESTAMP NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player1_id) REFERENCES users(id),
  FOREIGN KEY (player2_id) REFERENCES users(id),
  INDEX idx_players (player1_id, player2_id),
  INDEX idx_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  user_id   INT UNSIGNED NOT NULL PRIMARY KEY,
  deck_id   INT UNSIGNED NOT NULL,
  elo       SMALLINT UNSIGNED DEFAULT 1000,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token      VARCHAR(600) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token   (token(64)),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET foreign_key_checks = 1;

-- ─── Seed: Cards ───────────────────────────────────────────────────────────
-- Player cards (positions: PG SG SF PF C) have speed/attack/health
-- Non-player cards (PLAY TACTIC HYPE) use cost only; speed/attack/health = 0

INSERT INTO cards (name, position, rarity, cost, speed, attack, health, ability_text, flavor_text, emoji) VALUES

-- ── Common ──
('Bench Benny',     'PG', 'common',  1, 2, 3, 5,  'Hustle: +1 ATK when defending.',                       'Always ready off the bench.',         '🏃'),
('Quick Quinn',     'PG', 'common',  1, 3, 2, 4,  NULL,                                                    'First step is everything.',           '💨'),
('Street Ball Sam', 'PG', 'common',  1, 3, 3, 3,  'Draw 1 card when you score.',                          'Grew up on these courts.',            '🎪'),
('Steady Eddie',    'SG', 'common',  1, 2, 3, 5,  NULL,                                                    'Consistent is underrated.',           '📏'),
('Hot Rod Harris',  'SG', 'common',  1, 2, 4, 4,  'Heating Up: +1 ATK if scored last turn.',              'Once he gets going...',               '🌡️'),
('Rookie Rush',     'SF', 'common',  1, 2, 3, 5,  NULL,                                                    'Making the most of every minute.',    '🌱'),
('Perimeter Pete',  'SF', 'common',  1, 3, 3, 4,  NULL,                                                    'Lives on the three-point line.',      '📐'),
('Grinder Gary',    'PF', 'common',  1, 1, 4, 6,  'Rebound: Recover 1 HP when opponent scores.',          'No glory, just work.',                '⚙️'),
('Paint Paulo',     'C',  'common',  1, 1, 4, 7,  NULL,                                                    'Controls the paint.',                 '🎨'),

-- ── Rare ──
('Lightning Leo',   'PG', 'rare',    2, 5, 5, 8,  'Speed Rush: First play each quarter costs 0.',         'Faster than a fastbreak.',            '⚡'),
('Clutch Clara',    'SG', 'rare',    2, 4, 7, 6,  'Clutch: +3 ATK when momentum is 7+.',                  'Ice in her veins.',                   '🎯'),
('Wing Walker',     'SF', 'rare',    2, 4, 6, 7,  'Wing Sniper: Score 3 pts instead of 2 at SPD 4+.',    'Flies to the basket.',                '🦅'),
('Mid-Range Mike',  'PF', 'rare',    2, 3, 6, 8,  '50% chance to score 3 instead of 2.',                 'The forgotten art.',                  '🎯'),
('Big Block Beau',  'C',  'rare',    2, 2, 7, 9,  'Protect the Paint: Reduce all incoming ATK by 1.',    'Nothing gets through.',               '🚧'),

-- ── Epic ──
('Point Master',    'PG', 'epic',    3, 5, 8, 9,  'Court Vision: See the next opponent card.',            'The game slows down for him.',        '🧠'),
('Ice Cold Iris',   'SG', 'epic',    3, 4, 9, 8,  'Deep Freeze: Next opponent play is -3 ATK.',           'She does not miss in OT.',            '🧊'),
('Power Forward',   'PF', 'epic',    3, 2, 9, 11, 'Bulldoze: Ignore 2 DEF when attacking the paint.',    'Built different.',                    '🦏'),
('The Wall',        'C',  'epic',    3, 1, 8, 12, 'Immovable: Nullify the first attack each quarter.',   'Try to get past him.',                '🧱'),

-- ── Legend ──
('Hawk Hailey',     'SF', 'legend',  4, 5, 10, 10,'Steal: 30% chance to take a card from opponent hand.','As quick as she is skilled.',         '🦅'),
('King Kourt',      'PF', 'legend',  4, 3, 10, 10,'Royal Court: Draw 2 cards when scoring from paint.',  'The court is his kingdom.',           '🦁'),
('The Anchor',      'C',  'legend',  4, 1, 11, 14,'Fortify: +2 DEF for all friendly cards per quarter.', 'The team''s foundation.',             '⚓'),
('Clutch Clara II', 'SG', 'legend',  4, 5, 10, 9, 'Clutch + Ignore fouls this quarter.',                 'Nothing stops her.',                  '🎯'),
('Lightning Leo II','PG', 'legend',  4, 5, 9,  10,'Speed Rush + Draw 2 cards on any score.',             'He leveled up.',                      '⚡'),

-- ── Champion ──
('The Commissioner','PG', 'champion',5, 5, 12, 18,
 'RALLY: Once per game — all friendly cards get +4 ATK until end of quarter.',
 'The court is my kingdom.', '👑'),

-- ── Play cards (non-player) ──
('Fast Break',      'PLAY',  'common', 1, 0, 0, 0,'Score 2. Draw 1 card.',                               'Transition offense at its finest.',   '🏃'),
('Pick and Roll',   'PLAY',  'common', 1, 0, 0, 0,'Give +2 ATK to a player card this turn.',             'The oldest trick in the book.',       '🔄'),
('Alley-Oop',       'PLAY',  'rare',   2, 0, 0, 0,'Score 3 if a Center is on your field.',               'Poetry in motion.',                   '🏹'),
('Clutch Shot',     'PLAY',  'epic',   3, 0, 0, 0,'Score 4. Only playable in Q4.',                       'When it counts the most.',            '🎯'),

-- ── Tactic cards ──
('Zone Defense',    'TACTIC','common', 1, 0, 0, 0,'Reduce opponent momentum by 3.',                      'Protect the perimeter.',              '🔒'),
('Full Court Press','TACTIC','rare',   2, 0, 0, 0,'Opponent skips drawing a card next turn.',            'Suffocate them.',                     '🛡️'),
('Timeout',         'TACTIC','epic',   3, 0, 0, 0,'Reset your hand to 4 cards.',                        'Regroup. Refocus. Execute.',          '⏸️'),

-- ── Hype moves ──
('Slam Dunk Fury',  'HYPE',  'epic',   3, 0, 0, 0,'Score 5 points. Requires full Momentum (10).',       'The building goes WILD.',             '💥'),
('Half-Court Heave','HYPE',  'legend', 4, 0, 0, 0,'Score 7 points. Requires full Momentum (10).',       'Nobody believed he would try it.',    '🌙');
