import { describe, expect, it, vi } from 'vitest';

import {
  benchmarkBaselinePath,
  calculateCaptureBenchmarkStatistics,
  evaluateCaptureBenchmarkRegression,
  runCaptureBenchmark,
} from './captureBenchmark';

describe('benchmarkBaselinePath', () => {
  it('uses a subject-local committed benchmark directory', () => {
    expect(benchmarkBaselinePath('/repo', 'app', 'home')).toBe('/repo/app/benchmarks/home.json');
  });
});

describe('calculateCaptureBenchmarkStatistics', () => {
  it('returns robust median, p95, and MAD values', () => {
    const statistics = calculateCaptureBenchmarkStatistics([1, 1.1, 0.9, 1, 9]);
    expect(statistics).toMatchObject({
      medianMs: 1,
      minMs: 0.9,
      maxMs: 9,
    });
    expect(statistics.madMs).toBeCloseTo(0.1);
  });

  it('rejects empty or invalid samples', () => {
    expect(() => calculateCaptureBenchmarkStatistics([])).toThrow(/samples/);
    expect(() => calculateCaptureBenchmarkStatistics([Number.NaN])).toThrow(/samples/);
  });
});

describe('evaluateCaptureBenchmarkRegression', () => {
  it('allows improvements and gates slowdowns beyond tolerance', () => {
    expect(evaluateCaptureBenchmarkRegression(80, 100, 0.1).pass).toBe(true);
    expect(evaluateCaptureBenchmarkRegression(109, 100, 0.1).pass).toBe(true);
    expect(evaluateCaptureBenchmarkRegression(111, 100, 0.1).pass).toBe(false);
  });
});

describe('runCaptureBenchmark', () => {
  it('is a callable benchmark orchestrator', () => {
    expect(typeof runCaptureBenchmark).toBe('function');
  });

  it('rejects empty target selections before launching and releases the server', async () => {
    const kill = vi.fn();
    await expect(
      runCaptureBenchmark({
        subject: 'fixture',
        entries: [{ name: 'work', renderers: ['canvas'], routes: { canvas: 'work' } }],
        rendererFilter: ['webgpu'],
        server: { url: 'http://unused.test', kill },
      }),
    ).rejects.toThrow(/No benchmark targets/);
    expect(kill).toHaveBeenCalledOnce();
  });

  it('rejects invalid programmatic policy before launching and releases the server', async () => {
    const kill = vi.fn();
    await expect(
      runCaptureBenchmark({
        subject: 'fixture',
        entries: [{ name: 'work', renderers: ['canvas'], routes: { canvas: 'work' } }],
        regressionTolerance: -1,
        server: { url: 'http://unused.test', kill },
      }),
    ).rejects.toThrow(/regressionTolerance/);
    expect(kill).toHaveBeenCalledOnce();
  });
});
