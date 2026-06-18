// TypeScript stub for @ft/render. The Vite harness provides the real renderer-specific
// module at runtime; this file exists only for the TypeScript language service.
import type { FunctionalTarget, FunctionalTargetOptions } from './target';

export type { FunctionalCanvasTarget, FunctionalDOMTarget, FunctionalTarget, FunctionalWebGLTarget } from './target';
export type { FunctionalTargetOptions };

export function createFunctionalTarget(_options: FunctionalTargetOptions): FunctionalTarget {
  throw new Error('@ft/render was not provided — are you running outside the functional test server?');
}
