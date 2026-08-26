import { getLoopBackend } from '@flighthq/application/contract';
import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas/contract';
import { createWebCursorBackend, enableHostWebGlyphRasterizer, enableHostWebLoop } from '@flighthq/host-web';

import { captureHostProbeBackends, diffHostProbeBackends } from '#host-probe/capabilityBackends';
import type { HostProbeBackendSnapshot } from '#host-probe/capabilityBackends';
import type { HostProbeInstallResult, HostProbeResult } from '#host-probe/contract';

export async function installWebHostProbe(before: HostProbeBackendSnapshot): Promise<HostProbeInstallResult> {
  enableHostWebGlyphRasterizer();
  enableHostWebLoop();
  const results = await Promise.all([probeWebCursor(), probeWebGlyphRasterizer(), probeWebLoop()]);
  const changedCapabilities = diffHostProbeBackends(before, captureHostProbeBackends());
  if (results[0]?.status === 'pass') changedCapabilities.push('cursor');
  return { changedCapabilities, results };
}

async function probeWebCursor(): Promise<HostProbeResult> {
  const element = document.createElement('div');
  const backend = createWebCursorBackend(element);
  backend.setCursor('pointer');
  return {
    detail: element.style.cursor === 'pointer' ? 'DOM cursor style changed' : 'DOM cursor style did not change',
    id: 'runtime.cursor',
    kind: 'runtime',
    status: element.style.cursor === 'pointer' ? 'pass' : 'fail',
  };
}

async function probeWebGlyphRasterizer(): Promise<HostProbeResult> {
  const rasterized = getGlyphRasterizerBackend().rasterize(65, { fontFamily: 'sans-serif', fontSize: 18 });
  return {
    detail:
      rasterized === null ? 'Glyph rasterizer returned no pixels for A' : `${rasterized.width}x${rasterized.height}`,
    id: 'runtime.glyph-rasterizer',
    kind: 'runtime',
    status: rasterized === null ? 'fail' : 'pass',
  };
}

async function probeWebLoop(): Promise<HostProbeResult> {
  const backend = getLoopBackend();
  if (backend === null) {
    return { detail: 'Loop provider is null', id: 'runtime.loop', kind: 'runtime', status: 'fail' };
  }
  const frameTime = await new Promise<number | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 2_000);
    backend.requestFrame((time) => {
      clearTimeout(timeout);
      resolve(time);
    });
  });
  return {
    detail: frameTime === null ? 'Animation frame timed out' : `Animation frame at ${frameTime.toFixed(2)}ms`,
    id: 'runtime.loop',
    kind: 'runtime',
    status: frameTime === null ? 'fail' : 'pass',
  };
}
