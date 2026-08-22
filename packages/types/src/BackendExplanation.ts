export interface BackendExplanation {
  readonly layer: 'custom' | 'host' | 'host-not-enabled' | 'no-host-implementation';
  readonly viability: 'available' | 'provider-conflict' | 'runtime-api-unavailable';
}
