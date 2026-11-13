'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  clearInterviewData,
  getInterviewData,
  resetInterviewDemoData,
  simulateNextAiFailure,
} from '@/lib/interview/mock';
import type { InterviewMockData } from '@/lib/interview/types';

type InterviewContextValue = {
  data: InterviewMockData | null;
  loading: boolean;
  loadError: string;
  refresh: () => Promise<void>;
  run: <T>(action: () => Promise<T>) => Promise<T>;
  clearAll: () => Promise<void>;
  resetDemo: () => Promise<void>;
  failNextAi: () => void;
};

const InterviewContext = createContext<InterviewContextValue | null>(null);

function readCurrentData() {
  return getInterviewData({ delay: false });
}

export function InterviewProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<InterviewMockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setData(await getInterviewData());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'MOCK_DATA_INVALID');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    const result = await action();
    setData(await readCurrentData());
    setLoadError('');
    return result;
  }, []);

  const clearAll = useCallback(async () => {
    await run(clearInterviewData);
  }, [run]);

  const resetDemo = useCallback(async () => {
    await run(resetInterviewDemoData);
  }, [run]);

  const value = useMemo(
    () => ({ data, loading, loadError, refresh, run, clearAll, resetDemo, failNextAi: simulateNextAiFailure }),
    [data, loading, loadError, refresh, run, clearAll, resetDemo],
  );

  return <InterviewContext.Provider value={value}>{children}</InterviewContext.Provider>;
}

export function useInterview() {
  const context = useContext(InterviewContext);
  if (!context) throw new Error('useInterview must be used within InterviewProvider');
  return context;
}
