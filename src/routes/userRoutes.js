const express = require('express');
const router = express.Router();
const {
  getProfile,
  getUserById,
  updateProfile,
  searchUsers,
  toggleFollow,
  acceptFollowRequest,
  declineFollowRequest,
  getFollowRequests,
  getSuggestedUsers,
  getFollowing,
  getFollowersList,
  getFollowingList,
} = require('../controllers/userController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/search', protect, searchUsers);
router.get('/me/follow-requests', protect, getFollowRequests);
router.get('/me/suggestions', protect, getSuggestedUsers);
router.get('/me/following', protect, getFollowing);
router.get('/id/:id', protect, getUserById);
router.put('/follow-requests/:followId/accept', protect, acceptFollowRequest);
router.delete('/follow-requests/:followId', protect, declineFollowRequest);
router.put('/me', protect, updateProfile);
router.post('/:id/follow', protect, toggleFollow);
router.get('/:username/followers', getFollowersList);
router.get('/:username/following', getFollowingList);
router.get('/:username', optionalAuth, getProfile);

module.exports = router;
