const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { addMeasurement } = require('../controllers/measurementController');

router.post('/', auth, addMeasurement);

module.exports = router;
