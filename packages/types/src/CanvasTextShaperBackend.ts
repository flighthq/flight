import type { HostTextShaperCapability } from './TextShaper.ts';

// The full type returned by createCanvasTextShaperBackend — a HostTextShaperCapability plus an explicit
// cache-clear method. Callers that only need the seam contract can hold this as HostTextShaperCapability;
// callers that manage font loading hold it as CanvasTextShaperBackend to call the cache-clear.
//
// Plain data, NOT an Entity: this is a host capability — dispatch infrastructure Flight receives rather
// than a domain object it defines and allocates — so it is formed as a literal with no runtime tier and
// no allocateEntity/finishEntity bracket.
export interface CanvasTextShaperBackend extends HostTextShaperCapability {
  clearCache(): void;
}
