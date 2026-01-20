/**
 * React hook for using the fitting worker
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FitFermiEdgeMessage,
  EstimateIRFMessage,
  WorkerOutgoingMessage,
} from '../workers/fitting.worker';
import type { FermiEdgeFitResult, IRFEstimationResult } from '../lib/fitting';
import { defaultIRFBounds } from '../lib/fitting';

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

  // Fermi edge fitting
  fitFermiEdge: (
    energy: number[],
    observedSpectrum: number[],
    temp: number,
    fitTemp?: boolean,
    useGlobalOpt?: boolean
  ) => Promise<FermiEdgeFitResult>;

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

export function useFittingWorker(): UseFittingWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<FittingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store promise resolvers for current operation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentResolverRef = useRef<{
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const currentIdRef = useRef<string | null>(null);

  // Initialize worker
  useEffect(() => {
    // Create worker using Vite's worker import syntax
    workerRef.current = new Worker(
      new URL('../workers/fitting.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
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
          setIsRunning(false);
          setProgress(null);
          if (currentResolverRef.current) {
            currentResolverRef.current.resolve(message.result);
            currentResolverRef.current = null;
          }
          break;

        case 'error':
          setIsRunning(false);
          setProgress(null);
          setError(message.error);
          if (currentResolverRef.current) {
            currentResolverRef.current.reject(new Error(message.error));
            currentResolverRef.current = null;
          }
          break;
      }
    };

    workerRef.current.onerror = (event) => {
      console.error('Worker error:', event);
      setIsRunning(false);
      setError(event.message);
      if (currentResolverRef.current) {
        currentResolverRef.current.reject(new Error(event.message));
        currentResolverRef.current = null;
      }
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const fitFermiEdge = useCallback(
    (
      energy: number[],
      observedSpectrum: number[],
      temp: number,
      fitTemp: boolean = true,
      useGlobalOpt: boolean = true
    ): Promise<FermiEdgeFitResult> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        if (isRunning) {
          reject(new Error('Another operation is in progress'));
          return;
        }

        const id = generateId();
        currentIdRef.current = id;
        currentResolverRef.current = { resolve, reject };
        setIsRunning(true);
        setError(null);
        setProgress(null);

        const message: FitFermiEdgeMessage = {
          type: 'fitFermiEdge',
          id,
          energy,
          observedSpectrum,
          temp,
          fitTemp,
          useGlobalOpt,
        };

        workerRef.current.postMessage(message);
      });
    },
    [isRunning]
  );

  const estimateIRF = useCallback(
    (
      observedSpectrum: number[],
      temp: number,
      bounds: typeof defaultIRFBounds = defaultIRFBounds,
      maxIterations: number = 50
    ): Promise<IRFEstimationResult> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        if (isRunning) {
          reject(new Error('Another operation is in progress'));
          return;
        }

        const id = generateId();
        currentIdRef.current = id;
        currentResolverRef.current = { resolve, reject };
        setIsRunning(true);
        setError(null);
        setProgress(null);

        const message: EstimateIRFMessage = {
          type: 'estimateIRF',
          id,
          observedSpectrum,
          temp,
          bounds,
          maxIterations,
        };

        workerRef.current.postMessage(message);
      });
    },
    [isRunning]
  );

  const cancel = useCallback(() => {
    if (workerRef.current && isRunning) {
      // Terminate and recreate worker
      workerRef.current.terminate();

      workerRef.current = new Worker(
        new URL('../workers/fitting.worker.ts', import.meta.url),
        { type: 'module' }
      );

      setIsRunning(false);
      setProgress(null);
      currentIdRef.current = null;

      if (currentResolverRef.current) {
        currentResolverRef.current.reject(new Error('Operation cancelled'));
        currentResolverRef.current = null;
      }
    }
  }, [isRunning]);

  return {
    isRunning,
    progress,
    error,
    fitFermiEdge,
    estimateIRF,
    cancel,
  };
}
