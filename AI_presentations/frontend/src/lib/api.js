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
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(1000, Number(options.timeoutMs)) : 120000;
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(includeAuth ? authHeaders() : {}),
    ...(options.headers || {}),
  };

  async function doFetch(reqHeaders) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = options.signal;
    const onAbort = () => controller.abort();
    if (externalSignal instanceof AbortSignal) {
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      return await fetch(buildUrl(path), {
        credentials: "include",
        ...options,
        headers: reqHeaders,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal instanceof AbortSignal) {
        externalSignal.removeEventListener("abort", onAbort);
      }
    }
  }

  let response;
  try {
    response = await doFetch(headers);
  } catch (e) {
    // Dev servers may briefly drop connections during hot reload/restart.
    // Retry once before surfacing a network error to the user.
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      response = await doFetch(headers);
    } catch (retryErr) {
      const raw = String(retryErr?.message || retryErr || "");
      const timeoutLike = retryErr?.name === "AbortError" || raw.includes("AbortError");
      const isNet =
        raw.includes("Failed to fetch") || raw.includes("NetworkError") || raw.includes("Load failed");
      const msg = timeoutLike
        ? "Сервер отвечает слишком долго. Попробуйте ещё раз — обычно помогает повторный запуск."
        : isNet
          ? "Не получилось связаться с сервером. Проверьте интернет и попробуйте снова чуть позже."
          : raw
            ? "Сейчас запрос не прошёл. Попробуйте ещё раз через минуту."
            : "Сеть недоступна. Попробуйте чуть позже.";
      const err = new Error(msg);
      err.status = 0;
      err.data = {};
      throw err;
    }
  }

  if (response.status === 401 && includeAuth && getRefreshToken()) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      const retryHeaders = {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...authHeaders(),
        ...(options.headers || {}),
      };
      response = await doFetch(retryHeaders);
    } else {
      clearTokens();
    }
  }

  return response;
}

/** Не показывать пользователю HTML-страницы ошибок Django / прокси. */
function isLikelyHtmlErrorBody(text) {
  const s = String(text || "").trimStart().slice(0, 500);
  if (!s) return false;
  if (/^<!DOCTYPE/i.test(s) || /^<html/i.test(s)) return true;
  if (s.includes("<title>") && s.includes("</title>")) return true;
  return false;
}

/** Убрать из ответа API слишком «технические» или длинные фразы для экрана пользователя. */
function sanitizeServerMessage(text) {
  if (typeof text !== "string") return "";
  let t = text.trim();
  if (!t) return "";
  if (isLikelyHtmlErrorBody(t)) return "";
  const low = t.toLowerCase();
  if (
    low.includes("operationalerror") ||
    low.includes("integrityerror") ||
    low.includes("traceback") ||
    low.includes("django.db") ||
    low.includes("internal server error") ||
    low.includes("syntaxerror")
  ) {
    return "";
  }
  if (t.length > 200) t = `${t.slice(0, 197)}…`;
  return t;
}

function messageForHttpStatus(status) {
  if (status === 401) return "Нужно войти ещё раз или проверить email и пароль.";
  if (status === 403) return "Это действие сейчас недоступно на вашем аккаунте.";
  if (status === 404) return "Ничего не нашли — возможно, ссылка устарела или запись удалена.";
  if (status === 408 || status === 504) return "Сервер долго не отвечал. Попробуйте снова через минуту.";
  if (status === 429) return "Слишком частые запросы или лимит по тарифу. Подождите немного.";
  if (status >= 500) return "Сервис временно не отвечает. Попробуйте чуть позже — обычно это быстро проходит.";
  if (status >= 400) return "Запрос не выполнился. Если так повторится, напишите нам в поддержку.";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

/** Извлечь человекочитаемое сообщение из тела ошибки DRF / Django. */
function pickApiErrorMessage(data) {
  if (!data || typeof data !== "object") return "";
  const d = data.detail;
  if (typeof d === "string" && d.trim()) {
    const cleaned = sanitizeServerMessage(d);
    return cleaned;
  }
  if (Array.isArray(d) && d.length) return sanitizeServerMessage(String(d[0] ?? ""));
  if (typeof d === "object" && d !== null && !Array.isArray(d)) {
    const key = Object.keys(d)[0];
    if (key) {
      const v = d[key];
      if (Array.isArray(v) && v.length) return sanitizeServerMessage(`${key}: ${v[0]}`);
      if (typeof v === "string") return sanitizeServerMessage(`${key}: ${v}`);
    }
  }
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
    return sanitizeServerMessage(String(data.non_field_errors[0]));
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
        const err = new Error("Ответ сервера пришёл в неожиданном формате. Обновите страницу и попробуйте снова.");
        err.status = response.status;
        err.data = { raw: rawText.slice(0, 200) };
        throw err;
      }
      const trimmed = rawText.trim();
      if (isLikelyHtmlErrorBody(trimmed)) {
        data = { detail: "" };
      } else {
        const snippet = sanitizeServerMessage(trimmed.slice(0, 400));
        data = { detail: snippet || "" };
      }
    }
  }

  if (!response.ok) {
    const picked = pickApiErrorMessage(data);
    const message = picked || messageForHttpStatus(response.status);
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

/** Create an empty presentation and navigate the user to its editor. */
export async function createEmptyPresentationAndOpen(options = {}) {
  if (!getAccessToken()) {
    const err = new Error("Войдите в аккаунт, чтобы создать новую презентацию.");
    err.status = 401;
    throw err;
  }
  const data = await apiJson("/api/presentations/", {
    method: "POST",
    body: JSON.stringify({
      title: options.title || "Без названия",
      theme: options.theme || "light",
    }),
  });
  navigate(`/presentation/${data.id}`);
  return data;
}
