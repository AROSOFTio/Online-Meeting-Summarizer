// Keep browser requests same-origin; Next.js proxies /api to the backend service.
const API_BASE = "";

export async function apiRequest(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  
  // Enforce credentials inclusion for secure cookie transfer
  options.credentials = "include";
  
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  options.headers = headers;

  const response = await fetch(url, options);
  
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
  
  if (response.status === 204) {
    return null;
  }
  
  return response.json();
}
