import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Check current session
    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (error) throw error;

          setState({
            user: session.user,
            profile: profile as Profile,
            loading: false,
            error: null,
          });
        } else {
          setState({
            user: null,
            profile: null,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        setState({
          user: null,
          profile: null,
          loading: false,
          error: err instanceof Error ? err : new Error('Unknown error'),
        });
      }
    };

    checkSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: unknown, session: unknown) => {
      const typedSession = session as { user?: { id: string } } | null;
      if (typedSession?.user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', typedSession.user.id)
          .single();

        if (error) {
          setState({
            user: typedSession.user as User,
            profile: null,
            loading: false,
            error,
          });
        } else {
          setState({
            user: typedSession.user as User,
            profile: profile as Profile,
            loading: false,
            error: null,
          });
        }
      } else {
        setState({
          user: null,
          profile: null,
          loading: false,
          error: null,
        });
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Login failed');
      setState((prev) => ({ ...prev, error, loading: false }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setState({
        user: null,
        profile: null,
        loading: false,
        error: null,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Logout failed');
      setState((prev) => ({ ...prev, error, loading: false }));
      throw error;
    }
  };

  return {
    ...state,
    login,
    logout,
    isAdmin: state.profile?.role === 'admin',
  };
}
