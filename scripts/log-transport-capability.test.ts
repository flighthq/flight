import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('LogTransport zero-provider capability shape', () => {
  it('deletes the orphan Host slot and Has trait without a successor', () => {
    const host = source('packages/types/src/Host.ts');

    expect(host).not.toContain('LogTransport');
    expect(host).not.toContain('logTransport');
    expect(host).not.toContain('HasAppLogTransport');
  });

  it('deletes every ambient selector, operation query, and provider slot', () => {
    const production = [
      source('packages/types/src/Log.ts'),
      source('packages/types/src/FileLogSink.ts'),
      source('packages/log/src/log.ts'),
      source('packages/log/src/index.ts'),
      source('packages/log/src/contract.ts'),
    ].join('\n');

    for (const forbidden of [
      'LogTransportBackend',
      'LogTransportOperation',
      'destroyLogTransportBackend',
      'explainLogTransportOperation',
      'getLogTransportBackend',
      'hasLogTransportOperation',
      'setLogTransportBackend',
      '_transportBackend',
    ]) {
      expect(production).not.toContain(forbidden);
    }
  });

  it('takes one configured transport directly and pins it to an Entity sink', () => {
    const fileLogSinkTypes = source('packages/types/src/FileLogSink.ts');
    const log = source('packages/log/src/log.ts');
    const logTypes = source('packages/types/src/Log.ts');

    expect(logTypes).toContain('export interface LogTransport extends Entity');
    expect(fileLogSinkTypes).toContain('export interface FileLogSink extends Entity');
    expect(log).toMatch(/export function createFileLogSink\(\s*transport: LogTransport,/);
    expect(log).toContain('[EntityRuntimeKey]: undefined');
  });

  it('requires admission, delivery, and terminal outcomes instead of optional operations', () => {
    const logTypes = source('packages/types/src/Log.ts');

    for (const outcome of [
      'LogTransportWriteOutcome',
      'LogTransportFlushOutcome',
      'LogTransportDestroyOutcome',
      'LogTransportDeliveryBoundary',
    ]) {
      expect(logTypes).toContain(`export type ${outcome}`);
    }
    expect(logTypes).toContain('write(line: string): LogTransportWriteOutcome');
    expect(logTypes).toContain('flush(): Promise<LogTransportFlushOutcome>');
    expect(logTypes).toContain('destroy(): Promise<LogTransportDestroyOutcome>');
    expect(logTypes).not.toContain('flush?');
    expect(logTypes).not.toContain('destroy?');
  });

  it('keeps all four platform Host implementations free of guessed Log providers', () => {
    const providers = [
      source('packages/host-web/src/webHost.ts'),
      source('packages/host-electron/src/electronRegister.ts'),
      source('packages/host-tauri/src/tauriRegister.ts'),
      source('packages/host-capacitor/src/capacitorRegister.ts'),
    ].join('\n');

    expect(providers).not.toContain('LogTransport');
    expect(providers).not.toContain('logTransport');
  });
});
