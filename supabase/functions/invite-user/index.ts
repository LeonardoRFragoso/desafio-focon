// Supabase Edge Function: invite-user
// Allows an admin to invite a new user via email.
// Uses service role key ONLY server-side — never exposed to the browser.
// Validates JWT, checks admin role, prevents duplicate invites and orphan profiles.
//
// Security hardening:
//   - Open redirect fix: redirectTo is validated against an allowlist of
//     origins (SUPABASE_URL + ALLOWED_WEB_ORIGINS env). The client-supplied
//     Origin header is NEVER trusted directly.
//   - CORS: reflects the request Origin only if it is in the allowlist;
//     otherwise no Access-Control-Allow-Origin is sent (browser blocks).
//   - Email validation via RFC 5322-compatible regex (not just '@').
//   - full_name length bounded [2, 120].
//   - Duplicate-email check now actually blocks the invite (was dead code
//     that queried full_name and ignored the result).
//   - Removed @ts-nocheck; types are explicit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS: string[] = (() => {
  const origins: string[] = [];
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (supabaseUrl) origins.push(supabaseUrl);
  const extra = Deno.env.get('ALLOWED_WEB_ORIGINS');
  if (extra) {
    for (const o of extra.split(',')) {
      const trimmed = o.trim();
      if (trimmed) origins.push(trimmed);
    }
  }
  return origins;
})();

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const MAX_NAME_LENGTH = 120;
const MIN_NAME_LENGTH = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  // Reflect the request origin only if it is allowlisted.
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    base['Access-Control-Allow-Origin'] = requestOrigin;
    base['Vary'] = 'Origin';
  }
  return base;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function allowedRedirectOrigin(origin: string | null): string {
  // Never trust the client Origin for redirects. Use the allowlist.
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Fallback to the Supabase URL (always allowlisted).
  return ALLOWED_ORIGINS[0] ?? Deno.env.get('SUPABASE_URL') ?? '';
}

interface InviteRequest {
  email: string;
  full_name: string;
  role: 'admin' | 'member';
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get('origin');
  const cors = corsHeaders(requestOrigin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  try {
    // 1. Validate JWT — get the authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401, cors);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      return json({ error: 'Server configuration error' }, 500, cors);
    }

    // Create client with user's JWT to verify auth
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: 'Invalid or expired token' }, 401, cors);
    }

    // 2. Confirm role = admin (read profile via the user's own JWT so RLS
    //    enforces the visibility rule).
    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return json({ error: 'Profile not found' }, 403, cors);
    }

    if (profile.role !== 'admin') {
      return json({ error: 'Only admins can invite users' }, 403, cors);
    }

    // 3. Validate input
    let body: InviteRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, cors);
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const role = body.role;

    if (!email || !EMAIL_REGEX.test(email)) {
      return json({ error: 'Invalid email' }, 400, cors);
    }

    if (fullName.length < MIN_NAME_LENGTH || fullName.length > MAX_NAME_LENGTH) {
      return json({ error: `Full name is required (${MIN_NAME_LENGTH}-${MAX_NAME_LENGTH} chars)` }, 400, cors);
    }

    if (role !== 'admin' && role !== 'member') {
      return json({ error: 'Invalid role. Must be "admin" or "member"' }, 400, cors);
    }

    // 4. Use service role for the remaining privileged operations.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      return json({ error: 'Server configuration error' }, 500, cors);
    }

    const adminClient: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 5. Send invite via Supabase Auth.
    //    Duplicate-email detection: the profiles table has no email column
    //    (email lives in auth.users), and the admin API has no lightweight
    //    getUserByEmail. We rely on inviteUserByEmail returning a "user
    //    already registered" error for duplicates (handled below).
    //
    //    redirectTo is validated against the allowlist — NEVER the raw Origin.
    const redirectTo = `${allowedRedirectOrigin(requestOrigin)}/login`;
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo,
        data: {
          full_name: fullName,
          role: role,
        },
      }
    );

    if (inviteErr) {
      // Check for duplicate user (auth.users already has this email)
      if (inviteErr.message.includes('already') || inviteErr.message.includes('registered')) {
        return json({ error: 'User with this email already exists' }, 409, cors);
      }
      // Don't leak the full error (may contain sensitive info)
      return json({ error: 'Failed to send invite' }, 500, cors);
    }

    // 6. Provision profile for the invited user.
    //    profiles has columns: id, full_name, role (no email column).
    if (inviteData?.user?.id) {
      const { error: profileInsertErr } = await adminClient
        .from('profiles')
        .upsert({
          id: inviteData.user.id,
          full_name: fullName,
          role: role,
        });

      if (profileInsertErr) {
        // Profile provisioning failed — but user was already invited.
        // Return success but with a warning so the admin can fix manually.
        return json(
          {
            success: true,
            warning: 'User invited but profile provisioning failed. Please check manually.',
          },
          200,
          cors
        );
      }
    }

    return json({ success: true, message: 'Invite sent successfully' }, 200, cors);
  } catch (_err) {
    // Never log tokens or sensitive data; return a generic message.
    return json({ error: 'Internal server error' }, 500, corsHeaders(req.headers.get('origin')));
  }
});
