import { EntityRuntimeKey } from '@flighthq/types';

import { createEntity } from './entity';
import {
  areEntityRuntimeGuardsEnabled,
  createGuardedEntity,
  createGuardedEntityRuntime,
  enableEntityRuntimeGuards,
} from './guards';
import { createEntityRuntime } from './runtime';

describe('areEntityRuntimeGuardsEnabled', () => {
  it('returns false before enableEntityRuntimeGuards is called', () => {
    // Vitest isolates modules per file, so this starts false in a fresh module import.
    expect(areEntityRuntimeGuardsEnabled()).toBe(false);
  });
});

describe('createGuardedEntity', () => {
  it('returns the entity unchanged when guards are not enabled', () => {
    const entity = createEntity({ x: 1 });
    const guarded = createGuardedEntity(entity);
    expect(guarded).toBe(entity);
  });
});

describe('createGuardedEntityRuntime', () => {
  it('returns the runtime unchanged when guards are not enabled', () => {
    const runtime = createEntityRuntime();
    const guarded = createGuardedEntityRuntime(runtime);
    expect(guarded).toBe(runtime);
  });
});

describe('enableEntityRuntimeGuards', () => {
  it('enables guards', () => {
    enableEntityRuntimeGuards();
    expect(areEntityRuntimeGuardsEnabled()).toBe(true);
  });

  it('createGuardedEntity returns a proxy when guards are enabled', () => {
    enableEntityRuntimeGuards();
    const entity = createEntity({ x: 1 });
    const guarded = createGuardedEntity(entity);
    expect(guarded.x).toBe(1);
  });

  it('createGuardedEntityRuntime returns a proxy when guards are enabled', () => {
    enableEntityRuntimeGuards();
    const runtime = createEntityRuntime();
    const guarded = createGuardedEntityRuntime(runtime);
    expect(guarded.binding).toBeNull();
  });

  it('guarded entity warns on direct EntityRuntimeKey write', () => {
    enableEntityRuntimeGuards();
    const entity = createEntity();
    const guarded = createGuardedEntity(entity);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    guarded[EntityRuntimeKey] = undefined;
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[entity]'), expect.anything());
    warnSpy.mockRestore();
  });
});
