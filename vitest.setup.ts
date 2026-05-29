export {};

if (typeof window !== 'undefined' && 'document' in window) {
  // jsdom / browser environment
  // @ts-expect-error: quiet warning about types
  await import('@testing-library/jest-dom');
  await import('vitest-webgl-canvas-mock');
  await import('./tests/setup/webgl2Mock');
} else {
  // node environment
}
