const express = require('express');
const router = express.Router();
const {
  getPosts,
  getPostById,
  createPost,
  deletePost,
  toggleLike,
  getComments,
  addComment,
  getTrendingTags,
} = require('../controllers/postController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, getPosts);
router.get('/trending-tags', getTrendingTags);
router.post('/', protect, createPost);
router.get('/:id', optionalAuth, getPostById);
router.delete('/:id', protect, deletePost);
router.post('/:id/like', protect, toggleLike);
router.get('/:id/comments', getComments);
router.post('/:id/comments', protect, addComment);

module.exports = router;
