/**
 * Web Worker for XPS fitting calculations
 * Runs heavy optimization in a separate thread to avoid UI blocking
 */

import { estimateIRFParameters, defaultIRFBounds } from '../lib/fitting';
import type { IRFEstimationResult } from '../lib/fitting';
import { fitFermiEdge } from '../lib/fermiEdge';
import type { FermiFitOptions, FermiFitResult } from '../lib/fermiEdge';

/**
 * Message types for worker communication
 */
export type WorkerMessageType =
  | 'fitFermiEdge'
  | 'estimateIRF'
  | 'progress'
  | 'result'
  | 'error';

export interface FitFermiEdgeMessage {
  type: 'fitFermiEdge';
  id: string;
  /** Internal axis: eV, occupied side at lower values, cut to the fit window */
  x: number[];
  y: number[];
  options: FermiFitOptions;
}

export interface EstimateIRFMessage {
  type: 'estimateIRF';
  id: string;
  observedSpectrum: number[];
  temp: number;
  bounds?: typeof defaultIRFBounds;
  maxIterations?: number;
}

export interface ProgressMessage {
  type: 'progress';
  id: string;
  iteration: number;
  fitness: number;
  progress: number;  // 0-100%
}

export interface ResultMessage {
  type: 'result';
  id: string;
  result: FermiFitResult | IRFEstimationResult;
}

export interface ErrorMessage {
  type: 'error';
  id: string;
  error: string;
}

export type WorkerIncomingMessage = FitFermiEdgeMessage | EstimateIRFMessage;
export type WorkerOutgoingMessage = ProgressMessage | ResultMessage | ErrorMessage;

// Worker context
const ctx: Worker = self as unknown as Worker;

/**
 * Handle incoming messages
 */
ctx.onmessage = (event: MessageEvent<WorkerIncomingMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'fitFermiEdge':
      handleFitFermiEdge(message);
      break;
    case 'estimateIRF':
      handleEstimateIRF(message);
      break;
    default:
      ctx.postMessage({
        type: 'error',
        id: (message as { id: string }).id,
        error: 'Unknown message type',
      } as ErrorMessage);
  }
};

/**
 * Handle Fermi edge fitting (fast: no progress messages)
 */
function handleFitFermiEdge(message: FitFermiEdgeMessage) {
  const { id, x, y, options } = message;

  try {
    const result = fitFermiEdge(x, y, options);
    ctx.postMessage({
      type: 'result',
      id,
      result,
    } as ResultMessage);
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ErrorMessage);
  }
}

/**
 * Handle IRF parameter estimation
 */
function handleEstimateIRF(message: EstimateIRFMessage) {
  const { id, observedSpectrum, temp, bounds, maxIterations = 50 } = message;

  try {
    const result = estimateIRFParameters(
      observedSpectrum,
      temp,
      bounds,
      maxIterations,
      (iteration, fitness) => {
        ctx.postMessage({
          type: 'progress',
          id,
          iteration,
          fitness,
          progress: Math.min(100, (iteration / maxIterations) * 100),
        } as ProgressMessage);
      }
    );

    ctx.postMessage({
      type: 'result',
      id,
      result,
    } as ResultMessage);
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ErrorMessage);
  }
}

// Export types for use in main thread
export {};
