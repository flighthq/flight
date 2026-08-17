import { describe, expect, it, vi } from 'vitest';

import { runCaptureBatch, runCaptureWorkflow } from './captureWorkflow';

describe('runCaptureBatch', () => {
  it('exports the batch orchestrator', () => {
    expect(typeof runCaptureBatch).toBe('function');
  });

  it('rejects an empty batch before launching browser work', async () => {
    await expect(
      runCaptureBatch({
        quiet: true,
        subjects: [],
      }),
    ).rejects.toThrow(/No capture batch subjects/);
  });

  it('continues after a subject setup error and aggregates the verdict', async () => {
    const result = await runCaptureBatch({
      quiet: true,
      subjectWorkerCount: 2,
      subjects: [
        {
          name: 'ready',
          resolve: async () => ({
            subject: 'ready',
            entries: [],
            server: { url: 'http://localhost:1', kill() {} },
            capture: false,
            validation: false,
          }),
        },
        {
          name: 'broken',
          resolve: () => Promise.reject(new Error('server did not start')),
        },
      ],
    });
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.shouldFail).toBe(true);
    expect(result.subjects[1]?.error).toBe('server did not start');
  });
});

describe('runCaptureWorkflow', () => {
  it('exports the subject orchestrator', () => {
    expect(typeof runCaptureWorkflow).toBe('function');
  });

  it('owns the subject server once across the workflow', async () => {
    let kills = 0;
    const result = await runCaptureWorkflow({
      quiet: true,
      subject: 'fixture',
      entries: [],
      server: { url: 'http://localhost:1', kill: () => kills++ },
      capture: false,
      validation: false,
    });
    expect(kills).toBe(1);
    expect(result).toEqual({
      aborted: false,
      benchmark: null,
      capture: null,
      shouldFail: false,
      validation: null,
      durationMs: 0,
      reportPath: null,
    });
  });

  it('rejects a detached fingerprint update before launching browser work', async () => {
    const kill = vi.fn();
    await expect(
      runCaptureWorkflow({
        quiet: true,
        subject: 'fixture',
        entries: [],
        server: { url: 'http://localhost:1', kill },
        capture: false,
        validation: { updateFingerprints: true },
      }),
    ).rejects.toThrow('Fingerprint updates require a paired verified capture pass');
    expect(kill).toHaveBeenCalledOnce();
  });

  it('rejects an unverified fingerprint update before launching browser work', async () => {
    const kill = vi.fn();
    await expect(
      runCaptureWorkflow({
        quiet: true,
        subject: 'fixture',
        entries: [],
        server: { url: 'http://localhost:1', kill },
        capture: { verify: false },
        validation: { updateFingerprints: true },
      }),
    ).rejects.toThrow('Fingerprint updates cannot run with capture verification disabled');
    expect(kill).toHaveBeenCalledOnce();
  });
});
