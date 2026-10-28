import { readEntityRuntime, writeEntityRuntime } from './entity.ts';
import { createEntityRuntime } from './runtime.ts';
import type { EntityRaw, EntityRuntime } from './types.ts';

export function getEntityUid(source: EntityRaw): string {
  const runtime = ensureEntityRuntime(source);
  if (runtime.uid !== undefined) return runtime.uid;
  const uid = generateEntityUid();
  runtime.uid = uid;
  return uid;
}

export function setEntityUid(source: EntityRaw, uid: string): void {
  const runtime = ensureEntityRuntime(source);
  runtime.uid = uid;
}

function ensureEntityRuntime(source: EntityRaw): EntityRuntime {
  const runtime = readEntityRuntime(source) ?? createEntityRuntime();
  writeEntityRuntime(source, runtime);
  return runtime;
}

function generateEntityUid(): string {
  return `entity-${_nextEntityUidCounter++}`;
}

let _nextEntityUidCounter = 1;
