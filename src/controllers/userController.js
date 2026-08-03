const supabase = require('../config/supabase');
const { mapUser, mapAuthor, mapPost } = require('../utils/mappers');

const publicSelect = 'id,name,username,bio,location,avatar,cover_photo,is_verified,created_at';

// @route  GET /api/users/:username
async function getProfile(req, res) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(publicSelect)
      .eq('username', req.params.username)
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [{ count: postCount }, { count: followerCount }, { count: followingCount }] = await Promise.all([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]);

    // Follow status is from the VIEWER's perspective (req.user), not the profile owner.
    let followStatus = 'NONE'; // NONE | PENDING | ACCEPTED
    if (req.user && req.user.id !== user.id) {
      const { data: existing } = await supabase
        .from('follows')
        .select('status')
        .eq('follower_id', req.user.id)
        .eq('following_id', user.id)
        .maybeSingle();
      if (existing) followStatus = existing.status;
    }

    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, content, image, created_at, updated_at, author_id, likes(count), comments(count)')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false });
    if (postsError) throw postsError;

    res.json({
      user: {
        ...mapUser(user),
        postCount: postCount || 0,
        followerCount: followerCount || 0,
        followingCount: followingCount || 0,
      },
      followStatus,
      posts: posts.map((p) =>
        mapPost(p, { likeCount: p.likes?.[0]?.count || 0, commentCount: p.comments?.[0]?.count || 0 })
      ),
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
}

// @route  GET /api/users/id/:id  (minimal public info, used to open a message
// thread with someone directly from their profile without a search step)
async function getUserById(req, res) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id,name,username,avatar')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('Get user by id error:', err);
    res.status(500).json({ message: 'Server error fetching user' });
  }
}

// @route  PUT /api/users/me
async function updateProfile(req, res) {
  try {
    const { name, bio, location, avatar, coverPhoto } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (location !== undefined) updates.location = location;
    if (avatar !== undefined) updates.avatar = avatar;
    if (coverPhoto !== undefined) updates.cover_photo = coverPhoto;

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select(publicSelect)
      .single();

    if (error) throw error;
    res.json({ user: mapUser(user) });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Server error updating profile' });
  }
}

// @route  GET /api/users/search?q=
async function searchUsers(req, res) {
  try {
    const raw = req.query.q || '';
    if (!raw.trim()) return res.json({ users: [] });
    const q = raw.replace(/[,()%]/g, ''); // strip characters that have special meaning in PostgREST filters

    const { data: users, error } = await supabase
      .from('users')
      .select('id,name,username,avatar,is_verified')
      .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(15);

    if (error) throw error;
    res.json({ users: users.map(mapAuthor) });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ message: 'Server error searching users' });
  }
}

// @route  POST /api/users/:id/follow  (send/cancel follow request, or unfollow)
async function toggleFollow(req, res) {
  try {
    const followingId = req.params.id;
    if (followingId === req.user.id) {
      return res.status(400).json({ message: "You can't follow yourself" });
    }

    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', req.user.id)
      .eq('following_id', followingId)
      .maybeSingle();

    if (existing) {
      await supabase.from('follows').delete().eq('id', existing.id);
      return res.json({ status: 'REMOVED' });
    }

    await supabase.from('follows').insert({ follower_id: req.user.id, following_id: followingId, status: 'PENDING' });
    await supabase.from('notifications').insert({ type: 'FOLLOW_REQUEST', recipient_id: followingId, sender_id: req.user.id });

    res.json({ status: 'PENDING' });
  } catch (err) {
    console.error('Toggle follow error:', err);
    res.status(500).json({ message: 'Server error updating follow status' });
  }
}

// @route  PUT /api/users/follow-requests/:followId/accept
async function acceptFollowRequest(req, res) {
  try {
    const { data: request } = await supabase.from('follows').select('*').eq('id', req.params.followId).maybeSingle();
    if (!request || request.following_id !== req.user.id) {
      return res.status(404).json({ message: 'Follow request not found' });
    }

    const { data: updated, error } = await supabase
      .from('follows')
      .update({ status: 'ACCEPTED' })
      .eq('id', request.id)
      .select()
      .single();
    if (error) throw error;

    await supabase.from('notifications').insert({
      type: 'FOLLOW_ACCEPTED', recipient_id: request.follower_id, sender_id: req.user.id,
    });

    res.json({ follow: updated });
  } catch (err) {
    console.error('Accept follow error:', err);
    res.status(500).json({ message: 'Server error accepting follow request' });
  }
}

