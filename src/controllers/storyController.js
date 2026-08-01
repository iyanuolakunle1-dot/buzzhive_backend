const supabase = require('../config/supabase');
const { deleteByUrl } = require('../utils/upload');
const { mapAuthor } = require('../utils/mappers');

// @route  GET /api/stories  (active stories, grouped by user, newest first)
async function getStories(req, res) {
  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('id, image, created_at, user_id, user:users!stories_user_id_fkey(id,name,username,avatar,is_verified)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    const grouped = {};
    for (const story of stories) {
      if (!grouped[story.user_id]) {
        grouped[story.user_id] = { user: mapAuthor(story.user), stories: [] };
      }
      grouped[story.user_id].stories.push({ id: story.id, image: story.image, createdAt: story.created_at });
    }

    res.json({ groups: Object.values(grouped) });
  } catch (err) {
    console.error('Get stories error:', err);
    res.status(500).json({ message: 'Server error fetching stories' });
  }
}

// @route  POST /api/stories
async function createStory(req, res) {
  try {
    const { image } = req.body;
    if (!image || !image.trim()) {
      return res.status(400).json({ message: 'An image URL is required for a story' });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h lifespan

    const { data: inserted, error } = await supabase
      .from('stories')
      .insert({ image: image.trim(), user_id: req.user.id, expires_at: expiresAt })
      .select('id')
      .single();
    if (error) throw error;

    const { data: story } = await supabase
      .from('stories')
      .select('id, image, created_at, user:users!stories_user_id_fkey(id,name,username,avatar,is_verified)')
      .eq('id', inserted.id)
      .single();

    res.status(201).json({ story: { id: story.id, image: story.image, createdAt: story.created_at, user: mapAuthor(story.user) } });
  } catch (err) {
    console.error('Create story error:', err);
    res.status(500).json({ message: 'Server error creating story' });
  }
}

// @route  DELETE /api/stories/:id
async function deleteStory(req, res) {
  try {
    const { data: story } = await supabase.from('stories').select('id, user_id, image').eq('id', req.params.id).maybeSingle();
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.user_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized to delete this story' });
    }
    const { error } = await supabase.from('stories').delete().eq('id', req.params.id);
    if (error) throw error;

    await deleteByUrl(story.image);
    res.json({ message: 'Story deleted' });
  } catch (err) {
    console.error('Delete story error:', err);
    res.status(500).json({ message: 'Server error deleting story' });
  }
}

module.exports = { getStories, createStory, deleteStory };
