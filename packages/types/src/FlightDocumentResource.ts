import type { Kind } from './Entity.ts';
import type { FlightDocumentFields } from './FlightDocumentFieldSchema.ts';

// The logical model has exactly one resource shape. Grouped YAML sections and bare-path shorthand are
// text-codec forms normalized into this kind-tagged row before schemas or resolvers see them.
export interface FlightDocumentResourceDescriptor {
  fields: FlightDocumentFields;
  key: string;
  kind: Kind;
}

export type FlightDocumentResourceResolver = (
  key: string,
  descriptor: Readonly<FlightDocumentResourceDescriptor>,
) => unknown | null;

// Resolution policy is separate from schemas so parse/diff tooling can work without loaded assets.
export interface FlightDocumentResourceResolverRegistry {
  resolvers: ReadonlyMap<Kind, FlightDocumentResourceResolver>;
}
