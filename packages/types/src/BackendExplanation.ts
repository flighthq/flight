export interface BackendExplanation {
  readonly conflict: boolean;
  readonly layer: 'custom' | 'host' | 'host-not-enabled' | 'no-host-implementation';
  readonly operation: string | null;
  readonly viability: 'available' | 'runtime-api-unavailable' | 'unobserved';
}
