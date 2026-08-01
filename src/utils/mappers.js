// Shared helpers that translate snake_case Postgres rows into the
// camelCase shapes the frontend expects (which were originally defined
// around Prisma's default camelCase field names — kept identical so the
// frontend needed zero changes for this migration).

function mapUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    bio: u.bio ?? null,
    location: u.location ?? null,
    avatar: u.avatar ?? null,
    coverPhoto: u.cover_photo ?? null,
    isAdmin: u.is_admin,
    isVerified: u.is_verified,
    createdAt: u.created_at,
  };
}

// Minimal public "author" shape used when a user is embedded inside a
// post, comment, notification, message, story, etc.
function mapAuthor(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    avatar: u.avatar ?? null,
    isVerified: u.is_verified,
  };
}

function mapPost(p, extra = {}) {
  if (!p) return null;
  return {
    id: p.id,
    content: p.content,
    image: p.image ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    authorId: p.author_id,
    author: p.author ? mapAuthor(p.author) : undefined,
    ...extra,
  };
}

function mapComment(c) {
  if (!c) return null;
  return {
    id: c.id,
    content: c.content,
    createdAt: c.created_at,
    postId: c.post_id,
    author: mapAuthor(c.author),
  };
}

function mapMessage(m) {
  if (!m) return null;
  return {
    id: m.id,
    content: m.content,
    read: m.read,
    createdAt: m.created_at,
    senderId: m.sender_id,
    receiverId: m.receiver_id,
  };
}

module.exports = { mapUser, mapAuthor, mapPost, mapComment, mapMessage };
