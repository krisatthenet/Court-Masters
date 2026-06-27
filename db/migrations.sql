-- Court Masters — Migrations
-- Run via phpMyAdmin: select u168231407_courtmasters → Import → this file

-- Allow AI matches (player2_id nullable)
ALTER TABLE matches
  MODIFY COLUMN player2_id INT UNSIGNED DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_ai_match TINYINT(1) DEFAULT 0 AFTER player2_id;

-- Friendships
CREATE TABLE IF NOT EXISTS friendships (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id INT UNSIGNED NOT NULL,
  addressee_id INT UNSIGNED NOT NULL,
  status       ENUM('pending','accepted','declined') DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pair (requester_id, addressee_id),
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_addressee (addressee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Game challenges between friends
CREATE TABLE IF NOT EXISTS challenges (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenger_id INT UNSIGNED NOT NULL,
  challenged_id INT UNSIGNED NOT NULL,
  status        ENUM('pending','accepted','declined','expired') DEFAULT 'pending',
  match_id      VARCHAR(36),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (challenger_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (challenged_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_challenged (challenged_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User pack inventory (Bronze / Silver / Gold packs)
CREATE TABLE IF NOT EXISTS user_packs (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  pack_type  ENUM('bronze','silver','gold') DEFAULT 'bronze',
  opened     TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_unopened (user_id, opened)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
