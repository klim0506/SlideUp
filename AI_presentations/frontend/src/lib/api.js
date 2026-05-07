const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";


function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export function getAccessToken() {
  return window.localStorage.getItem("slidegen_access_token");
}

export function setTokens(tokens) {
  if (tokens.access) {
    window.localStorage.setItem("slidegen_access_token", tokens.access);
  }
  if (tokens.refresh) {
    window.localStorage.setItem("slidegen_refresh_token", tokens.refresh);
  }
}

export function clearTokens() {
  window.localStorage.removeItem("slidegen_access_token");
  window.localStorage.removeItem("slidegen_refresh_token");
}

function getRefreshToken() {
  return window.localStorage.getItem("slidegen_refresh_token");
}

/** POST refresh; on success writes new tokens via setTokens. */
async function tryRefreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const response = await fetch(buildUrl("/api/auth/refresh/"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.access) return false;
    setTokens(data);
    return true;
  } catch {
    return false;
  }
}

export function authHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path, options = {}) {
  const includeAuth = options.includeAuth !== false;
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(includeAuth ? authHeaders() : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(buildUrl(path), {
      credentials: "include",
      ...options,
      headers,
    });
  } catch (e) {
    const raw = String(e?.message || e || "");
    const hint =
      raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("Load failed")
        ? " Нет ответа от сервера: запустите Django (например http://127.0.0.1:8000), проверьте прокси Vite для /api или переменную VITE_API_BASE_URL."
        : "";
    const err = new Error(`${raw || "Ошибка сети"}${hint}`);
    err.status = 0;
    err.data = {};
    throw err;
  }

  if (response.status === 401 && includeAuth && getRefreshToken()) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      const retryHeaders = {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...authHeaders(),
        ...(options.headers || {}),
      };
      response = await fetch(buildUrl(path), {
        credentials: "include",
        ...options,
        headers: retryHeaders,
      });
    } else {
      clearTokens();
    }
  }

  return response;
}

/** Извлечь человекочитаемое сообщение из тела ошибки DRF / Django. */
function pickApiErrorMessage(data) {
  if (!data || typeof data !== "object") return "";
  const d = data.detail;
  if (typeof d === "string" && d.trim()) return d.trim();
  if (Array.isArray(d) && d.length) return String(d[0] ?? "").trim();
  if (typeof d === "object" && d !== null && !Array.isArray(d)) {
    const key = Object.keys(d)[0];
    if (key) {
      const v = d[key];
      if (Array.isArray(v) && v.length) return `${key}: ${v[0]}`;
      if (typeof v === "string") return `${key}: ${v}`;
    }
  }
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
    return String(data.non_field_errors[0]);
  }
  return "";
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const rawText = await response.text();

  let data = {};
  if (rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      if (response.ok) {
        const err = new Error("Сервер вернул ответ, который не удалось разобрать как JSON.");
        err.status = response.status;
        err.data = { raw: rawText.slice(0, 200) };
        throw err;
      }
      const snippet = rawText.trim().slice(0, 400);
      data = { detail: snippet || `Ошибка (HTTP ${response.status})` };
    }
  }

  if (!response.ok) {
    const picked = pickApiErrorMessage(data);
    const serverHint =
      response.status >= 500
        ? " Проверьте логи бэкенда; после обновления кода часто нужно: python manage.py migrate"
        : "";
    const message =
      picked ||
      (response.status
        ? `Запрос не выполнен (HTTP ${response.status}).${serverHint}`
        : "Не удалось выполнить запрос. Попробуйте позже.");
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function login(email, password) {
  const tokens = await apiJson("/api/auth/login/", {
    method: "POST",
    includeAuth: false,
    body: JSON.stringify({ email, password }),
  });
  setTokens(tokens);
  return tokens;
}

export async function register(email, password) {
  await apiJson("/api/auth/register/", {
    method: "POST",
    includeAuth: false,
    body: JSON.stringify({ email, password }),
  });
  return login(email, password);
}

export async function loginWithGoogle(credential) {
  const tokens = await apiJson("/api/auth/google/", {
    method: "POST",
    includeAuth: false,
    body: JSON.stringify({ credential }),
  });
  setTokens(tokens);
  return tokens;
}

export async function getMe() {
  if (!getAccessToken()) {
    return null;
  }
  return apiJson("/api/auth/me/");
}

export function logout() {
  clearTokens();
  navigate("/");
}

export function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
