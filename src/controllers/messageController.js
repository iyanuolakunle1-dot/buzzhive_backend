const supabase = require('../config/supabase');
const { mapAuthor, mapMessage } = require('../utils/mappers');
const { hasAcceptedConnection } = require('../utils/connection');

// Returns true if there's an ACCEPTED follow connection between the two
// users, in either direction — i.e. they're "friends" in BuzzHive's model.
async function areConnected(userIdA, userIdB) {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id, following_id, status')
    .or(`and(follower_id.eq.${userIdA},following_id.eq.${userIdB}),and(follower_id.eq.${userIdB},following_id.eq.${userIdA})`);
  console.log('[areConnected] rows:', JSON.stringify(data), 'error:', error?.message);
  const result = (data || []).some(r => String(r.status).toUpperCase() === 'ACCEPTED');
  console.log('[areConnected] result:', result);
  return result;
}

// @route  GET /api/messages/conversations  (list of people you've messaged, latest first)
async function getConversations(req, res) {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        id, content, read, created_at, sender_id, receiver_id,
        sender:users!messages_sender_id_fkey(id,name,username,avatar),
        receiver:users!messages_receiver_id_fkey(id,name,username,avatar)
      `)
      .or(`sender_id.eq.${req.user.id},receiver_id.eq.${req.user.id}`)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const conversations = new Map();
    for (const msg of messages) {
      const partner = msg.sender_id === req.user.id ? msg.receiver : msg.sender;
      if (!conversations.has(partner.id)) {
        conversations.set(partner.id, {
          partner: mapAuthor(partner),
          lastMessage: msg.content,
          lastMessageAt: msg.created_at,
          unread: msg.receiver_id === req.user.id && !msg.read,
        });
      }
    }

    // Also surface accepted connections you haven't messaged yet, so a
    // newly-accepted friend shows up immediately with a "Say hello" prompt
    // instead of only appearing after the first message is sent.
    const { data: connections } = await supabase
      .from('follows')
      .select(`
        follower_id, following_id,
        follower:users!follows_follower_id_fkey(id,name,username,avatar),
        following:users!follows_following_id_fkey(id,name,username,avatar)
      `)
      .in('status', ['ACCEPTED', 'accepted'])
      .or(`follower_id.eq.${req.user.id},following_id.eq.${req.user.id}`);

    for (const c of connections || []) {
      const partner = c.follower_id === req.user.id ? c.following : c.follower;
      if (!conversations.has(partner.id)) {
        conversations.set(partner.id, {
          partner: mapAuthor(partner),
          lastMessage: null, // frontend shows "Say hello 👋" for this
          lastMessageAt: null,
          unread: false,
        });
      }
    }

    res.json({ conversations: Array.from(conversations.values()) });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ message: 'Server error fetching conversations' });
  }
}

// @route  GET /api/messages/:userId  (full thread with one user)
async function getThread(req, res) {
  try {
    const otherId = req.params.userId;

    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, content, read, created_at, sender_id, receiver_id')
      .or(`and(sender_id.eq.${req.user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${req.user.id})`)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Mark incoming messages as read
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', otherId)
      .eq('receiver_id', req.user.id)
      .eq('read', false);

    res.json({ messages: messages.map(mapMessage) });
  } catch (err) {
    console.error('Get thread error:', err);
    res.status(500).json({ message: 'Server error fetching messages' });
  }
}

// @route  POST /api/messages/:userId
async function sendMessage(req, res) {
  try {
    const receiverId = req.params.userId;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }
    if (receiverId === req.user.id) {
      return res.status(400).json({ message: "You can't message yourself" });
    }

    const { data: receiver } = await supabase.from('users').select('id').eq('id', receiverId).maybeSingle();
    if (!receiver) return res.status(404).json({ message: 'Recipient not found' });

    const connected = await areConnected(req.user.id, receiverId);
    if (!connected) {
      return res.status(403).json({ message: 'You can only message someone after you are connected.' });
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({ content: content.trim(), sender_id: req.user.id, receiver_id: receiverId })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ message: mapMessage(message) });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Server error sending message' });
  }
}

module.exports = { getConversations, getThread, sendMessage };
