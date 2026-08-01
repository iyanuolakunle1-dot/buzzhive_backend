const { body, validationResult } = require('express-validator');
const dns = require('dns').promises;

// Collects express-validator errors into a clean 400 response.
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

/**
 * Confirms the email's domain can actually receive mail (has MX records,
 * falling back to an A/AAAA record for domains that route mail to the
 * same host). This blocks obviously fake/typo'd domains at signup —
 * it does not confirm the specific mailbox exists, which requires
 * actually sending a verification email (a good next step, ask if wanted).
 */
async function domainCanReceiveMail(email) {
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0) return true;
  } catch {
    // fall through to A/AAAA check below
  }
  try {
    await dns.resolve(domain);
    return true;
  } catch {
    return false;
  }
}

const registerRules = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Name can only contain letters, spaces, hyphens and apostrophes'),

  body('username')
    .trim()
    .toLowerCase()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-z0-9_]+$/)
    .withMessage('Username can only contain lowercase letters, numbers, and underscores'),

  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .custom(async (email) => {
      const ok = await domainCanReceiveMail(email);
      if (!ok) {
        throw new Error("That email address doesn't seem to exist — please use a real, working email.");
      }
      return true;
    }),

  body('password')
    .isLength({ min: 8, max: 100 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  handleValidation,
];

const loginRules = [
  body('email').trim().toLowerCase().isEmail().withMessage('Please provide a valid email address'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidation,
];

module.exports = { registerRules, loginRules, handleValidation };
