import type { SpineBinarySectionHandler, SpineBinarySectionKind } from '@flighthq/types/contract';
import { SpineBinarySectionKind as SectionKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createSpineBinaryRegistry, getSpineBinarySectionHandler } from './spineBinaryRegistry';
import {
  registerSpineBinarySectionHandlers,
  spineBinaryAnimationsSectionHandler,
  spineBinaryBonesSectionHandler,
  spineBinaryEventsSectionHandler,
  spineBinaryIkConstraintsSectionHandler,
  spineBinaryPathConstraintsSectionHandler,
  spineBinarySkinsSectionHandler,
  spineBinarySlotsSectionHandler,
  spineBinaryTransformConstraintsSectionHandler,
} from './spineBinarySectionHandlers';

function expectRegisteredSection(kind: SpineBinarySectionKind, handler: SpineBinarySectionHandler): void {
  const registry = createSpineBinaryRegistry();
  registerSpineBinarySectionHandlers(registry);
  expect(getSpineBinarySectionHandler(registry, kind)).toBe(handler);
}

describe('registerSpineBinarySectionHandlers', () => {
  it('registers only the six top-level section handlers', () => {
    const registry = createSpineBinaryRegistry();
    registerSpineBinarySectionHandlers(registry);
    expect(registry.sectionHandlers).toHaveLength(8);
    expect(registry.timelineHandlers).toEqual([]);
  });
});

describe('spineBinaryAnimationsSectionHandler', () => {
  it('is the built-in Animations section handler', () => {
    expectRegisteredSection(SectionKind.Animations, spineBinaryAnimationsSectionHandler);
  });
});

describe('spineBinaryBonesSectionHandler', () => {
  it('is the built-in Bones section handler', () => {
    expectRegisteredSection(SectionKind.Bones, spineBinaryBonesSectionHandler);
  });
});

describe('spineBinaryEventsSectionHandler', () => {
  it('is the built-in Events section handler', () => {
    expectRegisteredSection(SectionKind.Events, spineBinaryEventsSectionHandler);
  });
});

describe('spineBinaryIkConstraintsSectionHandler', () => {
  it('is the built-in IkConstraints section handler', () => {
    expectRegisteredSection(SectionKind.IkConstraints, spineBinaryIkConstraintsSectionHandler);
  });
});

describe('spineBinaryPathConstraintsSectionHandler', () => {
  it('is the built-in PathConstraints section handler', () => {
    expectRegisteredSection(SectionKind.PathConstraints, spineBinaryPathConstraintsSectionHandler);
  });
});

describe('spineBinarySkinsSectionHandler', () => {
  it('is the built-in Skins section handler', () => {
    expectRegisteredSection(SectionKind.Skins, spineBinarySkinsSectionHandler);
  });
});

describe('spineBinarySlotsSectionHandler', () => {
  it('is the built-in Slots section handler', () => {
    expectRegisteredSection(SectionKind.Slots, spineBinarySlotsSectionHandler);
  });
});

describe('spineBinaryTransformConstraintsSectionHandler', () => {
  it('is the built-in TransformConstraints section handler', () => {
    expectRegisteredSection(SectionKind.TransformConstraints, spineBinaryTransformConstraintsSectionHandler);
  });
});
