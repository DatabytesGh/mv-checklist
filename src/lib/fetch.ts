/** Client fetch with session cookies always sent. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { credentials: "include", ...init });
}
