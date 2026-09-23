import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  Project,
  Asset,
  GenerationJob,
  ModelCapability,
  JobType,
} from '../types';
import { api, setApiUserId } from '../services/api';

export type NavPage =
  | 'home'
  | 'create'
  | 'projects'
  | 'flow'
  | 'sequences'
  | 'generations'
  | 'assets'
  | 'favorites'
  | 'batch'
  | 'settings';

interface CreatePrefillData {
  mode?: JobType;
  prompt?: string;
  sourceAsset?: Asset;
  referenceAssets?: string[];
  aspectRatio?: string;
}

interface AppContextType {
  user: User | null;
  allUsers: User[];
  switchUser: (id: string) => Promise<void>;
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (p: Project | null) => void;
  createProject: (name: string, description?: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  models: ModelCapability[];
  assets: Asset[];
  refreshAssets: () => Promise<void>;
  jobs: GenerationJob[];
  activeJobsCount: number;
  queueDrawerOpen: boolean;
  setQueueDrawerOpen: (open: boolean) => void;
  activeNav: NavPage;
  setActiveNav: (nav: NavPage) => void;
  creationMode: JobType;
  setCreationMode: (mode: JobType) => void;
  activeMediaAsset: Asset | null;
  setActiveMediaAsset: (asset: Asset | null) => void;
  prefillData: CreatePrefillData | null;
  setPrefillData: (data: CreatePrefillData | null) => void;
  sendToCreate: (data: CreatePrefillData) => void;
  submitGeneration: (payload: any) => Promise<GenerationJob[]>;
  cancelJob: (jobId: string) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  toggleFavorite: (assetId: string) => Promise<void>;
  deleteAsset: (assetId: string) => Promise<void>;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [models, setModels] = useState<ModelCapability[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavPage>('create');
  const [creationMode, setCreationMode] = useState<JobType>('image');
  const [activeMediaAsset, setActiveMediaAsset] = useState<Asset | null>(null);
  const [prefillData, setPrefillData] = useState<CreatePrefillData | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4000);
  }, []);

  // Fetch initial profile & metadata
  const loadInitialData = useCallback(async () => {
    try {
      const [uRes, usersRes, pRes, mRes] = await Promise.all([
        api.getMe(),
        api.getUsers(),
        api.getProjects(),
        api.getModels(),
      ]);

      setUser(uRes.user);
      setAllUsers(usersRes.users);
      setProjects(pRes.projects);
      setModels(mRes.models);

      if (pRes.projects.length > 0) {
        setActiveProject(pRes.projects[0]);
      }
    } catch (err: any) {
      console.error('Failed to load initial studio data:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Refresh assets
  const refreshAssets = useCallback(async () => {
    try {
      const res = await api.getAssets({ projectId: activeProject?.id });
      setAssets(res.assets);
    } catch (err) {
      console.error('Failed to load assets:', err);
    }
  }, [activeProject]);

  useEffect(() => {
    refreshAssets();
  }, [refreshAssets]);

  // Poll generation jobs every 2 seconds
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await api.getJobs(activeProject?.id);
        setJobs(res.jobs);
      } catch (err) {
        // ignore polling error
      }
    };

    fetchJobs();
    const interval = setInterval(fetchJobs, 2000);
    return () => clearInterval(interval);
  }, [activeProject]);

  // Switch user account for ownership testing
  const switchUser = async (newUserId: string) => {
    try {
      setApiUserId(newUserId);
      const res = await api.switchUser(newUserId);
      setUser(res.user);
      const pRes = await api.getProjects();
      setProjects(pRes.projects);
      setActiveProject(pRes.projects[0] || null);
      const aRes = await api.getAssets({ projectId: pRes.projects[0]?.id });
      setAssets(aRes.assets);
      const jRes = await api.getJobs(pRes.projects[0]?.id);
      setJobs(jRes.jobs);
      showToast(`Switched account to ${res.user.name} (${res.user.role})`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to switch user');
    }
  };

  const createProject = async (name: string, description?: string) => {
    const res = await api.createProject(name, description);
    setProjects((prev) => [res.project, ...prev]);
    setActiveProject(res.project);
    showToast(`Created project "${res.project.name}"`);
    return res.project;
  };

  const deleteProject = async (id: string) => {
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProject?.id === id) {
      const remaining = projects.filter((p) => p.id !== id);
      setActiveProject(remaining[0] || null);
    }
    showToast('Project deleted');
  };

  const submitGeneration = async (payload: any) => {
    const res = await api.createJob({
      ...payload,
      projectId: activeProject?.id,
    });
    setJobs((prev) => [...res.jobs, ...prev]);
    if (user && res.remainingCredits !== undefined) {
      setUser({ ...user, credits: res.remainingCredits });
    }
    showToast(`Launched ${res.jobs.length} generation job${res.jobs.length > 1 ? 's' : ''}`);
    return res.jobs;
  };

  const cancelJob = async (jobId: string) => {
    try {
      await api.cancelJob(jobId);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'cancelled' as const } : j))
      );
      // Refresh user credits
      const uRes = await api.getMe();
      setUser(uRes.user);
      showToast('Generation cancelled');
    } catch (err: any) {
      showToast(err?.message || 'Failed to cancel job');
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      const res = await api.retryJob(jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? res.job : j)));
      const uRes = await api.getMe();
      setUser(uRes.user);
      showToast('Generation job queued for retry');
    } catch (err: any) {
      showToast(err?.message || 'Failed to retry job');
    }
  };

  const toggleFavorite = async (assetId: string) => {
    try {
      const res = await api.toggleFavorite(assetId);
      setAssets((prev) => prev.map((a) => (a.id === assetId ? res.asset : a)));
      if (activeMediaAsset?.id === assetId) {
        setActiveMediaAsset(res.asset);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to toggle favorite');
    }
  };

  const deleteAsset = async (assetId: string) => {
    try {
      await api.deleteAsset(assetId);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      if (activeMediaAsset?.id === assetId) {
        setActiveMediaAsset(null);
      }
      showToast('Asset deleted from library');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete asset');
    }
  };

  const sendToCreate = (data: CreatePrefillData) => {
    setPrefillData(data);
    if (data.mode) {
      setCreationMode(data.mode);
    }
    setActiveNav('create');
    showToast(`Loaded asset into ${data.mode || 'Create'} mode`);
  };

  const activeJobsCount = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'preparing' || j.status === 'generating' || j.status === 'processing'
  ).length;

  return (
    <AppContext.Provider
      value={{
        user,
        allUsers,
        switchUser,
        projects,
        activeProject,
        setActiveProject,
        createProject,
        deleteProject,
        models,
        assets,
        refreshAssets,
        jobs,
        activeJobsCount,
        queueDrawerOpen,
        setQueueDrawerOpen,
        activeNav,
        setActiveNav,
        creationMode,
        setCreationMode,
        activeMediaAsset,
        setActiveMediaAsset,
        prefillData,
        setPrefillData,
        sendToCreate,
        submitGeneration,
        cancelJob,
        retryJob,
        toggleFavorite,
        deleteAsset,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside an AppProvider');
  return ctx;
}