// @route  DELETE /api/users/follow-requests/:followId
async function declineFollowRequest(req, res) {
  try {
    const { data: request } = await supabase
      .from('follows')
      .select('id, following_id')
      .eq('id', req.params.followId)
      .maybeSingle();
    if (!request || request.following_id !== req.user.id) {
      return res.status(404).json({ message: 'Follow request not found' });
    }
    await supabase.from('follows').delete().eq('id', request.id);
    res.json({ message: 'Follow request declined' });
  } catch (err) {
    console.error('Decline follow error:', err);
    res.status(500).json({ message: 'Server error declining follow request' });
  }
}

// @route  GET /api/users/me/follow-requests
async function getFollowRequests(req, res) {
  try {
    const { data: requests, error } = await supabase
      .from('follows')
      .select('id, created_at, follower:users!follows_follower_id_fkey(id,name,username,avatar)')
      .eq('following_id', req.user.id)
      .in('status', ['PENDING', 'pending'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({
      requests: requests.map((r) => ({ id: r.id, createdAt: r.created_at, follower: mapAuthor(r.follower) })),
    });
  } catch (err) {
    console.error('Get follow requests error:', err);
    res.status(500).json({ message: 'Server error fetching follow requests' });
  }
}

// @route  GET /api/users/me/suggestions  (people you're not already following)
async function getSuggestedUsers(req, res) {
  try {
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', req.user.id)
      .in('status', ['ACCEPTED', 'accepted', 'PENDING', 'pending']);
    const excludeIds = [req.user.id, ...(following || []).map((f) => f.following_id)];

    const { data: users, error } = await supabase
      .from('users')
      .select('id,name,username,avatar,is_verified')
      .not('id', 'in', `(${excludeIds.join(',')})`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    // Facebook-style hint: does this suggested person already follow ME?
    let followsMeSet = new Set();
    const suggestedIds = users.map((u) => u.id);
    if (suggestedIds.length) {
      const { data: theirFollows } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', req.user.id)
        .in('status', ['ACCEPTED', 'accepted'])
        .in('follower_id', suggestedIds);
      followsMeSet = new Set((theirFollows || []).map((f) => f.follower_id));
    }

    res.json({ users: users.map((u) => ({ ...mapAuthor(u), followsMe: followsMeSet.has(u.id) })) });
  } catch (err) {
    console.error('Get suggestions error:', err);
    res.status(500).json({ message: 'Server error fetching suggestions' });
  }
}

// @route  GET /api/users/me/following  (accepted follows, for the Friends page)
async function getFollowing(req, res) {
  try {
    const { data: rows, error } = await supabase
      .from('follows')
      .select('following:users!follows_following_id_fkey(id,name,username,avatar)')
      .eq('follower_id', req.user.id)
      .in('status', ['ACCEPTED', 'accepted'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ following: rows.map((r) => mapAuthor(r.following)) });
  } catch (err) {
    console.error('Get following error:', err);
    res.status(500).json({ message: 'Server error fetching following list' });
  }
}

// @route  GET /api/users/:username/followers  (public list of who follows this person)
async function getFollowersList(req, res) {
  try {
    const { data: user } = await supabase.from('users').select('id').eq('username', req.params.username).maybeSingle();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { data: rows, error } = await supabase
      .from('follows')
      .select('follower:users!follows_follower_id_fkey(id,name,username,avatar,is_verified)')
      .eq('following_id', user.id)
      .eq('status', 'ACCEPTED')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: rows.map((r) => mapAuthor(r.follower)) });
  } catch (err) {
    console.error('Get followers list error:', err);
    res.status(500).json({ message: 'Server error fetching followers' });
  }
}

// @route  GET /api/users/:username/following  (public list of who this person follows)
async function getFollowingList(req, res) {
  try {
    const { data: user } = await supabase.from('users').select('id').eq('username', req.params.username).maybeSingle();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { data: rows, error } = await supabase
      .from('follows')
      .select('following:users!follows_following_id_fkey(id,name,username,avatar,is_verified)')
      .eq('follower_id', user.id)
      .eq('status', 'ACCEPTED')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: rows.map((r) => mapAuthor(r.following)) });
  } catch (err) {
    console.error('Get following list error:', err);
    res.status(500).json({ message: 'Server error fetching following list' });
  }
}

module.exports = {
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
};
