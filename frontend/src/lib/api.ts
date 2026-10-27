import type { Task, TaskInput, TaskStatus, User } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// The access token lives in memory only. The refresh token is an httpOnly cookie
// that the browser sends to /api/auth automatically, so JavaScript never sees it.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? "Request failed");
  }
  return body as T;
}

// Refresh tokens are single-use on the server, so concurrent 401s must share one refresh call.
let refreshPromise: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          accessToken = null;
          return false;
        }
        const body = (await res.json()) as { accessToken: string };
        accessToken = body.accessToken;
        return true;
      })
      .catch(() => {
        accessToken = null;
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, init, false);
  }
  return parseResponse<T>(res);
}

interface AuthResponse {
  user: User;
  accessToken: string;
}

export async function registerUser(name: string, email: string, password: string) {
  const data = await request<AuthResponse>(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify({ name, email, password }) },
    false,
  );
  accessToken = data.accessToken;
  return data.user;
}

export async function loginUser(email: string, password: string) {
  const data = await request<AuthResponse>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    false,
  );
  accessToken = data.accessToken;
  return data.user;
}

export async function logoutUser() {
  try {
    await request<void>("/api/auth/logout", { method: "POST" }, false);
  } finally {
    accessToken = null;
  }
}

export async function listTasks(status?: TaskStatus) {
  const query = status ? `?status=${status}` : "";
  const data = await request<{ tasks: Task[] }>(`/api/tasks${query}`);
  return data.tasks;
}

export async function createTask(input: TaskInput) {
  const data = await request<{ task: Task }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function updateTask(id: string, input: Partial<TaskInput>) {
  const data = await request<{ task: Task }>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function deleteTask(id: string) {
  await request<void>(`/api/tasks/${id}`, { method: "DELETE" });
}
