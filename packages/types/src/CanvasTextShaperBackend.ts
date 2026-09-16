import type { Entity } from './Entity';
import type { HostTextShaperCapability } from './TextShaper';

// The full type returned by createCanvasTextShaperBackend — a HostTextShaperCapability plus an explicit
// cache-clear method. Callers that only need the seam contract can hold this as HostTextShaperCapability;
// callers that manage font loading hold it as CanvasTextShaperBackend to call the cache-clear.
export interface CanvasTextShaperBackend extends Entity, HostTextShaperCapability {
  clearCache(): void;
}
