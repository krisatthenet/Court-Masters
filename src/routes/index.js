const { Router } = require('express');
const router = Router();

router.use('/auth',        require('./auth'));
router.use('/users',       require('./users'));
router.use('/cards',       require('./cards'));
router.use('/decks',       require('./decks'));
router.use('/matches',     require('./matches'));
router.use('/friends',     require('./friends'));
router.use('/leaderboard', require('./leaderboard'));

module.exports = router;
