import type { TextShaperBackend } from './TextShaper';

// The full type returned by createCanvasTextShaperBackend — a TextShaperBackend plus an explicit
// cache-clear method. Callers that only need the seam contract can hold this as TextShaperBackend;
// callers that manage font loading hold it as CanvasTextShaperBackend to call the cache-clear.
export interface CanvasTextShaperBackend extends TextShaperBackend {
  clearCache(): void;
}
