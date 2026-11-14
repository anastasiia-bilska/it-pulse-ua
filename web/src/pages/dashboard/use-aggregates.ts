// Loads aggregates.json once, with a retry for the error state.
import { useCallback, useEffect, useState } from 'react';
import { loadAggregates, type Aggregates } from '../../entities/aggregates/index.ts';

// ---- types -------------------------------------------------------------------------------------

export type AggregatesState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; aggregates: Aggregates };

// ---- functions ---------------------------------------------------------------------------------

export function useAggregates(): { state: AggregatesState; retry: () => void } {
  const [state, setState] = useState<AggregatesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // A retry or an unmount makes an older response stale; it must not overwrite newer state.
    let isCurrent = true;
    async function load(): Promise<void> {
      const next = await settle();
      if (isCurrent) {
        setState(next);
      }
    }
    void load();
    return () => {
      isCurrent = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((count) => count + 1);
  }, []);

  return { state, retry };
}

async function settle(): Promise<AggregatesState> {
  try {
    return { status: 'ready', aggregates: await loadAggregates() };
  } catch (error) {
    console.error(error);
    return { status: 'error' };
  }
}
