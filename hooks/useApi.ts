import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 修改为你电脑的局域网 IP（运行 ipconfig 查看）
export const API_BASE = 'http://10.238.8.62:8003';

export const api = axios.create({ baseURL: API_BASE, timeout: 30000 });

export const VOICE_PLACEHOLDER = '[语音处理中]';

export interface Thought {
  id: number;
  content: string;
  tags: string;
  images: string;    // JSON array string: '["uri1","uri2"]'
  location: string;  // JSON string: '{"lat":31.2,"lng":121.4,"name":"上海"}'
  audio: string;     // 本地音频 URI，用于回放
  emotion: string;
  emotion_score: number;
  created_at: string;
}

export interface EmotionTimelineItem {
  date: string;
  avg_score: number;
  dominant: string;
  count: number;
}

export interface EmotionData {
  timeline: EmotionTimelineItem[];
  distribution: Record<string, number>;
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

// ── Auth store（不持久化，依赖 SecureStore） ─────────────────────────────────

interface AuthStore {
  isAuthenticated: boolean;
  userId: number | null;
  username: string | null;
  setAuth: (userId: number, username: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()((set) => ({
  isAuthenticated: false,
  userId: null,
  username: null,
  setAuth: (userId, username) => set({ isAuthenticated: true, userId, username }),
  clearAuth: () => set({ isAuthenticated: false, userId: null, username: null }),
}));

function decodeToken(token: string): { sub: string; username: string; exp: number } {
  const payload = token.split('.')[1];
  return JSON.parse(atob(payload));
}

export async function initAuth(): Promise<boolean> {
  // TODO: re-enable auth before production
  useAuthStore.getState().setAuth(1, 'dev');
  return true;
}

export async function saveAuthToken(token: string) {
  await SecureStore.setItemAsync('auth_token', token);
  const payload = decodeToken(token);
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  useAuthStore.getState().setAuth(parseInt(payload.sub), payload.username);
}

export async function logout() {
  await SecureStore.deleteItemAsync('auth_token');
  delete api.defaults.headers.common['Authorization'];
  useAuthStore.getState().clearAuth();
  useStore.getState().setThoughts([]);
  useStore.getState().setCollections([]);
}

// ── Data store ───────────────────────────────────────────────────────────────

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
    { storage: createJSONStorage(() => AsyncStorage) }
  )
);
