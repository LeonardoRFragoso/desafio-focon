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

  // Effect 1: Initialize session and listen for auth state changes
  useEffect(() => {
    // Check current session on mount
    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        setState((prev) => ({
          ...prev,
          user: session?.user || null,
          loading: session ? true : false, // Keep loading if user exists (profile will load separately)
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          user: null,
          loading: false,
          error: err instanceof Error ? err : new Error('Unknown error'),
        }));
      }
    };

    checkSession();

    // Listen for auth state changes - only update session, not profile
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      // Just update user, profile will be loaded in separate effect
      setState((prev) => ({
        ...prev,
        user: session?.user || null,
        loading: session ? true : false,
      }));
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Effect 2: Load profile when user changes (protected against unmount)
  useEffect(() => {
    let isMounted = true;

    const loadUserProfile = async () => {
      if (!state.user) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            profile: null,
            loading: false,
          }));
        }
        return;
      }

      try {
        const profile = await loadProfile(state.user.id);
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            profile,
            loading: false,
            error: null,
          }));
        }
      } catch (err) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            profile: null,
            loading: false,
            error: err instanceof Error ? err : new Error('Failed to load profile'),
          }));
        }
      }
    };

    loadUserProfile();

    return () => {
      isMounted = false;
    };
  }, [state.user]);

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
