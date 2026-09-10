import type { FileNode } from "@/types/file";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const TOKEN_KEY = "fcb_token";

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type TextFilePayload = { path: string; content: string };
export type BinaryFilePayload = {
  path: string;
  binary: true;
  size: number;
  image: boolean;
};
export type FilePayload = TextFilePayload | BinaryFilePayload;

export interface SessionResponse {
  token: string;
  user: User;
}

export interface StartBuildResponse {
  logs: string;
  preview: string;
}

export interface DevStartResponse {
  url: string;
  port: number;
  running: boolean;
}

export interface AIGenerateResult {
  applied: string[];
  source: "ai" | "fallback";
  logs: string[];
}

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.detail || err.message;
  }
  if (err instanceof TypeError) {
    return "Cannot reach the server. Is the backend running?";
  }
  return err instanceof Error ? err.message : String(err);
}

// ---- token storage (localStorage) ----

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

// ---- global 401 handler ----

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.message === "string") return body.message;
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

/**
 * fetch with the stored Bearer token attached. On a 401 the registered
 * unauthorized handler (set by AuthProvider) is invoked so the app can
 * bounce back to the auth card.
 */
export async function authedFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(401, "Unauthorized", "Your session has expired. Please sign in again.");
  }
  return res;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed (${res.status})`, await readError(res));
  }
  return (await res.json()) as T;
}

// ---- SSE body reader (auth-usable; EventSource cannot send headers) ----

/**
 * Read a text/event-stream response body line by line and invoke `onData`
 * with the payload of every `data:` field. Resolves once the stream ends.
 */
export async function consumeSSE(
  res: Response,
  onData: (dataLine: string) => void
): Promise<void> {
  if (!res.body) {
    throw new ApiError(res.status ?? 0, "Response has no body");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitEvent = (rawEvent: string) => {
    const dataLine = rawEvent
      .split("\n")
      .find((l) => l.startsWith("data:"))
      ?.slice(5)
      .trim();
    if (dataLine) onData(dataLine);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx >= 0) {
      emitEvent(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) emitEvent(buffer);
}

// ---- auth ----

export const authApi = {
  async register(email: string, password: string): Promise<SessionResponse> {
    return parseJson(
      await authedFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
    );
  },
  async login(email: string, password: string): Promise<SessionResponse> {
    return parseJson(
      await authedFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
    );
  },
  async logout(): Promise<void> {
    try {
      await authedFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // best-effort; local session is cleared regardless
    }
  },
  async me(): Promise<{ user: User }> {
    return parseJson(await authedFetch("/api/auth/me"));
  },
};

// ---- projects ----

export const projectsApi = {
  async list(): Promise<Project[]> {
    const data = await parseJson<{ projects: Project[] }>(
      await authedFetch("/api/projects")
    );
    return data.projects;
  },
  async create(name: string): Promise<Project> {
    const data = await parseJson<{ project: Project }>(
      await authedFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      })
    );
    return data.project;
  },
  async rename(pid: string, name: string): Promise<Project> {
    const data = await parseJson<{ project: Project }>(
      await authedFetch(`/api/projects/${pid}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      })
    );
    return data.project;
  },
  async remove(pid: string): Promise<void> {
    await parseJson<{ ok: true }>(
      await authedFetch(`/api/projects/${pid}`, { method: "DELETE" })
    );
  },
};

// ---- project files ----

