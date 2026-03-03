import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { API_BASE_URL, API_ENDPOINTS } from './config';
import type { Bot } from './types';

const STORAGE_KEY = 'clawteam_api_key';

export interface MeResponse {
  currentBot: {
    id: string;
    name: string;
    ownerEmail: string;
    teamId: string;
    status: string;
    avatarColor?: string;
    avatarUrl?: string;
  };
  ownerEmail: string;
  ownedBots: Bot[];
}

interface IdentityState {
  apiKey: string | null;
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
}

interface IdentityContextValue extends IdentityState {
  login: (apiKey: string) => Promise<boolean>;
  logout: () => void;
  isLoggedIn: boolean;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IdentityState>({
    apiKey: localStorage.getItem(STORAGE_KEY),
    me: null,
    loading: false,
    error: null,
  });

  const fetchMe = useCallback(async (key: string): Promise<MeResponse | null> => {
    const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.botsMe}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  }, []);

  // Auto-login on mount if key exists
  useEffect(() => {
    if (state.apiKey && !state.me && !state.loading) {
      setState(s => ({ ...s, loading: true }));
      fetchMe(state.apiKey).then(me => {
        if (me) {
          setState(s => ({ ...s, me, loading: false, error: null }));
        } else {
          // Invalid stored key
          localStorage.removeItem(STORAGE_KEY);
          setState({ apiKey: null, me: null, loading: false, error: null });
        }
      }).catch(() => {
        setState(s => ({ ...s, loading: false, error: 'Failed to connect' }));
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (apiKey: string): Promise<boolean> => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const me = await fetchMe(apiKey);
      if (me) {
        localStorage.setItem(STORAGE_KEY, apiKey);
        setState({ apiKey, me, loading: false, error: null });
        return true;
      }
      setState(s => ({ ...s, loading: false, error: 'Invalid API key' }));
      return false;
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Failed to connect' }));
      return false;
    }
  }, [fetchMe]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ apiKey: null, me: null, loading: false, error: null });
  }, []);

  return (
    <IdentityContext.Provider value={{ ...state, login, logout, isLoggedIn: !!state.me }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used within IdentityProvider');
  return ctx;
}
