import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runCaptureValidation } from './captureValidation';

describe('runCaptureValidation', () => {
  it('is a callable fingerprint-validation orchestrator', () => {
    expect(typeof runCaptureValidation).toBe('function');
  });

  it('does not reload a target when capture already supplied its passed fingerprint', async () => {
    const newPage = vi.fn();
    const kill = vi.fn();
    const result = await runCaptureValidation({
      subject: 'reuse-fixture',
      entries: [{ name: 'sample', renderers: ['canvas'] }],
      server: { url: 'http://unused.invalid', kill },
      root: join(tmpdir(), 'tool-capture-reuse-fixture'),
      report: true,
      fingerprints: { sample: { canvas: '1:000000' } },
      browserSession: {
        browser: { close: vi.fn() } as never,
        context: { newPage } as never,
      },
    });

    expect(newPage).not.toHaveBeenCalled();
    expect(result.loadFailures).toBe(0);
    expect(result.skipped).toBe(1);
    expect(kill).toHaveBeenCalledOnce();
  });
});
