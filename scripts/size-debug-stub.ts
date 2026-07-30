import type { Plugin } from 'vite';

export function createSizeDebugStub(enabled = true): Plugin {
  return {
    name: 'size-debug-stub',
    enforce: 'pre',
    transform(code) {
      if (!enabled || !code.includes('enableFlightDiagnostics(')) return null;
      const transformed = code.replace(
        /\benableFlightDiagnostics\(([^;\n]+)\);/g,
        (_statement, stateExpression: string) => `void (${stateExpression});`,
      );
      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}
