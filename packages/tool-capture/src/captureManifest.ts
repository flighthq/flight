import { readFileSync } from 'node:fs';

import type { Entry } from './captureEntries.js';

export interface CaptureManifest {
  entries: Entry[];
  subject: string;
  validation?: {
    fingerprintSkip?: string[];
    paritySkip?: Record<string, 'all' | string[]>;
    parityGroups?: Record<string, CaptureParityGroup>;
  };
  benchmark?: CaptureManifestBenchmark;
}

export interface CaptureParityGroup {
  targets: string[];
  reference?: string;
  tolerance?: number;
}

export interface CaptureManifestBenchmark {
  warmupIterations?: number;
  iterations?: number;
  samples?: number;
  sampleDurationMs?: number;
  maxRetries?: number;
  reference?: string;
  regressionTolerance?: number;
  stabilityTolerance?: number;
}

export function parseCaptureManifest(source: string, sourceName: string = 'capture manifest'): CaptureManifest {
  const value = JSON.parse(source) as Partial<CaptureManifest>;
  if (typeof value.subject !== 'string' || value.subject === '') throw new Error(`${sourceName}: missing subject`);
  if (!Array.isArray(value.entries)) throw new Error(`${sourceName}: missing entries array`);
  for (const entry of value.entries) {
    if (typeof entry?.name !== 'string' || entry.name === '' || !Array.isArray(entry.renderers)) {
      throw new Error(`${sourceName}: every entry needs name and renderers`);
    }
    if (entry.route !== undefined) throw new Error(`${sourceName}: JSON entries must use declarative routes`);
    for (const renderer of entry.renderers) {
      if (typeof renderer !== 'string' || typeof entry.routes?.[renderer] !== 'string') {
        throw new Error(`${sourceName}: entry ${entry.name} needs a route for renderer ${String(renderer)}`);
      }
    }
  }
  if (value.validation !== undefined) {
    const { fingerprintSkip, paritySkip, parityGroups } = value.validation;
    if (fingerprintSkip !== undefined && !isStringArray(fingerprintSkip)) {
      throw new Error(`${sourceName}: validation.fingerprintSkip must be a string array`);
    }
    if (paritySkip !== undefined) {
      if (typeof paritySkip !== 'object' || paritySkip === null || Array.isArray(paritySkip)) {
        throw new Error(`${sourceName}: validation.paritySkip must be an object`);
      }
      for (const [name, renderers] of Object.entries(paritySkip)) {
        if (renderers !== 'all' && !isStringArray(renderers)) {
          throw new Error(`${sourceName}: validation.paritySkip.${name} must be "all" or a string array`);
        }
      }
    }
    if (parityGroups !== undefined) {
      if (typeof parityGroups !== 'object' || parityGroups === null || Array.isArray(parityGroups)) {
        throw new Error(`${sourceName}: validation.parityGroups must be an object`);
      }
      for (const [name, group] of Object.entries(parityGroups)) {
        if (typeof group !== 'object' || group === null || !isStringArray(group.targets) || group.targets.length < 2) {
          throw new Error(`${sourceName}: validation.parityGroups.${name}.targets needs at least two strings`);
        }
        if (group.reference !== undefined && !group.targets.includes(group.reference)) {
          throw new Error(`${sourceName}: validation.parityGroups.${name}.reference must be one of its targets`);
        }
        if (group.tolerance !== undefined && (!Number.isFinite(group.tolerance) || group.tolerance < 0)) {
          throw new Error(`${sourceName}: validation.parityGroups.${name}.tolerance must be non-negative`);
        }
      }
    }
  }
  if (value.benchmark !== undefined) {
    if (typeof value.benchmark !== 'object' || value.benchmark === null || Array.isArray(value.benchmark)) {
      throw new Error(`${sourceName}: benchmark must be an object`);
    }
    const benchmark = value.benchmark;
    for (const key of ['warmupIterations', 'maxRetries'] as const) {
      const item = benchmark[key];
      if (item !== undefined && (!Number.isInteger(item) || item < 0)) {
        throw new Error(`${sourceName}: benchmark.${key} must be a non-negative integer`);
      }
    }
    if (benchmark.iterations !== undefined && (!Number.isInteger(benchmark.iterations) || benchmark.iterations < 1)) {
      throw new Error(`${sourceName}: benchmark.iterations must be a positive integer`);
    }
    if (benchmark.samples !== undefined && (!Number.isInteger(benchmark.samples) || benchmark.samples < 3)) {
      throw new Error(`${sourceName}: benchmark.samples must be an integer of at least 3`);
    }
    if (
      benchmark.sampleDurationMs !== undefined &&
      (!Number.isFinite(benchmark.sampleDurationMs) || benchmark.sampleDurationMs <= 0)
    ) {
      throw new Error(`${sourceName}: benchmark.sampleDurationMs must be positive`);
    }
    if (benchmark.reference !== undefined && typeof benchmark.reference !== 'string') {
      throw new Error(`${sourceName}: benchmark.reference must be a string`);
    }
    for (const key of ['regressionTolerance', 'stabilityTolerance'] as const) {
      const item = benchmark[key];
      if (item !== undefined && (!Number.isFinite(item) || item < 0)) {
        throw new Error(`${sourceName}: benchmark.${key} must be non-negative`);
      }
    }
  }
  return value as CaptureManifest;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function readCaptureManifest(path: string): CaptureManifest {
  return parseCaptureManifest(readFileSync(path, 'utf8'), path);
}
