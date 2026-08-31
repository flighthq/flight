import type { Plugin } from 'vite';

export function createSizeDebugStub(enabled = true): Plugin {
  return {
    name: 'size-debug-stub',
    enforce: 'pre',
    transform(code, id) {
      if (!enabled || !SIZE_RENDER_SOURCE.test(id) || !code.includes('enableFlightDiagnostics(')) return null;
      const transformed = code.replace(
        /\benableFlightDiagnostics\(([\s\S]*?)\n?\);/g,
        (_statement, stateExpression: string) => `void (${stateExpression.replace(/,\s*$/, '')});`,
      );
      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}

const SIZE_RENDER_SOURCE = /[\\/]src[\\/]render\.(?:dom|canvas|webgl|webgpu)\.ts(?:$|\?)/;
