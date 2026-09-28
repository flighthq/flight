import type { DragonBonesSectionHandler, DragonBonesSectionKind } from '@flighthq/types/contract';
import { DragonBonesSectionKind as SectionKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { dragonBonesAnimationsSectionHandler } from './dragonBonesAnimationsHandler.ts';
import { dragonBonesBonesSectionHandler } from './dragonBonesBonesHandler.ts';
import { createDragonBonesRegistry, getDragonBonesSectionHandler } from './dragonBonesRegistry.ts';
import { dragonBonesAllSectionHandlers, registerDragonBonesSectionHandlers } from './dragonBonesSectionHandlers.ts';
import { dragonBonesSkinsSectionHandler } from './dragonBonesSkinsHandler.ts';
import { dragonBonesSlotsSectionHandler } from './dragonBonesSlotsHandler.ts';
import { dragonBonesIkConstraintsSectionHandler } from './dragonBonesStubHandlers.ts';

function expectRegisteredSection(kind: DragonBonesSectionKind, handler: DragonBonesSectionHandler): void {
  const registry = createDragonBonesRegistry();
  registerDragonBonesSectionHandlers(registry);
  expect(getDragonBonesSectionHandler(registry, kind)).toBe(handler);
}

describe('dragonBonesAllSectionHandlers', () => {
  it('contains every built-in section handler', () => {
    expect(dragonBonesAllSectionHandlers).toContain(dragonBonesAnimationsSectionHandler);
    expect(dragonBonesAllSectionHandlers).toContain(dragonBonesBonesSectionHandler);
    expect(dragonBonesAllSectionHandlers).toContain(dragonBonesIkConstraintsSectionHandler);
    expect(dragonBonesAllSectionHandlers).toContain(dragonBonesSkinsSectionHandler);
    expect(dragonBonesAllSectionHandlers).toContain(dragonBonesSlotsSectionHandler);
    expect(dragonBonesAllSectionHandlers).toHaveLength(5);
  });
});

describe('dragonBonesAnimationsSectionHandler', () => {
  it('is the built-in Animations section handler', () => {
    expectRegisteredSection(SectionKind.Animations, dragonBonesAnimationsSectionHandler);
  });
});

describe('dragonBonesBonesSectionHandler', () => {
  it('is the built-in Bones section handler', () => {
    expectRegisteredSection(SectionKind.Bones, dragonBonesBonesSectionHandler);
  });
});

describe('dragonBonesIkConstraintsSectionHandler', () => {
  it('is the built-in IkConstraints section handler', () => {
    expectRegisteredSection(SectionKind.IkConstraints, dragonBonesIkConstraintsSectionHandler);
  });
});

describe('dragonBonesSkinsSectionHandler', () => {
  it('is the built-in Skins section handler', () => {
    expectRegisteredSection(SectionKind.Skins, dragonBonesSkinsSectionHandler);
  });
});

describe('dragonBonesSlotsSectionHandler', () => {
  it('is the built-in Slots section handler', () => {
    expectRegisteredSection(SectionKind.Slots, dragonBonesSlotsSectionHandler);
  });
});

describe('registerDragonBonesSectionHandlers', () => {
  it('registers exactly one handler for every section kind and no timeline handlers', () => {
    const registry = createDragonBonesRegistry();
    registerDragonBonesSectionHandlers(registry);
    expect(registry.sectionHandlers.map((entry) => entry.kind).sort()).toEqual(Object.values(SectionKind).sort());
    expect(registry.timelineHandlers).toEqual([]);
  });
});
