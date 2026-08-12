import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { EntityRuntimeWriteSlot } from '@flighthq/types/contract';

import { createEntity } from './entity';
import {
  areEntityRuntimeGuardsEnabled,
  createGuardedEntity,
  createGuardedEntityRuntime,
  setEntityRuntimeGuardMode,
  setEntityRuntimeWriteGuard,
} from './guards';
import { createEntityRuntime } from './runtime';

describe('areEntityRuntimeGuardsEnabled', () => {
  it('returns false before guard mode is switched on', () => {
    // Vitest isolates modules per file, so this starts false in a fresh module import.
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});

describe('createGuardedEntity', () => {
  it('returns the entity unchanged when guards are not enabled', () => {
    const entity = createEntity({ x: 1 });
    expect(createGuardedEntity(entity)).toBe(entity);
  });
});

describe('createGuardedEntityRuntime', () => {
  it('returns the runtime unchanged when guards are not enabled', () => {
    const runtime = createEntityRuntime();
    expect(createGuardedEntityRuntime(runtime)).toBe(runtime);
  });
});

describe('setEntityRuntimeGuardMode', () => {
  it('switches the proxies on and back off', () => {
    setEntityRuntimeGuardMode(true);
    try {
      expect(areEntityRuntimeGuardsEnabled()).toBe(true);
      const entity = createEntity({ x: 1 });
      expect(createGuardedEntity(entity).x).toBe(1);
      expect(createGuardedEntityRuntime(createEntityRuntime()).binding).toBeNull();
    } finally {
      setEntityRuntimeGuardMode(false);
    }
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });

  it('stays disabled when Proxy is unavailable', () => {
    const originalProxy = globalThis.Proxy;
    let enabled: boolean;
    Object.defineProperty(globalThis, 'Proxy', { configurable: true, value: undefined, writable: true });
    try {
      setEntityRuntimeGuardMode(true);
      enabled = areEntityRuntimeGuardsEnabled();
    } finally {
      Object.defineProperty(globalThis, 'Proxy', { configurable: true, value: originalProxy, writable: true });
      setEntityRuntimeGuardMode(false);
    }

    expect(enabled!).toBe(false);
  });

  it('returns the original values when Proxy disappears after guards are enabled', () => {
    const entity = createEntity({ x: 1 });
    const runtime = createEntityRuntime();
    const originalProxy = globalThis.Proxy;
    let guardedEntity: typeof entity;
    let guardedRuntime: typeof runtime;
    setEntityRuntimeGuardMode(true);
    Object.defineProperty(globalThis, 'Proxy', { configurable: true, value: undefined, writable: true });
    try {
      guardedEntity = createGuardedEntity(entity);
      guardedRuntime = createGuardedEntityRuntime(runtime);
    } finally {
      Object.defineProperty(globalThis, 'Proxy', { configurable: true, value: originalProxy, writable: true });
      setEntityRuntimeGuardMode(false);
    }

    expect(guardedEntity!).toBe(entity);
    expect(guardedRuntime!).toBe(runtime);
  });
});

describe('setEntityRuntimeWriteGuard', () => {
  it('reports which slot a direct write landed on, and still ALLOWS the write', () => {
    const slots: EntityRuntimeWriteSlot[] = [];
    setEntityRuntimeGuardMode(true);
    setEntityRuntimeWriteGuard((slot) => slots.push(slot));
    try {
      const guardedEntity = createGuardedEntity(createEntity());
      guardedEntity[EntityRuntimeKey] = undefined;
      const guardedRuntime = createGuardedEntityRuntime(createEntityRuntime());
      guardedRuntime.binding = null;
      expect(slots).toEqual(['runtime-slot', 'binding-slot']);
      // The guard observes; it does not block. The write must land.
      expect(EntityRuntimeKey in guardedEntity).toBe(true);
    } finally {
      setEntityRuntimeWriteGuard(null);
      setEntityRuntimeGuardMode(false);
    }
  });

  it('is silent once uninstalled', () => {
    const slots: EntityRuntimeWriteSlot[] = [];
    setEntityRuntimeGuardMode(true);
    setEntityRuntimeWriteGuard((slot) => slots.push(slot));
    setEntityRuntimeWriteGuard(null);
    try {
      createGuardedEntity(createEntity())[EntityRuntimeKey] = undefined;
      expect(slots).toEqual([]);
    } finally {
      setEntityRuntimeGuardMode(false);
    }
  });

  it('ignores writes to ordinary properties', () => {
    const slots: EntityRuntimeWriteSlot[] = [];
    setEntityRuntimeGuardMode(true);
    setEntityRuntimeWriteGuard((slot) => slots.push(slot));
    try {
      const guardedEntity = createGuardedEntity(createEntity({ x: 1 }));
      guardedEntity.x = 2;
      const guardedRuntime = createGuardedEntityRuntime(createEntityRuntime()) as ReturnType<
        typeof createEntityRuntime
      > & { other?: number };
      guardedRuntime.other = 3;
      expect(guardedEntity.x).toBe(2);
      expect(guardedRuntime.other).toBe(3);
      expect(slots).toEqual([]);
    } finally {
      setEntityRuntimeWriteGuard(null);
      setEntityRuntimeGuardMode(false);
    }
  });

  it('keeps existing proxies silent after guard mode is disabled', () => {
    const slots: EntityRuntimeWriteSlot[] = [];
    setEntityRuntimeGuardMode(true);
    setEntityRuntimeWriteGuard((slot) => slots.push(slot));
    const guardedEntity = createGuardedEntity(createEntity());
    const guardedRuntime = createGuardedEntityRuntime(createEntityRuntime());
    setEntityRuntimeGuardMode(false);
    try {
      guardedEntity[EntityRuntimeKey] = undefined;
      guardedRuntime.binding = {};
      expect(slots).toEqual([]);
      expect(guardedRuntime.binding).toEqual({});
    } finally {
      setEntityRuntimeWriteGuard(null);
      setEntityRuntimeGuardMode(false);
    }
  });
});
