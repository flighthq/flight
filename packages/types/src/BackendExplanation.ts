export interface BackendExplanation {
  readonly conflict: boolean;
  readonly layer: 'custom' | 'host' | 'host-not-enabled' | 'no-host-implementation';
  readonly operation: 'measureMetrics' | 'rasterize' | null;
  readonly viability: 'available' | 'runtime-api-unavailable' | 'unobserved';
}
