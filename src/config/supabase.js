const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env — ' +
    'see .env.example. This is the ONLY database client the backend uses now (no Prisma).'
  );
}

// Server-side Supabase client using the SERVICE ROLE key. This key bypasses
// Row Level Security, which is correct here — the Express API is the only
// thing that talks to this client, and the API itself enforces all access
// control (JWT auth, ownership checks, isAdmin checks) in the controllers
// and middleware. NEVER send this key to a frontend.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = supabase;
