import {
  User,
  Project,
  Asset,
  GenerationJob,
  Flow,
  SequenceProject,
  ModelCapability,
  CreditTransaction,
  AdminMetrics,
} from '../types';

let currentUserId = 'user-default';

export function setApiUserId(userId: string) {
  currentUserId = userId;
}

export function getApiUserId() {
  return currentUserId;
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('x-user-id', currentUserId);

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorDetail = `Request failed: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) errorDetail = body.error;
    } catch (_) {}
    throw new Error(errorDetail);
  }
  return res.json();
}

export const api = {
  // Auth & Users
  getMe: () => fetchJson<{ user: User }>('/api/auth/me'),
  getUsers: () => fetchJson<{ users: User[] }>('/api/auth/users'),
  switchUser: (userId: string) => fetchJson<{ user: User }>('/api/auth/switch', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  }),

  // Projects
  getProjects: () => fetchJson<{ projects: Project[] }>('/api/projects'),
  createProject: (name: string, description?: string) =>
    fetchJson<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  deleteProject: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  // Models
  getModels: () => fetchJson<{ models: ModelCapability[] }>('/api/models'),

  // Prompt Intelligence
  enhancePrompt: (prompt: string, mode?: string) =>
    fetchJson<{ enhancedPrompt: string }>('/api/prompts/enhance', {
      method: 'POST',
      body: JSON.stringify({ prompt, mode }),
    }),

  // Jobs
  getJobs: (projectId?: string) =>
    fetchJson<{ jobs: GenerationJob[] }>(`/api/jobs${projectId ? `?projectId=${projectId}` : ''}`),
  getJob: (id: string) => fetchJson<{ job: GenerationJob }>(`/api/jobs/${id}`),
  createJob: (payload: any) =>
    fetchJson<{ jobs: GenerationJob[]; remainingCredits: number }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancelJob: (id: string) =>
    fetchJson<{ success: boolean; status: string }>(`/api/jobs/${id}/cancel`, {
      method: 'POST',
    }),
  retryJob: (id: string) =>
    fetchJson<{ success: boolean; job: GenerationJob }>(`/api/jobs/${id}/retry`, {
      method: 'POST',
    }),

  // Assets
  getAssets: (params?: { projectId?: string; type?: string; search?: string; favorite?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.projectId) query.set('projectId', params.projectId);
    if (params?.type) query.set('type', params.type);
    if (params?.search) query.set('search', params.search);
    if (params?.favorite) query.set('favorite', 'true');
    return fetchJson<{ assets: Asset[] }>(`/api/assets?${query.toString()}`);
  },
  getAsset: (id: string) => fetchJson<{ asset: Asset }>(`/api/assets/${id}`),
  toggleFavorite: (id: string) =>
    fetchJson<{ asset: Asset }>(`/api/assets/${id}/favorite`, { method: 'POST' }),
  deleteAsset: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/assets/${id}`, { method: 'DELETE' }),

  // Flows
  getFlows: (projectId?: string) =>
    fetchJson<{ flows: Flow[] }>(`/api/flows${projectId ? `?projectId=${projectId}` : ''}`),
  getFlow: (id: string) => fetchJson<{ flow: Flow }>(`/api/flows/${id}`),
  saveFlow: (flow: any) =>
    fetchJson<{ flow: Flow }>('/api/flows', {
      method: 'POST',
      body: JSON.stringify(flow),
    }),
  deleteFlow: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/flows/${id}`, { method: 'DELETE' }),

  // Sequences
  getSequences: (projectId?: string) =>
    fetchJson<{ sequences: SequenceProject[] }>(`/api/sequences${projectId ? `?projectId=${projectId}` : ''}`),
  saveSequence: (sequence: any) =>
    fetchJson<{ sequence: SequenceProject }>('/api/sequences', {
      method: 'POST',
      body: JSON.stringify(sequence),
    }),

  // Credits
  getCreditHistory: () =>
    fetchJson<{ balance: number; history: CreditTransaction[] }>('/api/credits/history'),

  // Admin
  getAdminMetrics: () => fetchJson<{ metrics: AdminMetrics }>('/api/admin/metrics'),
};
