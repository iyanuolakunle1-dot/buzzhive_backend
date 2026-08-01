const supabase = require('../config/supabase');
const { mapAuthor } = require('../utils/mappers');

// @route  GET /api/notifications
async function getNotifications(req, res) {
  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('id, type, read, created_at, post_id, sender:users!notifications_sender_id_fkey(id,name,username,avatar,is_verified), post:posts(id,content)')
      .eq('recipient_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        read: n.read,
        createdAt: n.created_at,
        postId: n.post_id,
        sender: mapAuthor(n.sender),
        post: n.post ? { id: n.post.id, content: n.post.content } : null,
      })),
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
}

// @route  PUT /api/notifications/read-all
async function markAllRead(req, res) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', req.user.id)
      .eq('read', false);
    if (error) throw error;
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ message: 'Server error updating notifications' });
  }
}

// @route  GET /api/notifications/unread-count
async function getUnreadCount(req, res) {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', req.user.id)
      .eq('read', false);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ message: 'Server error fetching unread count' });
  }
}

module.exports = { getNotifications, markAllRead, getUnreadCount };
