import type { Entity, EntityRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createEntityRuntime } from './runtime';

export function getEntityUid(source: Entity): string {
  const runtime = ensureEntityRuntime(source);
  if (runtime.uid !== null) return runtime.uid;
  const uid = generateEntityUid();
  runtime.uid = uid;
  return uid;
}

export function setEntityUid(source: Entity, uid: string): void {
  const runtime = ensureEntityRuntime(source);
  runtime.uid = uid;
}

function ensureEntityRuntime(source: Entity): EntityRuntime {
  if (source[EntityRuntimeKey] === undefined) {
    source[EntityRuntimeKey] = createEntityRuntime();
  }
  return source[EntityRuntimeKey]!;
}

function generateEntityUid(): string {
  return `entity-${_nextEntityUidCounter++}`;
}

let _nextEntityUidCounter = 1;
