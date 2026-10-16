// Shared plumbing for the Google Cloud REST clients in this folder: an ADC access token,
// one authenticated fetch with abort and timeout, and fail-closed env reads.
import { GoogleAuth } from 'google-auth-library';

let auth: GoogleAuth | undefined;

// google-auth-library keeps the token on its client and refreshes it five minutes before
// expiry, so one shared GoogleAuth is the cache.
export async function googleAccessToken(signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const token = await auth.getAccessToken();
  signal?.throwIfAborted();
  if (!token) throw Error('Google Cloud credentials unavailable');
  return token;
}

export interface GoogleRequest {
  method?: 'GET' | 'POST' | 'DELETE';
  json?: unknown;
  body?: Uint8Array<ArrayBuffer>;
  contentType?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}

/** Authenticated call that resolves only on 2xx. A caller abort rejects with the caller's reason. */
export async function googleFetch(service: string, url: string, request: GoogleRequest): Promise<Response> {
  const token = await googleAccessToken(request.signal);
  const timeout = AbortSignal.timeout(request.timeoutMs);
  const hasBody = request.json !== undefined || request.body !== undefined;
  const contentType = request.json !== undefined ? 'application/json' : request.contentType;
  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method ?? (hasBody ? 'POST' : 'GET'),
      signal: request.signal ? AbortSignal.any([request.signal, timeout]) : timeout,
      headers: { authorization: `Bearer ${token}`, ...(contentType ? { 'content-type': contentType } : {}) },
      body: request.json !== undefined ? JSON.stringify(request.json) : request.body,
    });
  } catch (error) {
    request.signal?.throwIfAborted();
    if (timeout.aborted) throw Error(`${service} request timed out`);
    throw error;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw Error(`${service} rejected the request (${response.status})`);
  }
  return response;
}

/** googleFetch plus JSON decoding. The caller still validates the shape. */
export async function googleJson(service: string, url: string, request: GoogleRequest): Promise<any> {
  const response = await googleFetch(service, url, request);
  try {
    return await response.json();
  } catch {
    request.signal?.throwIfAborted();
    throw Error(`${service} returned malformed JSON`);
  }
}

/** Required env value, trying `fallback` second. Missing config throws instead of defaulting. */
export function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || (fallback ? process.env[fallback]?.trim() : '');
  if (!value) throw Error(fallback ? `${name} (or ${fallback}) is required` : `${name} is required`);
  return value;
}

export const PROJECT_ID = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
export const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;