export const filesApi = {
  async tree(pid: string): Promise<FileNode[]> {
    const data = await parseJson<{ files: FileNode[] }>(
      await authedFetch(`/api/projects/${pid}/files`)
    );
    return data.files;
  },
  async read(pid: string, path: string): Promise<FilePayload> {
    const qs = new URLSearchParams({ path });
    return parseJson<FilePayload>(
      await authedFetch(`/api/projects/${pid}/file?${qs.toString()}`)
    );
  },
  async write(pid: string, path: string, content: string): Promise<void> {
    await parseJson<{ ok: true }>(
      await authedFetch(`/api/projects/${pid}/file`, {
        method: "PUT",
        body: JSON.stringify({ path, content }),
      })
    );
  },
  async remove(pid: string, path: string): Promise<void> {
    const qs = new URLSearchParams({ path });
    await parseJson<{ ok: true }>(
      await authedFetch(`/api/projects/${pid}/file?${qs.toString()}`, {
        method: "DELETE",
      })
    );
  },
  async rename(pid: string, path: string, newPath: string): Promise<void> {
    await parseJson<{ ok: true }>(
      await authedFetch(`/api/projects/${pid}/file/rename`, {
        method: "POST",
        body: JSON.stringify({ path, newPath }),
      })
    );
  },
  async createFolder(pid: string, path: string): Promise<void> {
    await parseJson<{ ok: true }>(
      await authedFetch(`/api/projects/${pid}/folder`, {
        method: "POST",
        body: JSON.stringify({ path }),
      })
    );
  },
  async rawBlob(pid: string, path: string): Promise<Blob> {
    const qs = new URLSearchParams({ path });
    const res = await authedFetch(`/api/projects/${pid}/raw?${qs.toString()}`);
    if (!res.ok) {
      throw new ApiError(res.status, `Download failed (${res.status})`, await readError(res));
    }
    return res.blob();
  },
};

// ---- build / dev / preview ----

export const buildApi = {
  async start(pid: string): Promise<StartBuildResponse> {
    return parseJson<StartBuildResponse>(
      await authedFetch(`/api/projects/${pid}/build`, { method: "POST" })
    );
  },
  async cancel(pid: string): Promise<void> {
    await parseJson<{ ok: true }>(
      await authedFetch(`/api/projects/${pid}/build/cancel`, { method: "POST" })
    );
  },
};

export const devApi = {
  async start(pid: string): Promise<DevStartResponse> {
    return parseJson<DevStartResponse>(
      await authedFetch(`/api/projects/${pid}/dev/start`, { method: "POST" })
    );
  },
  async hotReload(pid: string): Promise<{ ok: boolean; note?: string }> {
    return parseJson<{ ok: boolean; note?: string }>(
      await authedFetch(`/api/projects/${pid}/dev/hot-reload`, { method: "POST" })
    );
  },
  async stop(pid: string): Promise<void> {
    try {
      await parseJson<{ ok: true }>(
        await authedFetch(`/api/projects/${pid}/dev/stop`, { method: "POST" })
      );
    } catch {
      // best-effort; the process may already be gone
    }
  },
};

// ---- AI ----

export const aiApi = {
  async generateStream(
    pid: string,
    prompt: string,
    onProgress: (step: string | null, status: string) => void
  ): Promise<AIGenerateResult> {
    const res = await authedFetch(`/api/projects/${pid}/ai/generate/stream`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      throw new ApiError(res.status, `AI request failed (${res.status})`, await readError(res));
    }
    return new Promise<AIGenerateResult>((resolve, reject) => {
      consumeSSE(res, (line) => {
        if (line.startsWith("__AI_DONE__ ")) {
          try {
            const payload = JSON.parse(line.slice("__AI_DONE__ ".length)) as AIGenerateResult;
            resolve(payload);
          } catch {
            reject(new Error("AI stream returned an unreadable result."));
          }
          return;
        }
        if (line.startsWith("__AI_ERROR__ ")) {
          let detail = "AI generation failed.";
          try {
            const payload = JSON.parse(line.slice("__AI_ERROR__ ".length)) as { detail?: string };
            detail = payload.detail ?? detail;
          } catch {
            // keep default detail
          }
          reject(new ApiError(502, "AI generation failed", detail));
          return;
        }
        try {
          const ev = JSON.parse(line) as { step?: string | null; status?: string };
          if (ev && ev.status) {
            onProgress(ev.step ?? null, ev.status);
          }
        } catch {
          // ignore non-JSON progress lines
        }
      }).catch(reject);
    });
  },
};

// ---- aggregated client ----

export const api = {
  auth: authApi,
  projects: projectsApi,
  files: filesApi,
  build: buildApi,
  dev: devApi,
  ai: aiApi,
};
