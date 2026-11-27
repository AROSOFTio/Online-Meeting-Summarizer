// Keep browser requests same-origin; Next.js proxies /api to the backend service.
const API_BASE = "";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name="ApiError"; }
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  // Enforce credentials inclusion for secure cookie transfer.
  options.credentials = options.credentials ?? "include";

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  options.headers = headers;

  const method = (options.method || "GET").toUpperCase();
  const retryable = method === "GET" || path.includes("/heartbeat") || path.includes("/signals");
  const liveRoom = path.startsWith("/api/live-rooms/");
  // Signal polling consumes a queue. Never retry a lost response silently.
  // The room recovery loop owns retries, so requests cannot pile up offline.
  const maxAttempts = liveRoom ? 1 : retryable ? 3 : 1;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const controller=liveRoom&&!options.signal?new AbortController():null;
      const timer=controller?setTimeout(()=>controller.abort(),path.endsWith("/join")?12000:5000):null;
      try{response=await fetch(url,controller?{...options,signal:controller.signal}:options);}
      finally{if(timer!==null)clearTimeout(timer);}
      break;
    } catch (error) {
      if (attempt < maxAttempts) {
        await wait(250 * attempt);
        continue;
      }
      if (error instanceof TypeError || (error instanceof DOMException && ["TimeoutError","AbortError"].includes(error.name))) {
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
    throw new ApiError(typeof errMsg==="string"?errMsg:JSON.stringify(errMsg),response.status);
  }

  if (response.status === 204) return null;
  return response.json();
}
