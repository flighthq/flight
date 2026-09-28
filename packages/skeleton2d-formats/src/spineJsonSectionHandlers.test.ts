import type { SpineJsonSectionHandler, SpineJsonSectionKind } from '@flighthq/types/contract';
import { SpineJsonSectionKind as SectionKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { spineJsonAnimationsSectionHandler } from './spineJsonAnimationsHandler.ts';
import { spineJsonBonesSectionHandler } from './spineJsonBonesHandler.ts';
import { createSpineJsonRegistry, getSpineJsonSectionHandler } from './spineJsonRegistry.ts';
import { registerSpineJsonSectionHandlers } from './spineJsonSectionHandlers.ts';
import { spineJsonSkinsSectionHandler } from './spineJsonSkinsHandler.ts';
import { spineJsonSlotsSectionHandler } from './spineJsonSlotsHandler.ts';
import {
  spineJsonEventsSectionHandler,
  spineJsonIkConstraintsSectionHandler,
  spineJsonPathConstraintsSectionHandler,
  spineJsonTransformConstraintsSectionHandler,
} from './spineJsonStubHandlers.ts';

function expectRegisteredSection(kind: SpineJsonSectionKind, handler: SpineJsonSectionHandler): void {
  const registry = createSpineJsonRegistry();
  registerSpineJsonSectionHandlers(registry);
  expect(getSpineJsonSectionHandler(registry, kind)).toBe(handler);
}

describe('registerSpineJsonSectionHandlers', () => {
  it('registers exactly one handler for every section kind and no timeline handlers', () => {
    const registry = createSpineJsonRegistry();
    registerSpineJsonSectionHandlers(registry);
    expect(registry.sectionHandlers.map((entry) => entry.kind).sort()).toEqual(Object.values(SectionKind).sort());
    expect(registry.timelineHandlers).toEqual([]);
  });
});

describe('spineJsonAnimationsSectionHandler', () => {
  it('is the built-in Animations section handler', () => {
    expectRegisteredSection(SectionKind.Animations, spineJsonAnimationsSectionHandler);
  });
});

describe('spineJsonBonesSectionHandler', () => {
  it('is the built-in Bones section handler', () => {
    expectRegisteredSection(SectionKind.Bones, spineJsonBonesSectionHandler);
  });
});

describe('spineJsonEventsSectionHandler', () => {
  it('is the built-in Events section handler', () => {
    expectRegisteredSection(SectionKind.Events, spineJsonEventsSectionHandler);
  });
});

describe('spineJsonIkConstraintsSectionHandler', () => {
  it('is the built-in IkConstraints section handler', () => {
    expectRegisteredSection(SectionKind.IkConstraints, spineJsonIkConstraintsSectionHandler);
  });
});

describe('spineJsonPathConstraintsSectionHandler', () => {
  it('is the built-in PathConstraints section handler', () => {
    expectRegisteredSection(SectionKind.PathConstraints, spineJsonPathConstraintsSectionHandler);
  });
});

describe('spineJsonSkinsSectionHandler', () => {
  it('is the built-in Skins section handler', () => {
    expectRegisteredSection(SectionKind.Skins, spineJsonSkinsSectionHandler);
  });
});

describe('spineJsonSlotsSectionHandler', () => {
  it('is the built-in Slots section handler', () => {
    expectRegisteredSection(SectionKind.Slots, spineJsonSlotsSectionHandler);
  });
});

describe('spineJsonTransformConstraintsSectionHandler', () => {
  it('is the built-in TransformConstraints section handler', () => {
    expectRegisteredSection(SectionKind.TransformConstraints, spineJsonTransformConstraintsSectionHandler);
  });
});
