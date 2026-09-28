import { describe, expect, it } from 'vitest';

import {
  dragonBonesDeformTimelineHandler,
  dragonBonesDeformTimelineReader,
  dragonBonesIkConstraintsSectionHandler,
  dragonBonesIkConstraintsSectionReader,
  dragonBonesIkTimelineHandler,
  dragonBonesIkTimelineReader,
  dragonBonesZOrderTimelineHandler,
  dragonBonesZOrderTimelineReader,
} from './dragonBonesStubHandlers.ts';

describe('dragonBonesDeformTimelineHandler', () => {
  it('is the deform timeline stub handler', () => {
    expect(dragonBonesDeformTimelineHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesDeformTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesDeformTimelineReader).toBe(dragonBonesDeformTimelineHandler);
  });
});

describe('dragonBonesIkConstraintsSectionHandler', () => {
  it('is the ik constraints section stub handler', () => {
    expect(dragonBonesIkConstraintsSectionHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesIkConstraintsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesIkConstraintsSectionReader).toBe(dragonBonesIkConstraintsSectionHandler);
  });
});

describe('dragonBonesIkTimelineHandler', () => {
  it('is the ik timeline stub handler', () => {
    expect(dragonBonesIkTimelineHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesIkTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesIkTimelineReader).toBe(dragonBonesIkTimelineHandler);
  });
});

describe('dragonBonesZOrderTimelineHandler', () => {
  it('is the z-order timeline stub handler', () => {
    expect(dragonBonesZOrderTimelineHandler).toBeTypeOf('function');
  });
});

describe('dragonBonesZOrderTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(dragonBonesZOrderTimelineReader).toBe(dragonBonesZOrderTimelineHandler);
  });
});
