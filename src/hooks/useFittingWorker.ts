/**
 * React hook for using the fitting worker
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FitFermiEdgeMessage,
  EstimateIRFMessage,
  WorkerIncomingMessage,
  WorkerOutgoingMessage,
} from '../workers/fitting.worker';
import type { IRFEstimationResult } from '../lib/fitting';
import { defaultIRFBounds } from '../lib/fitting';
import type { FermiFitOptions, FermiFitResult } from '../lib/fermiEdge';

export interface FittingProgress {
  iteration: number;
  fitness: number;
  progress: number;
}

export interface UseFittingWorkerResult {
  // State
  isRunning: boolean;
  progress: FittingProgress | null;
  error: string | null;

  // Fermi edge fitting (x: eV, occupied side at lower values). A new call
  // replaces one still running, so the latest settings always win.
  fitFermiEdge: (x: number[], y: number[], options: FermiFitOptions) => Promise<FermiFitResult>;

  // IRF parameter estimation
  estimateIRF: (
    observedSpectrum: number[],
    temp: number,
    bounds?: typeof defaultIRFBounds,
    maxIterations?: number
  ) => Promise<IRFEstimationResult>;

  // Cancel current operation
  cancel: () => void;
}

let messageIdCounter = 0;
function generateId(): string {
  return `msg_${Date.now()}_${messageIdCounter++}`;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export function useFittingWorker(): UseFittingWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<FittingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef<PendingRequest | null>(null);
  const currentIdRef = useRef<string | null>(null);

  const finish = useCallback((errorMessage: string | null) => {
    setIsRunning(false);
    setProgress(null);
    if (errorMessage) setError(errorMessage);
    currentIdRef.current = null;
  }, []);

  // A worker with its handlers attached. Used at mount and after cancel, so
  // a cancelled worker is never replaced by one that nobody listens to.
  const createWorker = useCallback((): Worker => {
    const worker = new Worker(
      new URL('../workers/fitting.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
      const message = event.data;

      // Ignore messages for old requests
      if (message.id !== currentIdRef.current) {
        return;
      }

      switch (message.type) {
        case 'progress':
          setProgress({
            iteration: message.iteration,
            fitness: message.fitness,
            progress: message.progress,
          });
          break;

        case 'result':
          finish(null);
          pendingRef.current?.resolve(message.result);
          pendingRef.current = null;
          break;

        case 'error':
          finish(message.error);
          pendingRef.current?.reject(new Error(message.error));
          pendingRef.current = null;
          break;
      }
    };

    worker.onerror = (event) => {
      console.error('Worker error:', event);
      finish(event.message || 'Worker error');
      pendingRef.current?.reject(new Error(event.message));
      pendingRef.current = null;
    };

    return worker;
  }, [finish]);

  // Initialize worker
  useEffect(() => {
    workerRef.current = createWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [createWorker]);

  const send = useCallback(<T,>(build: (id: string) => WorkerIncomingMessage, supersede = false): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      if (currentIdRef.current) {
        if (!supersede) {
          reject(new Error('Another operation is in progress'));
          return;
        }
        // Drop the running request: restart the worker and reject its promise
        workerRef.current.terminate();
        workerRef.current = createWorker();
        pendingRef.current?.reject(new Error('Superseded'));
        pendingRef.current = null;
      }

      const id = generateId();
      currentIdRef.current = id;
      pendingRef.current = { resolve: v => resolve(v as T), reject };
      setIsRunning(true);
      setError(null);
      setProgress(null);
      workerRef.current.postMessage(build(id));
    });
  }, [createWorker]);

  const fitFermiEdge = useCallback(
    (x: number[], y: number[], options: FermiFitOptions) =>
      send<FermiFitResult>(id => ({ type: 'fitFermiEdge', id, x, y, options }) satisfies FitFermiEdgeMessage, true),
    [send]
  );

  const estimateIRF = useCallback(
    (
      observedSpectrum: number[],
      temp: number,
      bounds: typeof defaultIRFBounds = defaultIRFBounds,
      maxIterations: number = 50
    ) =>
      send<IRFEstimationResult>(id => ({
        type: 'estimateIRF',
        id,
        observedSpectrum,
        temp,
        bounds,
        maxIterations,
      }) satisfies EstimateIRFMessage),
    [send]
  );

  const cancel = useCallback(() => {
    if (!currentIdRef.current) return;
    // Terminate the busy worker and start a fresh one with handlers attached
    workerRef.current?.terminate();
    workerRef.current = createWorker();
    finish(null);
    pendingRef.current?.reject(new Error('Operation cancelled'));
    pendingRef.current = null;
  }, [createWorker, finish]);

  return {
    isRunning,
    progress,
    error,
    fitFermiEdge,
    estimateIRF,
    cancel,
  };
}
