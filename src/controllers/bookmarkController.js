const supabase = require('../config/supabase');
const { mapPost } = require('../utils/mappers');

const authorEmbed = 'author:users!posts_author_id_fkey(id,name,username,avatar,is_verified)';

// @route  GET /api/bookmarks
async function getBookmarks(req, res) {
  try {
    const { data: bookmarks, error } = await supabase
      .from('bookmarks')
      .select(`post:posts(id, content, image, created_at, updated_at, author_id, ${authorEmbed}, likes(count), comments(count))`)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const validBookmarks = bookmarks.filter((b) => b.post);
    const postIds = validBookmarks.map((b) => b.post.id);

    let likedIds = new Set();
    if (postIds.length) {
      const { data: myLikes } = await supabase.from('likes').select('post_id').eq('user_id', req.user.id).in('post_id', postIds);
      likedIds = new Set((myLikes || []).map((l) => l.post_id));
    }

    const posts = validBookmarks.map((b) =>
      mapPost(b.post, {
        likeCount: b.post.likes?.[0]?.count || 0,
        commentCount: b.post.comments?.[0]?.count || 0,
        likedByMe: likedIds.has(b.post.id),
        bookmarkedByMe: true,
      })
    );

    res.json({ posts });
  } catch (err) {
    console.error('Get bookmarks error:', err);
    res.status(500).json({ message: 'Server error fetching bookmarks' });
  }
}

// @route  POST /api/bookmarks/:postId (toggle)
async function toggleBookmark(req, res) {
  try {
    const { postId } = req.params;
    const { data: existing } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('post_id', postId)
      .maybeSingle();

    if (existing) {
      await supabase.from('bookmarks').delete().eq('id', existing.id);
      return res.json({ bookmarked: false });
    }

    await supabase.from('bookmarks').insert({ user_id: req.user.id, post_id: postId });
    res.json({ bookmarked: true });
  } catch (err) {
    console.error('Toggle bookmark error:', err);
    res.status(500).json({ message: 'Server error toggling bookmark' });
  }
}

module.exports = { getBookmarks, toggleBookmark };
