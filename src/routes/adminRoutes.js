const express = require('express');
const router = express.Router();
const {
  getStats, getAllUsers, createUser, toggleAdmin, deleteUser, getAllPosts, deletePostAdmin,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/admin');

router.use(protect, adminOnly);

router.get('/stats', getStats);
router.get('/users', getAllUsers);
router.post('/users', createUser);
router.put('/users/:id/toggle-admin', toggleAdmin);
router.delete('/users/:id', deleteUser);
router.get('/posts', getAllPosts);
router.delete('/posts/:id', deletePostAdmin);

module.exports = router;
