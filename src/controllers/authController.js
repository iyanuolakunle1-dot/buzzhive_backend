const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const generateToken = require('../utils/generateToken');
const { mapUser } = require('../utils/mappers');

const SALT_ROUNDS = 12; // higher cost factor = slower to brute-force offline

// @route  POST /api/auth/register
// Body is already validated + sanitized by `registerRules` middleware
async function register(req, res) {
  try {
    const name = req.body.name.trim();
    const username = req.body.username.trim().toLowerCase();
    const email = req.body.email.trim().toLowerCase();
    const { password } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('email, username')
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        message: existing.email === email ? 'Email already in use' : 'Username already taken',
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, username, email, password: hashedPassword })
      .select()
      .single();

    if (error) throw error;

    const token = generateToken(user.id);
    res.status(201).json({ user: mapUser(user), token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
}

// @route  POST /api/auth/login
// Uses a generic error message for both "no such user" and "wrong password"
// so an attacker can't use the response to enumerate valid emails.
async function login(req, res) {
  try {
    const email = req.body.email.trim().toLowerCase();
    const { password } = req.body;

    const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();

    // Always run bcrypt.compare (even against a dummy hash) so response
    // timing doesn't reveal whether the email exists.
    const hashToCompare = user ? user.password : '$2a$12$invalidsaltinvalidsaltinvalidsaltinvalidsalt';
    const isMatch = await bcrypt.compare(password, hashToCompare);

    if (!user || !isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    res.json({ user: mapUser(user), token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
}

// @route  GET /api/auth/me
async function getMe(req, res) {
  res.json({ user: req.user });
}

// @route  PUT /api/auth/password
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 8 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        message: 'New password must be at least 8 characters and include upper, lower case letters and a number',
      });
    }

    const { data: user } = await supabase.from('users').select('password').eq('id', req.user.id).maybeSingle();
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const { error } = await supabase.from('users').update({ password: hashed }).eq('id', req.user.id);
    if (error) throw error;

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Server error changing password' });
  }
}

module.exports = { register, login, getMe, changePassword };
