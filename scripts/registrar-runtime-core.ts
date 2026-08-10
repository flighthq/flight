export interface CapturedRegistrarPair {
  door: string;
  hadPrevious: boolean;
  key: unknown;
  previous: unknown;
  table: Map<unknown, unknown> | unknown[];
  value: unknown;
  weakMapOwned: boolean;
}

export interface RegistrarProbeRoot {
  label: string;
  value: object;
}

export interface RegistrarPairCollisionInput {
  packageName: string;
  pairs: readonly { door: string; implementation: string; kind: string }[];
  registrar: string;
}

export interface RegistrarPairCollision {
  claims: readonly { implementation: string; packageName: string; registrar: string }[];
  door: string;
  kind: string;
}

export type RegistrarPairDerivation = 'lost' | 'not-comparable' | 'survived';
export type RegistrarPairDerivationReason = 'module-global-no-source-state' | 'no-derived-state-adapter' | null;

// Capture real Map and ordered-array writes made below a generic registration door. The stack filter
// excludes scratch writes in an assembly body before or after its door call: a pair counts only while a
// ruled door is on the call path. Probes run serially because the prototype hooks are process-global.
export async function captureRegistrarPairs(
  doors: ReadonlySet<string>,
  callback: () => unknown | Promise<unknown>,
): Promise<CapturedRegistrarPair[]> {
  const captured: Omit<CapturedRegistrarPair, 'weakMapOwned'>[] = [];
  const weakMapValues = new Set<object>();
  const originalPush = Array.prototype.push;
  const originalSet = Map.prototype.set;
  const originalWeakSet = WeakMap.prototype.set;
  let recording = false;
  Map.prototype.set = function (key: unknown, value: unknown): Map<unknown, unknown> {
    if (recording) return originalSet.call(this, key, value);
    recording = true;
    try {
      const door = registrationDoorFromStack(doors, new Error().stack ?? '');
      if (door !== null) {
        originalPush.call(captured, {
          door,
          hadPrevious: this.has(key),
          key,
          previous: this.get(key),
          table: this,
          value,
        });
      }
      return originalSet.call(this, key, value);
    } finally {
      recording = false;
    }
  };
  Array.prototype.push = function (...values: unknown[]): number {
    if (recording) return originalPush.apply(this, values);
    recording = true;
    try {
      const door = registrationDoorFromStack(doors, new Error().stack ?? '');
      if (door !== null) {
        for (const value of values) {
          const entry = asRecord(value);
          originalPush.call(captured, {
            door,
            hadPrevious: false,
            key: entry?.kind ?? this.length,
            previous: undefined,
            table: this,
            value: entry?.matches ?? entry?.importDocument ?? value,
          });
        }
      }
      return originalPush.apply(this, values);
    } finally {
      recording = false;
    }
  };
  WeakMap.prototype.set = function (key: object, value: unknown): WeakMap<object, unknown> {
    if (typeof value === 'object' && value !== null) weakMapValues.add(value);
    return originalWeakSet.call(this, key, value);
  };
  try {
    await callback();
  } finally {
    Array.prototype.push = originalPush;
    Map.prototype.set = originalSet;
    WeakMap.prototype.set = originalWeakSet;
  }
  const weakMapOwnedTables = new Set<Map<unknown, unknown>>();
  for (const value of weakMapValues) {
    for (const table of collectReachableMaps(value)) weakMapOwnedTables.add(table);
  }
  return captured.map((pair) => ({
    ...pair,
    weakMapOwned: pair.table instanceof Map && weakMapOwnedTables.has(pair.table),
  }));
}

export function collectRegistrarTableNames(
  roots: readonly RegistrarProbeRoot[],
): Map<Map<unknown, unknown> | unknown[], string> {
  const names = new Map<Map<unknown, unknown> | unknown[], string>();
  const seen = new Set<object>();
  const pending = roots.map((root) => ({ path: root.label, value: root.value }));
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined || seen.has(item.value)) continue;
    seen.add(item.value);
    if (item.value instanceof Map || Array.isArray(item.value)) {
      names.set(item.value, item.path);
      continue;
    }
    for (const key of Reflect.ownKeys(item.value)) {
      const child = Object.getOwnPropertyDescriptor(item.value, key)?.value;
      if (typeof child !== 'object' || child === null) continue;
      if (!isProbeOwnedObject(child)) continue;
      pending.push({ path: `${item.path}${propertyPath(key)}`, value: child });
    }
  }
  return names;
}

