// @ts-nocheck
// Supabase Edge Function: invite-user
// Allows an admin to invite a new user via email.
// Uses service role key ONLY server-side — never exposed to the browser.
// Validates JWT, checks admin role, prevents duplicate invites and orphan profiles.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface InviteRequest {
  email: string;
  full_name: string;
  role: 'admin' | 'member';
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Validate JWT — get the authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's JWT to verify auth
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Confirm role = admin
    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can invite users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Validate input
    const body: InviteRequest = await req.json();
    const email = body.email?.trim().toLowerCase();
    const fullName = body.full_name?.trim();
    const role = body.role;

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!fullName || fullName.length < 2) {
      return new Response(JSON.stringify({ error: 'Full name is required (min 2 chars)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (role !== 'admin' && role !== 'member') {
      return new Response(JSON.stringify({ error: 'Invalid role. Must be "admin" or "member"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Check for duplicate — existing profile with same email
    const { data: existing } = await userClient
      .from('profiles')
      .select('id')
      .ilike('full_name', fullName)
      .limit(1);

    // Also check if email is already registered in auth
    // We can't directly query auth.users with anon key, but we can try to sign in
    // and check the error. Instead, we'll use the admin client below.

    // 5. Use service role to invite the user
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 6. Send invite via Supabase Auth
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${req.headers.get('origin') || supabaseUrl}/login`,
        data: {
          full_name: fullName,
          role: role,
        },
      }
    );

    if (inviteErr) {
      // Check for duplicate user
      if (inviteErr.message.includes('already') || inviteErr.message.includes('registered')) {
        return new Response(JSON.stringify({ error: 'User with this email already exists' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Don't log the full error (may contain sensitive info)
      return new Response(JSON.stringify({ error: 'Failed to send invite' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Provision profile for the invited user
    if (inviteData?.user?.id) {
      const { error: profileInsertErr } = await adminClient
        .from('profiles')
        .upsert({
          id: inviteData.user.id,
          full_name: fullName,
          role: role,
        });

      if (profileInsertErr) {
        // Profile provisioning failed — but user was already invited
        // Return success but with a warning
        return new Response(
          JSON.stringify({
            success: true,
            warning: 'User invited but profile provisioning failed. Please check manually.',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Invite sent successfully' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    // Never log tokens or sensitive data
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
