import { createContext } from 'react';
import type { Profile } from '@/types/database';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
