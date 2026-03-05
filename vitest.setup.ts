if (typeof window !== 'undefined' && 'document' in window) {
  // jsdom / browser environment
  // @ts-expect-error: quiet warning about types
  import('@testing-library/jest-dom');
  import('vitest-webgl-canvas-mock');
} else {
  // node environment
}
