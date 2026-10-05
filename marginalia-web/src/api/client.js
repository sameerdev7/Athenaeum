// Same-origin by default: the Vite dev proxy forwards /api to the backend,
// which serves no CORS headers. Set VITE_API_URL to point at an absolute
// origin instead (only works if that origin allows this one).
const BASE_URL = import.meta.env.VITE_API_URL ?? "";

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    // Reject (rather than resolve undefined) so callers' .then() chains don't
    // run on nothing and throw a confusing TypeError before the redirect lands.
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // FastAPI returns `detail` as a string for deliberate errors and as an
    // array of field errors for request validation. Flatten the latter into
    // one readable sentence rather than dumping JSON at the user.
    const detail = Array.isArray(data.detail)
      ? data.detail
          .map((d) => {
            const field = d.loc?.filter((p) => p !== "body").join(".");
            return field ? `${field}: ${d.msg}` : d.msg;
          })
          .join("; ")
      : data.detail;
    throw new Error(detail || `Request failed: ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

/** POST a multipart form (browser sets the boundary header itself). */
async function upload(path, formData) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Your session has expired. Please sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : `Upload failed: ${res.status}`,
    );
  }
  return data;
}

// `auth: false` is passed as a trailing options object (e.g. register, which
// has no token yet); every other call keeps the wrapper's default behavior.
export const api = {
  get: (path, opts) => request(path, { ...opts }),
  post: (path, body, opts) => request(path, { method: "POST", body, ...opts }),
  patch: (path, body, opts) => request(path, { method: "PATCH", body, ...opts }),
  put: (path, body, opts) => request(path, { method: "PUT", body, ...opts }),
  del: (path, opts) => request(path, { method: "DELETE", ...opts }),
  upload,
};

/**
 * WebSocket URL for a same-origin path, e.g. "/api/groups/1/ws".
 *
 * A browser can't set an Authorization header on a WebSocket handshake, so
 * the backend takes the JWT as a `token` query param instead (see
 * docs/ARCHITECTURE.md, "Phase 2 specifics") — hence the second argument.
 */
export function wsUrl(path, token) {
  const origin = BASE_URL
    ? new URL(BASE_URL, window.location.origin)
    : new URL(window.location.href);
  const scheme = origin.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(path, origin);
  url.protocol = scheme;
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

/** The stored JWT, for the WebSocket handshake. */
export function authToken() {
  return localStorage.getItem("token");
}

// The one request that isn't JSON: POST /api/users/token is form-encoded
// (OAuth2PasswordRequestForm), so it bypasses the wrapper entirely.
export async function requestToken(email, password) {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE_URL}/api/users/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Incorrect email or password");
  return res.json();
}

export { BASE_URL };
