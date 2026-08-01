/**
 * Restricts a route to admin users only.
 * Must be used AFTER the `protect` middleware.
 */
function adminOnly(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { adminOnly };
