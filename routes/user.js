const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getUserProfile, updateUserProfile } = require('../controllers/userController');

router.get('/me', auth, getUserProfile);
router.put('/me', auth, updateUserProfile);

module.exports = router;
