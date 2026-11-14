'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearInterviewData, getInterviewCapabilities, getInterviewData } from '@/lib/interview/api';
import type { InterviewMockData } from '@/lib/interview/types';

type InterviewContextValue = {
  data: InterviewMockData | null;
  aiAvailable: boolean;
  loading: boolean;
  loadError: string;
  refresh: () => Promise<void>;
  run: <T>(action: () => Promise<T>) => Promise<T>;
  clearAll: () => Promise<void>;
};

const InterviewContext = createContext<InterviewContextValue | null>(null);

export function InterviewProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<InterviewMockData | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextData, capabilities] = await Promise.all([getInterviewData(), getInterviewCapabilities()]);
      setData(nextData);
      setAiAvailable(capabilities.aiAvailable);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'INTERVIEW_RESOURCE_NOT_FOUND');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    try {
      const result = await action();
      setData(await getInterviewData());
      setLoadError('');
      return result;
    } catch (error) {
      try {
        setData(await getInterviewData());
        setLoadError('');
      } catch (refreshError) {
        setLoadError(refreshError instanceof Error ? refreshError.message : 'INTERVIEW_RESOURCE_NOT_FOUND');
      }
      throw error;
    }
  }, []);

  const clearAll = useCallback(async () => {
    await run(clearInterviewData);
  }, [run]);

  const value = useMemo(
    () => ({ data, aiAvailable, loading, loadError, refresh, run, clearAll }),
    [data, aiAvailable, loading, loadError, refresh, run, clearAll],
  );

  return <InterviewContext.Provider value={value}>{children}</InterviewContext.Provider>;
}

export function useInterview() {
  const context = useContext(InterviewContext);
  if (!context) throw new Error('useInterview must be used within InterviewProvider');
  return context;
}
