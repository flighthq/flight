import { readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { captureUrl } from './captureEntry';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol';

const pages: Record<string, string> = {
  '/delayed': `<!doctype html><canvas width="320" height="180"></canvas><script>
    const canvas = document.querySelector('canvas'); const ctx = canvas.getContext('2d'); let frame = 0;
    function draw() { if (++frame < 5) return requestAnimationFrame(draw); ctx.fillStyle='#123'; ctx.fillRect(0,0,320,180); ctx.fillStyle='#f40'; ctx.fillRect(60,40,200,100); }
    requestAnimationFrame(draw);
  </script>`,
  '/static-webgl': `<!doctype html><canvas width="320" height="180"></canvas><script>
    const gl = document.querySelector('canvas').getContext('webgl');
    if (!gl) throw new Error('WebGL unavailable');
    gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(60,40,200,100); gl.clearColor(1,0.2,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.flush();
  </script>`,
  '/blank-evidence': `<!doctype html><canvas width="320" height="180"></canvas><div id="error">Renderer failed to initialize</div>`,
  '/flaky': `<!doctype html><canvas width="320" height="180"></canvas><script>
    const ctx=document.querySelector('canvas').getContext('2d'); ctx.fillStyle='#123'; ctx.fillRect(0,0,320,180); ctx.fillStyle='#0cf'; ctx.fillRect(40,30,240,120);
  </script>`,
};

describe('capture eyes browser contract', () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), 'tool-capture-eyes-'));
  let flakyRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/flaky' && flakyRequests++ === 0) {
      request.socket.destroy();
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(pages[request.url ?? ''] ?? 'not found');
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
    rmSync(artifactRoot, { recursive: true, force: true });
  });

  it('waits for a delayed canvas and stays within the eyes performance budget', async () => {
    const startedAt = performance.now();
    const outDir = join(artifactRoot, 'delayed');
    const diagnostics = await captureUrl(`${baseUrl}/delayed`, { outDir, maxRetries: 0 });
    expect(diagnostics).toMatchObject({ blank: false, usable: true, timedOut: false, attempts: 1 });
    expect(performance.now() - startedAt).toBeLessThan(8_000);
    expect(readFileSync(join(outDir, 'screenshot.png')).byteLength).toBeGreaterThan(300);
  }, 15_000);

  it('captures a static one-shot WebGL frame without page integration', async () => {
    const diagnostics = await captureUrl(`${baseUrl}/static-webgl`, {
      outDir: join(artifactRoot, 'webgl'),
      maxRetries: 1,
    });
    expect(diagnostics.backend).toBe('webgl');
    expect(diagnostics.coverage).toBeGreaterThan(0.1);
    expect(diagnostics.usable).toBe(true);
  }, 20_000);

  it('preserves full-page evidence and emits a versioned machine report for a blank renderer', async () => {
    const outDir = join(artifactRoot, 'blank');
    const diagnostics = await captureUrl(`${baseUrl}/blank-evidence`, { outDir, maxRetries: 0 });
    expect(diagnostics).toMatchObject({ blank: true, pageEvidence: true, usable: true });
    const report = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8')) as {
      protocolVersion: number;
      kind: string;
    };
    expect(report).toMatchObject({ protocolVersion: CAPTURE_PROTOCOL_VERSION, kind: 'observe' });
  }, 15_000);

  it('recovers a transient navigation failure in a fresh browser attempt', async () => {
    const diagnostics = await captureUrl(`${baseUrl}/flaky`, {
      outDir: join(artifactRoot, 'flaky'),
      maxRetries: 1,
    });
    expect(diagnostics).toMatchObject({ attempts: 2, blank: false, usable: true });
    expect(diagnostics.attemptErrors.join(' ')).toMatch(/ERR_|failed/i);
  }, 15_000);
});
