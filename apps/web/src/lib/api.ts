import axios from 'axios';
import { supabase } from '@/lib/supabase';

const raw = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
// If no external API URL is set, use same-origin (/api)
const base = raw || '';
const api = axios.create({
  baseURL: `${base}/api`,
  timeout: 25_000,
});

api.interceptors.request.use(async (config) => {
  if (typeof window === 'undefined') return config;
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export default api;
