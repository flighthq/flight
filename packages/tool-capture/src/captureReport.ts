import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';

export const CAPTURE_REPORT_VERSION = 1 as const;

export type CaptureReportKind = 'observe' | 'capture' | 'validation' | 'benchmark' | 'workflow' | 'batch';

export interface CaptureReportEnvelope<T> {
  protocolVersion: typeof CAPTURE_PROTOCOL_VERSION;
  reportVersion: typeof CAPTURE_REPORT_VERSION;
  kind: CaptureReportKind;
  generatedAt: string;
  result: T;
}

/** Atomically-shaped, stable JSON output intended for agents and CI integrations. */
export function writeCaptureReport<T>(path: string, kind: CaptureReportKind, result: T): string {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const envelope: CaptureReportEnvelope<T> = {
    protocolVersion: CAPTURE_PROTOCOL_VERSION,
    reportVersion: CAPTURE_REPORT_VERSION,
    kind,
    generatedAt: new Date().toISOString(),
    result,
  };
  const temporaryPath = `${absolutePath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(envelope, null, 2));
  renameSync(temporaryPath, absolutePath);
  return absolutePath;
}
