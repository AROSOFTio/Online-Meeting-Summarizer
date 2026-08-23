// Keep browser requests same-origin; Next.js proxies /api to the backend service.
const API_BASE = "";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  // Enforce credentials inclusion for secure cookie transfer.
  options.credentials = "include";

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  options.headers = headers;

  const method = (options.method || "GET").toUpperCase();
  const retryable = method === "GET" || path.includes("/heartbeat") || path.includes("/signals");
  const maxAttempts = retryable ? 3 : 1;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(url, options);
      break;
    } catch (error) {
      if (attempt < maxAttempts) {
        await wait(250 * attempt);
        continue;
      }
      if (error instanceof TypeError) {
        throw new Error("Connection to the meeting server was interrupted. Please stay on this page; the live room reconnects automatically.");
      }
      throw error;
    }
  }

  if (!response) throw new Error("Could not reach the meeting server.");

  if (!response.ok) {
    let errMsg = "An error occurred";
    try {
      const errData = await response.json();
      errMsg = errData.detail || errData.message || JSON.stringify(errData) || errMsg;
    } catch {
      errMsg = response.statusText || errMsg;
    }
    throw new Error(errMsg);
  }

  if (response.status === 204) return null;
  return response.json();
}
