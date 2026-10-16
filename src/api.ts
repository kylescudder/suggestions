export type Suggestion = {
  id: number;
  title: string;
  description: string;
  status: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
};

export type Stats = Record<
  "all" | "pending" | "reviewed" | "implemented" | "rejected",
  number
>;

declare global {
  interface Window {
    Clerk?: { session?: { getToken: () => Promise<string | null> } | null };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await window.Clerk?.session?.getToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export const api = {
  me: () => request<{ isAdmin: boolean }>("/me"),
  listSuggestions: (status?: string) =>
    request<Suggestion[]>(
      `/suggestions${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  getStats: () => request<Stats>("/suggestions/stats"),
  createSuggestion: (body: {
    title: string;
    description: string;
    authorName?: string;
    authorEmail?: string;
  }) =>
    request<{ id: number }>("/suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStatus: (id: number, status: string) =>
    request<void>(`/suggestions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
