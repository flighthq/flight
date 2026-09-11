import type { Entity } from './Entity';
import type { HostTextShaperProvider } from './TextShaper';

// The full type returned by createCanvasTextShaperBackend — a HostTextShaperProvider plus an explicit
// cache-clear method. Callers that only need the seam contract can hold this as HostTextShaperProvider;
// callers that manage font loading hold it as CanvasTextShaperBackend to call the cache-clear.
export interface CanvasTextShaperBackend extends Entity, HostTextShaperProvider {
  clearCache(): void;
}
