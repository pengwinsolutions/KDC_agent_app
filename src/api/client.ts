/**
 * The agent API client.
 *
 * Inside the app every call returns the spec's envelope (2.3): `{ code, message, data }`
 * with code 0 = success, 1 = failure and 401 = signed out; screens test `code === 0`.
 *
 * - Demo (`API_CONFIG.useMock`): the in-app mock backend at the spec's paths.
 * - Live: the KDC+ backend. Its envelope uses code 1 for success and HTTP status
 *   codes for failures; `liveRequest` translates it. Expired access tokens are
 *   refreshed once (one refresh at a time, the rotated refresh token saved back to
 *   the Keychain), and a session that can't be refreshed signs the agent out once.
 */
import type { Envelope } from '../domain/types';
import { handle as mockHandle } from './mockServer';
import { useSession } from '../store/session';
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from '../store/secure';
import { API_CONFIG } from './config';

export { API_CONFIG };

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const NETWORK = 'Something went wrong. Check your connection and try again.';
/**
 * Live: the request never reached the server (no network, wrong address, timeout). Development
 * builds name the address, since there the usual cause is a backend that isn't running or an
 * Android device without the port forwarded.
 */
const OFFLINE = __DEV__
  ? `Can’t reach the KDC+ server at ${API_CONFIG.baseUrl}. Start the backend (npm run start:dev in KDC_backend); on an Android device, also run npm run api:reverse.`
  : 'Can’t reach KDC+. Check your connection and try again.';
/** Live: the server answered but failed (5xx), so the connection is fine. */
const SERVER_DOWN = 'KDC+ is having trouble right now. Please try again in a few minutes.';

let logoutArmed = true;
let onSessionExpired: (() => void) | null = null;

/** Called once by the app shell: what to do when the server revokes the session. */
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}
/** Re-armed on every successful login so the next 401 burst logs out once. */
export function rearmLogout() {
  logoutArmed = true;
}

function sessionEnded() {
  if (!logoutArmed) return;
  logoutArmed = false;
  useSession.getState().clearToken();
  clearRefreshToken();
  onSessionExpired?.();
}

/* -------------------------------------------------------------- Demo */

async function send<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Envelope<T>> {
  const token = useSession.getState().token;
  let res: Envelope<T>;
  try {
    res = await mockHandle(method, path, body, token);
  } catch {
    res = { code: 1, message: NETWORK };
  }
  if (token && res.code === 401) sessionEnded();
  return res;
}

/** The spec's paths, answered by the in-app mock backend (demo builds). */
export const api = {
  post: <T = any>(path: string, body?: unknown) => send<T>('POST', path, body),
  get: <T = any>(path: string) => send<T>('GET', path),
};

/* -------------------------------------------------------------- Live */

interface BackendEnvelope<T> {
  code: number;
  message?: string;
  data?: T;
  errors?: Record<string, string[]> | null;
}

async function http<T>(method: Method, path: string, body: unknown, token: string | null): Promise<{ status: number; json: BackendEnvelope<T> | null }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // A FormData body (a file upload) sets its own multipart Content-Type with the boundary.
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_CONFIG.timeoutMs);
  try {
    const r = await fetch(`${API_CONFIG.baseUrl}/${path.replace(/^\/+/, '')}`, {
      method,
      headers,
      body: form ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const json = (await r.json().catch(() => null)) as BackendEnvelope<T> | null;
    return { status: r.status, json };
  } finally {
    clearTimeout(timer);
  }
}

let refreshing: Promise<string | null> | null = null;

/**
 * A new access token from the stored refresh token, or null when the session has
 * ended. Throws when the server can't be reached, so an outage never signs out.
 */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await loadRefreshToken();
      if (!refreshToken) return null;
      const { status, json } = await http<{ accessToken: string; refreshToken: string }>('POST', 'auth/refresh', { refreshToken }, null);
      if (status === 200 && json?.data) {
        await saveRefreshToken(json.data.refreshToken);
        useSession.getState().setToken(json.data.accessToken);
        return json.data.accessToken;
      }
      if (status === 401) return null;
      throw new Error(json?.message ?? `HTTP ${status}`);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** On launch: an access token from the Keychain's refresh token, if the agent was signed in. Demo: the stored token. */
export async function restoreSession(): Promise<'signed-in' | 'signed-out' | 'offline'> {
  if (API_CONFIG.useMock) return useSession.getState().token ? 'signed-in' : 'signed-out';
  try {
    const token = await refreshSession();
    if (token) {
      rearmLogout();
      return 'signed-in';
    }
    return 'signed-out';
  } catch {
    // The server can't be reached: let the agent in if they were signed in; calls retry later.
    return (await loadRefreshToken()) ? 'offline' : 'signed-out';
  }
}

/** Signed in: keep the tokens (refresh token to the Keychain, access token in memory). */
export async function adoptSession(pair: { accessToken: string; refreshToken: string }) {
  await saveRefreshToken(pair.refreshToken);
  useSession.getState().setToken(pair.accessToken);
  rearmLogout();
}

/** Signs out on the server, then forgets both tokens. */
export async function endSession() {
  const token = useSession.getState().token;
  if (!API_CONFIG.useMock && token) await http('POST', 'auth/logout', {}, token).catch(() => undefined);
  useSession.getState().clearToken();
  await clearRefreshToken();
}

const firstFieldError = (errors?: Record<string, string[]> | null) => (errors ? Object.values(errors)[0]?.[0] : undefined);

/** One call to the KDC+ backend, answered in the app's envelope. */
export async function liveRequest<T = any>(method: Method, path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<Envelope<T>> {
  const auth = opts.auth ?? true;
  try {
    let token = auth ? useSession.getState().token : null;
    if (auth && !token) token = await refreshSession().catch(() => null);
    if (auth && !token) {
      sessionEnded();
      return { code: 401, message: 'Your session has expired. Please log in again.' };
    }
    let res = await http<T>(method, path, body, token);
    if (auth && res.status === 401) {
      const fresh = await refreshSession();
      if (!fresh) {
        sessionEnded();
        return { code: 401, message: 'Your session has expired. Please log in again.' };
      }
      res = await http<T>(method, path, body, fresh);
      if (res.status === 401) {
        sessionEnded();
        return { code: 401, message: 'Your session has expired. Please log in again.' };
      }
    }
    if (res.status >= 200 && res.status < 300) return { code: 0, message: res.json?.message, data: res.json?.data as T };
    const message =
      res.status === 403 ? (res.json?.message ?? 'You can’t do this.') : res.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : res.status >= 500 ? ((res.status === 503 && res.json?.message) || SERVER_DOWN) : (firstFieldError(res.json?.errors) ?? res.json?.message ?? SERVER_DOWN);
    return { code: 1, message, data: res.json?.data as T };
  } catch {
    return { code: 1, message: OFFLINE };
  }
}

export const isOk = (r: Envelope) => r.code === 0;
