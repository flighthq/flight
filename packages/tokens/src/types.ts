import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { FlightDocumentToken, FlightDocumentValue } from '@flighthq/scene-document/contract';

interface TokensEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface FlightDocumentTokenResolution {
  mode: string;
  values: Readonly<Record<string, FlightDocumentValue>>;
}

export type FlightDocumentTokenResolver = (
  value: FlightDocumentValue,
  token: Readonly<FlightDocumentToken>,
) => FlightDocumentValue | null;

export interface FlightDocumentTokenResolverRegistry extends TokensEntity {
  resolvers: ReadonlyMap<Kind, FlightDocumentTokenResolver>;
}
