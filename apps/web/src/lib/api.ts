import axios from 'axios';
import { supabase } from '@/lib/supabase';

const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api`,
  timeout: 15_000,
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
