if (typeof window !== 'undefined') {
  // jsdom / browser environment
  import('@testing-library/jest-dom');
  import('vitest-webgl-canvas-mock');
} else {
  // node environment
}
