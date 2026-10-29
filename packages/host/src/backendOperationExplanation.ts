// Generated from crates/flight-host/src/backend_operation_explanation.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Which layer provides one operation (TS inline `BackendOperationExplanation['layer']`). A
 * different vocabulary from `BackendExplanationLayer`, which never had to name what serves an
 * unimplemented operation. `Sentinel` and `undefined` both mean nothing real implements it, and stay
 * distinct: `Sentinel` is a fall-through object that answers so the call cannot throw; `undefined` means
 * there is no fall-through at all (nullable single-slot capabilities return null from their getter).
 */
export type BackendOperationExplanationLayer = 'custom' | 'host' | 'none' | 'sentinel';

/**
 * Per-operation availability, one level below `BackendExplanation` (TS
 * `BackendOperationExplanation`, types/src/BackendOperationExplanation.ts): plain data, built as a
 * struct literal. `implemented` is true iff a custom or host backend provides the operation, and
 * false whenever only the sentinel serves it: the sentinel never counts as support.
 */
export interface BackendOperationExplanation {
  implemented: boolean;
  layer: BackendOperationExplanationLayer;
  operation: string;
}

export function getBackendOperationExplanationLayerString(value: BackendOperationExplanationLayer): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'custom':
        return 'custom';
      case 'host':
        return 'host';
      case 'none':
        return 'none';
      case 'sentinel':
        return 'sentinel';
    }
  })();
}

export function parseBackendOperationExplanationLayer(value: string): BackendOperationExplanationLayer | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'custom':
        return 'custom';
      case 'host':
        return 'host';
      case 'none':
        return 'none';
      case 'sentinel':
        return 'sentinel';
      default:
        return undefined;
    }
  })();
}