export function findRegistrarPairCollisions(
  registrars: readonly RegistrarPairCollisionInput[],
): RegistrarPairCollision[] {
  const claims = new Map<string, Map<string, RegistrarPairCollision['claims'][number]>>();
  for (const registrar of registrars) {
    for (const pair of registrar.pairs) {
      const pairKey = `${pair.door}\0${pair.kind}`;
      const claimKey = `${registrar.packageName}\0${registrar.registrar}`;
      const pairClaims = claims.get(pairKey) ?? new Map();
      pairClaims.set(claimKey, {
        implementation: pair.implementation,
        packageName: registrar.packageName,
        registrar: registrar.registrar,
      });
      claims.set(pairKey, pairClaims);
    }
  }
  const collisions: RegistrarPairCollision[] = [];
  for (const [pairKey, pairClaims] of claims) {
    if (pairClaims.size < 2) continue;
    const [door = '', kind = ''] = pairKey.split('\0');
    collisions.push({ claims: [...pairClaims.values()], door, kind });
  }
  return collisions.sort((a, b) => a.door.localeCompare(b.door) || a.kind.localeCompare(b.kind));
}

export function classifyPairDerivation(
  pair: CapturedRegistrarPair,
  sourceState: object | null,
  derivedState: object | null,
): RegistrarPairDerivation {
  if (sourceState === null || derivedState === null) return 'not-comparable';
  if (pair.table instanceof Map) {
    const sourceMaps = collectReachableMaps(sourceState);
    if (!sourceMaps.has(pair.table)) return 'lost';
    for (const table of collectReachableMaps(derivedState)) {
      if (table.has(pair.key) && Object.is(table.get(pair.key), pair.value)) return 'survived';
    }
    return 'lost';
  }
  const sourceArrays = collectReachableArrays(sourceState);
  if (!sourceArrays.has(pair.table)) return 'lost';
  const pairIndex = findOrderedPairIndex(pair.table, pair.key, pair.value);
  if (pairIndex === -1) return 'lost';
  for (const table of collectReachableArrays(derivedState)) {
    if (hasOrderedPairAt(table, pairIndex, pair.key, pair.value)) return 'survived';
  }
  return 'lost';
}

export function explainPairDerivationScope(
  pair: CapturedRegistrarPair,
  sourceState: object | null,
  derivedState: object | null,
): RegistrarPairDerivationReason {
  if (sourceState === null) return 'module-global-no-source-state';
  if (derivedState === null) return 'no-derived-state-adapter';
  return null;
}

export function describeRuntimeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'symbol') return value.description ?? value.toString();
  if (typeof value === 'function') return value.name.length > 0 ? value.name : '<anonymous function>';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return String(value);
  const named = value as { kind?: unknown; name?: unknown };
  if (typeof named.kind === 'string') return `{kind:${named.kind}}`;
  if (typeof named.name === 'string') return `{name:${named.name}}`;
  const constructorName = value.constructor?.name;
  return constructorName === undefined || constructorName === 'Object' ? '<object>' : `<${constructorName}>`;
}

function registrationDoorFromStack(doors: ReadonlySet<string>, stack: string): string | null {
  for (const line of stack.split('\n')) {
    const match = /\bat ([A-Za-z_$][\w$]*)\b/.exec(line);
    const name = match?.[1];
    if (name !== undefined && doors.has(name)) return name;
  }
  return null;
}

function propertyPath(key: PropertyKey): string {
  if (typeof key === 'symbol') return `[${String(key)}]`;
  const name = String(key);
  return /^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`;
}

function asRecord(value: unknown): Record<PropertyKey, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<PropertyKey, unknown>) : null;
}

function isProbeOwnedObject(value: object): boolean {
  const name = value.constructor?.name ?? '';
  return !/^(?:CSS|Document|HTML|Location|Navigator|Node|Storage|Window)/.test(name);
}

function collectReachableMaps(root: object): Set<Map<unknown, unknown>> {
  const maps = new Set<Map<unknown, unknown>>();
  const seen = new Set<object>();
  const pending: object[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === undefined || seen.has(value)) continue;
    seen.add(value);
    if (value instanceof Map) {
      maps.add(value);
      for (const [key, entry] of value) {
        if (typeof key === 'object' && key !== null) pending.push(key);
        if (typeof entry === 'object' && entry !== null) pending.push(entry);
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const child = descriptor?.value;
      if (typeof child === 'object' && child !== null) pending.push(child);
    }
  }
  return maps;
}

function collectReachableArrays(root: object): Set<unknown[]> {
  const arrays = new Set<unknown[]>();
  const seen = new Set<object>();
  const pending: object[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === undefined || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) arrays.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const child = descriptor?.value;
      if (typeof child === 'object' && child !== null) pending.push(child);
    }
  }
  return arrays;
}

function findOrderedPairIndex(table: readonly unknown[], key: unknown, value: unknown): number {
  return table.findIndex((entry, index) => hasOrderedPairAt(table, index, key, value));
}

function hasOrderedPairAt(table: readonly unknown[], index: number, key: unknown, value: unknown): boolean {
  const entry = table[index];
  const record = asRecord(entry);
  const entryKey = record?.kind ?? index;
  const entryValue = record?.matches ?? record?.importDocument ?? entry;
  return Object.is(entryKey, key) && Object.is(entryValue, value);
}
