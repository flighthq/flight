// Generated from crates/flight-host/src/backend_explanation.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Which layer answers for a backend (TS inline `BackendExplanation['layer']`): `custom` or `host`
 * backends, a host that exists but has not enabled one, or a host with no implementation.
 */
export type BackendExplanationLayer = 'custom' | 'host' | 'host-not-enabled' | 'no-host-implementation';

/**
 * Whether the explained backend can run (TS inline `BackendExplanation['viability']`).
 */
export type BackendExplanationViability = 'available' | 'runtime-api-unavailable' | 'unobserved';

/**
 * Per-backend explanation (TS `BackendExplanation`, types/src/BackendExplanation.ts): plain data,
 * built as a struct literal. `operation` is None where TS has `null`.
 */
export interface BackendExplanation {
  conflict: boolean;
  layer: BackendExplanationLayer;
  operation: string | null;
  viability: BackendExplanationViability;
}

export function getBackendExplanationLayerString(value: BackendExplanationLayer): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'custom':
        return 'custom';
      case 'host':
        return 'host';
      case 'host-not-enabled':
        return 'host-not-enabled';
      case 'no-host-implementation':
        return 'no-host-implementation';
    }
  })();
}

export function getBackendExplanationViabilityString(value: BackendExplanationViability): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'available':
        return 'available';
      case 'runtime-api-unavailable':
        return 'runtime-api-unavailable';
      case 'unobserved':
        return 'unobserved';
    }
  })();
}

export function parseBackendExplanationLayer(value: string): BackendExplanationLayer | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'custom':
        return 'custom';
      case 'host':
        return 'host';
      case 'host-not-enabled':
        return 'host-not-enabled';
      case 'no-host-implementation':
        return 'no-host-implementation';
      default:
        return undefined;
    }
  })();
}

export function parseBackendExplanationViability(value: string): BackendExplanationViability | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'available':
        return 'available';
      case 'runtime-api-unavailable':
        return 'runtime-api-unavailable';
      case 'unobserved':
        return 'unobserved';
      default:
        return undefined;
    }
  })();
}
