import type { Entity, Kind } from './Entity';
import type { FlightDocumentValue } from './FlightDocumentFieldSchema';
import type { KeyedTable } from './RegistryTable';

// One authored token row, shaped like a resource descriptor: kind-tagged, keyed, with the
// kind-specific payload beside it. The kind sits on the ROW rather than on each mode variant because
// the variants are alternatives of one semantic value; a per-mode kind would let a single token be a
// colour under one mode and a number under another, which nothing downstream could reconcile.
export interface FlightDocumentToken {
  key: string;
  kind: Kind;
  values: FlightDocumentTokenValues;
}

// Mode name to authored value. `default` is the reserved fallback mode consulted when the requested
// mode is absent; every other key is an open, caller-chosen mode string ('light', 'dark',
// 'high-contrast', 'acme.brand'). The value is the open document value model rather than a scalar, so
// a composite token kind needs a resolver registration and no format change.
export interface FlightDocumentTokenValues {
  [mode: string]: FlightDocumentValue;
}

// What one mode resolves to. Values are fully dereferenced: an alias chain has been followed, so no
// reference survives into a resolution and a consumer never needs to know the syntax.
export interface FlightDocumentTokenResolution {
  mode: string;
  values: Readonly<Record<string, FlightDocumentValue>>;
}

// Per-kind value resolution. Returns null when the authored value is not admissible for the kind, so
// the caller reports a named refusal instead of substituting a value the kind never described.
export type FlightDocumentTokenResolver = (
  value: FlightDocumentValue,
  token: Readonly<FlightDocumentToken>,
) => FlightDocumentValue | null;

// Open registry keyed by token kind, mirroring FlightDocumentResourceResolverRegistry: resolution
// policy is caller-owned, so an application registers only the kinds it authors and unregistered
// kinds refuse by name rather than resolving to something plausible.
export interface FlightDocumentTokenResolverRegistry extends Entity {
  resolvers: KeyedTable<FlightDocumentTokenResolver>;
}
