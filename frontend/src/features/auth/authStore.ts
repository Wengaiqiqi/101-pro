import { getToken, setToken } from '../../api/client';
import type { User } from '../../api/types';

export interface AuthState {
  user: User | null;
  token: string | null;
}

export function readAuthState(user: User | null = null): AuthState {
  return {
    user,
    token: getToken()
  };
}

export function persistToken(token: string): void {
  setToken(token);
}

export function clearAuthState(): void {
  setToken(null);
}
