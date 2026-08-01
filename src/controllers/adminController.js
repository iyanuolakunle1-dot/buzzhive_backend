const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');
const { mapUser, mapPost } = require('../utils/mappers');
const { deleteByUrl } = require('../utils/upload'); // Cloudinary cleanup

const SALT_ROUNDS = 12;

// @route  POST /api/admin/users  (admin manually creates an account)
async function createUser(req, res) {
  try {
    const name = (req.body.name || '').trim();
    const username = (req.body.username || '').trim().toLowerCase();
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    const isAdmin = !!req.body.isAdmin;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: 'Name, username, email, and password are all required' });
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ message: 'Username must be 3-20 characters: lowercase letters, numbers, underscores only' });
    }
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters with upper, lower case letters and a number' });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('email, username')
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ message: existing.email === email ? 'Email already in use' : 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, username, email, password: hashedPassword, is_admin: isAdmin })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ user: { ...mapUser(user), postCount: 0 } });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ message: 'Server error creating user' });
  }
}

// @route  GET /api/admin/stats
async function getStats(req, res) {
  try {
    const [
      { count: userCount },
      { count: postCount },
      { count: commentCount },
      { count: likeCount },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('posts').select('id', { count: 'exact', head: true }),
      supabase.from('comments').select('id', { count: 'exact', head: true }),
      supabase.from('likes').select('id', { count: 'exact', head: true }),
    ]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: newUsersThisWeek }, { count: newPostsThisWeek }] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    ]);

    res.json({
      userCount: userCount || 0,
      postCount: postCount || 0,
      commentCount: commentCount || 0,
      likeCount: likeCount || 0,
      newUsersThisWeek: newUsersThisWeek || 0,
      newPostsThisWeek: newPostsThisWeek || 0,
    });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ message: 'Server error fetching stats' });
  }
}

// @route  GET /api/admin/users?q=
async function getAllUsers(req, res) {
  try {
    const raw = req.query.q || '';
    const q = raw.replace(/[,()%]/g, '');

    let query = supabase
      .from('users')
      .select('id,name,username,email,avatar,is_admin,is_verified,created_at')
      .order('created_at', { ascending: false });

    if (q) query = query.or(`name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`);

    const { data: users, error } = await query;
    if (error) throw error;

    const userIds = users.map((u) => u.id);
    const postCounts = {};
    if (userIds.length) {
      const { data: posts } = await supabase.from('posts').select('author_id').in('author_id', userIds);
      for (const p of posts || []) postCounts[p.author_id] = (postCounts[p.author_id] || 0) + 1;
    }

    res.json({ users: users.map((u) => ({ ...mapUser(u), postCount: postCounts[u.id] || 0 })) });
  } catch (err) {
    console.error('Get all users error:', err);
    res.status(500).json({ message: 'Server error fetching users' });
  }
}

// @route  PUT /api/admin/users/:id/toggle-admin
async function toggleAdmin(req, res) {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You can't change your own admin status" });
    }
    const { data: user } = await supabase.from('users').select('is_admin').eq('id', req.params.id).maybeSingle();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { data: updated, error } = await supabase
      .from('users')
      .update({ is_admin: !user.is_admin })
      .eq('id', req.params.id)
      .select('id, is_admin')
      .single();
    if (error) throw error;

    res.json({ user: { id: updated.id, isAdmin: updated.is_admin } });
  } catch (err) {
    console.error('Toggle admin error:', err);
    res.status(500).json({ message: 'Server error updating admin status' });
  }
}

// @route  DELETE /api/admin/users/:id
async function deleteUser(req, res) {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You can't delete your own account here" });
    }
    const { data: targetUser } = await supabase.from('users').select('avatar, cover_photo').eq('id', req.params.id).maybeSingle();

    const { error } = await supabase.from('users').delete().eq('id', req.params.id);
    if (error) throw error;

    if (targetUser) {
      await deleteByUrl(targetUser.avatar);
      await deleteByUrl(targetUser.cover_photo);
    }
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: err.message || 'Server error deleting user' });
  }
}

// @route  GET /api/admin/posts?q=
async function getAllPosts(req, res) {
  try {
    const raw = req.query.q || '';
    const q = raw.replace(/[,()%]/g, '');

    let query = supabase
      .from('posts')
      .select('id, content, image, created_at, author_id, author:users!posts_author_id_fkey(id,name,username,avatar), likes(count), comments(count)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (q) query = query.ilike('content', `%${q}%`);

    const { data: posts, error } = await query;
    if (error) throw error;

    res.json({
      posts: posts.map((p) => mapPost(p, { likeCount: p.likes?.[0]?.count || 0, commentCount: p.comments?.[0]?.count || 0 })),
    });
  } catch (err) {
    console.error('Get all posts error:', err);
    res.status(500).json({ message: 'Server error fetching posts' });
  }
}

// @route  DELETE /api/admin/posts/:id
async function deletePostAdmin(req, res) {
  try {
    const { data: post } = await supabase.from('posts').select('image').eq('id', req.params.id).maybeSingle();
    const { error } = await supabase.from('posts').delete().eq('id', req.params.id);
    if (error) throw error;

    if (post) await deleteByUrl(post.image);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Admin delete post error:', err);
    res.status(500).json({ message: err.message || 'Server error deleting post' });
  }
}

module.exports = { getStats, getAllUsers, createUser, toggleAdmin, deleteUser, getAllPosts, deletePostAdmin };
