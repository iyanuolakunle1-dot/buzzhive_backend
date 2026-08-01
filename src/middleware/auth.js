const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { mapUser } = require('../utils/mappers');

const fullSelect = 'id,name,username,email,bio,location,avatar,cover_photo,is_admin,is_verified,created_at';
const minimalSelect = 'id,name,username,avatar,is_admin';

/**
 * Protects a route - requires a valid JWT in the Authorization header.
 * Attaches the authenticated user (without password) to req.user
 */
async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select(fullSelect)
      .eq('id', decoded.id)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    req.user = mapUser(user);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, invalid token' });
  }
}

/**
 * Like `protect`, but does not fail the request if no token is present.
 * Useful for public routes (e.g. viewing the feed) that behave slightly
 * differently for a logged-in user (e.g. showing "liked by me" state).
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user } = await supabase
      .from('users')
      .select(minimalSelect)
      .eq('id', decoded.id)
      .maybeSingle();

    req.user = user
      ? { id: user.id, name: user.name, username: user.username, avatar: user.avatar, isAdmin: user.is_admin }
      : null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

module.exports = { protect, optionalAuth };
