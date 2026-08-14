import { type ReactNode, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';
import { AuthContext } from './AuthContext';

/**
 * Load profile for a given user ID
 */
async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Check current session on mount
    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const profile = await loadProfile(session.user.id);
          setState({
            user: session.user,
            profile,
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

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session: Session | null) => {
      try {
        if (session?.user) {
          const profile = await loadProfile(session.user.id);
          setState({
            user: session.user,
            profile,
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
          user: session?.user || null,
          profile: null,
          loading: false,
          error: err instanceof Error ? err : new Error('Failed to load profile'),
        });
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
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
  }, []);

  const logout = useCallback(async () => {
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
  }, []);

  const value = {
    ...state,
    login,
    logout,
    isAdmin: state.profile?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
