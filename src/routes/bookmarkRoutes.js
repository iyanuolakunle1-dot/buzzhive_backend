const express = require('express');
const router = express.Router();
const { getBookmarks, toggleBookmark } = require('../controllers/bookmarkController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getBookmarks);
router.post('/:postId', protect, toggleBookmark);

module.exports = router;
