import { useCallback, useEffect, useState } from 'react';
import { ApiError, getMe, getToken, setUnauthorizedHandler } from '../api/client';
import type { User } from '../api/types';
import { clearAuthState } from '../features/auth/authStore';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function boot() {
      const token = getToken();
      if (!token) {
        setIsBooting(false);
        return;
      }

      try {
        const currentUser = await getMe();
        if (isMounted) {
          setUser(currentUser);
        }
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          clearAuthState();
        } else if (isMounted) {
          setBootError(caught instanceof Error ? caught.message : '启动失败，请稍后重试');
        }
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    void boot();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearAuthState();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  const logout = useCallback(() => {
    clearAuthState();
    setUser(null);
  }, []);

  return { user, isBooting, bootError, logout, setUser } as const;
}
