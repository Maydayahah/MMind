import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 修改为你电脑的局域网 IP（运行 ipconfig 查看）
export const API_BASE = 'http://172.31.105.63:8001';
const USER_ID_KEY = 'mmind:user-id';

export const api = axios.create({ baseURL: API_BASE, timeout: 30000 });

async function getUserId() {
  const existing = await AsyncStorage.getItem(USER_ID_KEY);
  if (existing) return existing;

  const userId = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(USER_ID_KEY, userId);
  return userId;
}

api.interceptors.request.use(async (config) => {
  config.headers.set('X-User-Id', await getUserId());
  return config;
});

export const VOICE_PLACEHOLDER = '[语音处理中]';

export interface Thought {
  id: number;
  content: string;
  tags: string;
  images: string;    // JSON array string: '["uri1","uri2"]'
  location: string;  // JSON string: '{"lat":31.2,"lng":121.4,"name":"上海"}'
  audio: string;     // 本地音频 URI，用于回放
  created_at: string;
}

export interface Collection {
  id: number;
  title: string;
  theme: string;
  content: string;
  thought_ids: string;
  period: string;
  created_at: string;
}

export interface Stats {
  total_thoughts: number;
  total_collections: number;
  streak_days: number;
  theme_distribution: Record<string, number>;
  insight: string;
}

interface Store {
  thoughts: Thought[];
  collections: Collection[];
  setThoughts: (t: Thought[]) => void;
  setCollections: (c: Collection[]) => void;
  addThought: (t: Thought) => void;
  removeThought: (id: number) => void;
  removeThoughts: (ids: number[]) => void;
  updateThought: (t: Thought) => void;
  updateCollection: (c: Collection) => void;
  removeCollection: (id: number) => void;
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      thoughts: [],
      collections: [],
      setThoughts: (thoughts) => set({ thoughts }),
      setCollections: (collections) => set({ collections }),
      addThought: (t) => set((s) => ({ thoughts: [t, ...s.thoughts] })),
      removeThought: (id) =>
        set((s) => ({ thoughts: s.thoughts.filter((t) => t.id !== id) })),
      removeThoughts: (ids) =>
        set((s) => ({ thoughts: s.thoughts.filter((t) => !ids.includes(t.id)) })),
      updateThought: (updated) =>
        set((s) => ({ thoughts: s.thoughts.map((t) => t.id === updated.id ? updated : t) })),
      updateCollection: (updated) =>
        set((s) => ({ collections: s.collections.map((c) => c.id === updated.id ? updated : c) })),
      removeCollection: (id) =>
        set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),
    }),
    {
      name: 'mmind-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
