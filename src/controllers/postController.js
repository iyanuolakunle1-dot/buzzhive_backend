const supabase = require('../config/supabase');
const { deleteByUrl } = require('../utils/upload');
const { mapPost, mapComment } = require('../utils/mappers');

const authorEmbed = 'author:users!posts_author_id_fkey(id,name,username,avatar,is_verified)';
const postSelect = `id, content, image, created_at, updated_at, author_id, ${authorEmbed}, likes(count), comments(count)`;

// Batch-fetches which of the given postIds the user has liked/bookmarked.
// One extra query each instead of an N+1 per post.
async function getMyLikesAndBookmarks(userId, postIds) {
  if (!userId || postIds.length === 0) return { liked: new Set(), bookmarked: new Set() };
  const [{ data: likes }, { data: bookmarks }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
    supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', postIds),
  ]);
  return {
    liked: new Set((likes || []).map((l) => l.post_id)),
    bookmarked: new Set((bookmarks || []).map((b) => b.post_id)),
  };
}

// @route  GET /api/posts   (main feed - all posts, newest first)
async function getPosts(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: posts, error } = await supabase
      .from('posts')
      .select(postSelect)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const { liked, bookmarked } = await getMyLikesAndBookmarks(req.user?.id, posts.map((p) => p.id));

    const shaped = posts.map((p) =>
      mapPost(p, {
        likeCount: p.likes?.[0]?.count || 0,
        commentCount: p.comments?.[0]?.count || 0,
        likedByMe: liked.has(p.id),
        bookmarkedByMe: bookmarked.has(p.id),
      })
    );

    res.json({ posts: shaped, page });
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ message: 'Server error fetching posts' });
  }
}

// @route  GET /api/posts/:id  (single post detail)
async function getPostById(req, res) {
  try {
    const { data: post, error } = await supabase
      .from('posts')
      .select(postSelect)
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const { liked, bookmarked } = await getMyLikesAndBookmarks(req.user?.id, [post.id]);

    res.json({
      post: mapPost(post, {
        likeCount: post.likes?.[0]?.count || 0,
        commentCount: post.comments?.[0]?.count || 0,
        likedByMe: liked.has(post.id),
        bookmarkedByMe: bookmarked.has(post.id),
      }),
    });
  } catch (err) {
    console.error('Get post by id error:', err);
    res.status(500).json({ message: 'Server error fetching post' });
  }
}

// @route  POST /api/posts
async function createPost(req, res) {
  try {
    const { content, image } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Post content is required' });
    }

    const { data: inserted, error } = await supabase
      .from('posts')
      .insert({ content: content.trim(), image: image || null, author_id: req.user.id })
      .select('id')
      .single();
    if (error) throw error;

    const { data: post } = await supabase.from('posts').select(postSelect).eq('id', inserted.id).single();

    res.status(201).json({
      post: mapPost(post, { likeCount: 0, commentCount: 0, likedByMe: false, bookmarkedByMe: false }),
    });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ message: 'Server error creating post' });
  }
}

// @route  DELETE /api/posts/:id
async function deletePost(req, res) {
  try {
    const { data: post } = await supabase.from('posts').select('id, author_id, image').eq('id', req.params.id).maybeSingle();
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (post.author_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }

    const { error } = await supabase.from('posts').delete().eq('id', req.params.id);
    if (error) throw error;

    await deleteByUrl(post.image);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ message: 'Server error deleting post' });
  }
}

// @route  POST /api/posts/:id/like  (toggle like)
async function toggleLike(req, res) {
  try {
    const postId = req.params.id;
    const { data: existing } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('post_id', postId)
      .maybeSingle();

    if (existing) {
      await supabase.from('likes').delete().eq('id', existing.id);
      const { count } = await supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', postId);
      return res.json({ liked: false, likeCount: count || 0 });
    }

    await supabase.from('likes').insert({ user_id: req.user.id, post_id: postId });

    const { data: post } = await supabase.from('posts').select('author_id').eq('id', postId).maybeSingle();
    if (post && post.author_id !== req.user.id) {
      await supabase.from('notifications').insert({
        type: 'LIKE', recipient_id: post.author_id, sender_id: req.user.id, post_id: postId,
      });
    }

    const { count } = await supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', postId);
    res.json({ liked: true, likeCount: count || 0 });
  } catch (err) {
    console.error('Toggle like error:', err);
    res.status(500).json({ message: 'Server error toggling like' });
  }
}

// @route  GET /api/posts/:id/comments
async function getComments(req, res) {
  try {
    const { data: comments, error } = await supabase
      .from('comments')
      .select('id, content, created_at, post_id, author:users!comments_author_id_fkey(id,name,username,avatar,is_verified)')
      .eq('post_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ comments: comments.map(mapComment) });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ message: 'Server error fetching comments' });
  }
}

// @route  POST /api/posts/:id/comments
async function addComment(req, res) {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const postId = req.params.id;
    const { data: inserted, error } = await supabase
      .from('comments')
      .insert({ content: content.trim(), author_id: req.user.id, post_id: postId })
      .select('id')
      .single();
    if (error) throw error;

    const { data: comment } = await supabase
      .from('comments')
      .select('id, content, created_at, post_id, author:users!comments_author_id_fkey(id,name,username,avatar,is_verified)')
      .eq('id', inserted.id)
      .single();

    const { data: post } = await supabase.from('posts').select('author_id').eq('id', postId).maybeSingle();
    if (post && post.author_id !== req.user.id) {
      await supabase.from('notifications').insert({
        type: 'COMMENT', recipient_id: post.author_id, sender_id: req.user.id, post_id: postId,
      });
    }

    res.status(201).json({ comment: mapComment(comment) });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ message: 'Server error adding comment' });
  }
}

// @route  GET /api/posts/trending-tags  (derived from real post content, no fake data)
async function getTrendingTags(req, res) {
  try {
    const { data: posts, error } = await supabase
      .from('posts')
      .select('content')
      .order('created_at', { ascending: false })
      .limit(500); // recent posts only, keeps this fast

    if (error) throw error;

    const counts = {};
    const tagRegex = /#([a-zA-Z0-9_]+)/g;
    for (const post of posts) {
      const matches = post.content.match(tagRegex) || [];
      for (const raw of matches) {
        const tag = raw.toLowerCase();
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }

    const tags = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, count }));

    res.json({ tags });
  } catch (err) {
    console.error('Get trending tags error:', err);
    res.status(500).json({ message: 'Server error fetching trending tags' });
  }
}

module.exports = {
  getPosts,
  getPostById,
  createPost,
  deletePost,
  toggleLike,
  getComments,
  addComment,
  getTrendingTags,
};
