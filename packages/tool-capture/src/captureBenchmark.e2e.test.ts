import { readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getCaptureBenchmarkBaselinePath, runCaptureBenchmark } from './captureBenchmark';
import { runCaptureValidation } from './captureValidation';

const domPage = `<!doctype html><div id="target" style="width:320px;height:180px;background:#123;position:relative"><div style="position:absolute;left:60px;top:40px;width:200px;height:100px;background:#f40"></div></div><script>
  const element = document.querySelector('#target');
  window.__ftTarget = { kind:'dom', state:{element} };
  window.__ftVerification = { protocolVersion:1, render:'dom', coverage:null, fingerprint:null, state:'passed', error:null };
  let value = 1;
  window.__ftBenchmarkTarget = { kind:'dom', run(){ for(let i=0;i<2000;i++) value=Math.imul(value^value>>>13,1|value); element.dataset.value=String(value); }, synchronize(){ element.getBoundingClientRect(); } };
</script>`;

describe('benchmark and generalized parity browser workflow', () => {
  const root = mkdtempSync(join(tmpdir(), 'tool-capture-benchmark-'));
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(domPage);
  });
  let baseUrl = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('fixture server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    rmSync(root, { recursive: true, force: true });
  });

  it('benchmarks a registered page target and writes a calibrated baseline/report', async () => {
    const result = await runCaptureBenchmark({
      subject: 'fixture',
      entries: [{ name: 'work', renderers: ['dom', 'wasm:dom'], routes: { dom: 'dom', 'wasm:dom': 'wasm' } }],
      server: { url: baseUrl, kill() {} },
      root,
      reference: 'dom',
      updateBaselines: true,
      iterations: 3,
      samples: 3,
      warmupIterations: 1,
      stabilityTolerance: 1,
    });
    expect(result).toMatchObject({ failed: 0, updated: 2, shouldFail: false });
    expect(result.targets[0]?.samplesMs).toHaveLength(3);
    expect(result.targets[1]?.referenceRatio).not.toBeNull();
    expect(result.calibration.cpuOperationsPerMs).toBeGreaterThan(0);
    expect(readFileSync(getCaptureBenchmarkBaselinePath(root, 'fixture', 'work'), 'utf8')).toContain('normalizedWork');
    expect(readFileSync(join(root, '.artifacts/fixture/benchmark-report.json'), 'utf8')).toContain('benchmark');

    const gated = await runCaptureBenchmark({
      subject: 'fixture',
      entries: [{ name: 'work', renderers: ['dom', 'wasm:dom'], routes: { dom: 'dom', 'wasm:dom': 'wasm' } }],
      server: { url: baseUrl, kill() {} },
      root,
      reference: 'dom',
      iterations: 3,
      samples: 3,
      warmupIterations: 1,
      regressionTolerance: 10,
    });
    expect(gated).toMatchObject({ failed: 0, passed: 2, shouldFail: false });
    expect(gated.targets[1]?.baselineMetric).toBe('referenceRatio');
  }, 20_000);

  it('compares DOM and arbitrary WASM-labelled targets through an explicit visual group', async () => {
    const result = await runCaptureValidation({
      subject: 'fixture',
      entries: [
        {
          name: 'visual',
          renderers: ['dom', 'wasm:dom'],
          routes: { dom: 'dom', 'wasm:dom': 'wasm' },
        },
      ],
      server: { url: baseUrl, kill() {} },
      root,
      gateRegression: false,
      parityGroups: { visual: { targets: ['dom', 'wasm:dom'], reference: 'dom', tolerance: 0 } },
    });
    expect(result).toMatchObject({ loadFailures: 0, parityFailures: 0, parityPasses: 1, shouldFail: false });
    expect(result.checks).toContainEqual(
      expect.objectContaining({ kind: 'parity', renderers: ['dom', 'wasm:dom'], status: 'passed' }),
    );
  }, 20_000);
});
