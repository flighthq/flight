import { describe, expect, it } from 'vitest';

import {
  SPINE_DEFAULT_SKIN_NAME,
  SPINE_NO_ATTACHMENT_INDEX,
  buildSpineSegmentEasings,
  clampUnit,
  indexOfBone,
  indexOfSpineSlot,
  numberOr,
  parseSpineColor,
  skipCrumbSpineTimelineGroup,
} from './spineParseHelpers.ts';

describe('buildSpineSegmentEasings', () => {
  it('is a function', () => {
    expect(buildSpineSegmentEasings).toBeTypeOf('function');
  });
});

describe('clampUnit', () => {
  it('is a function', () => {
    expect(clampUnit).toBeTypeOf('function');
  });
});

describe('indexOfBone', () => {
  it('is a function', () => {
    expect(indexOfBone).toBeTypeOf('function');
  });
});

describe('indexOfSpineSlot', () => {
  it('is a function', () => {
    expect(indexOfSpineSlot).toBeTypeOf('function');
  });
});

describe('numberOr', () => {
  it('is a function', () => {
    expect(numberOr).toBeTypeOf('function');
  });
});

describe('parseSpineColor', () => {
  it('is a function', () => {
    expect(parseSpineColor).toBeTypeOf('function');
  });
});

describe('skipCrumbSpineTimelineGroup', () => {
  it('is a function', () => {
    expect(skipCrumbSpineTimelineGroup).toBeTypeOf('function');
  });
});

describe('SPINE_DEFAULT_SKIN_NAME', () => {
  it('is a string constant', () => {
    expect(SPINE_DEFAULT_SKIN_NAME).toBeTypeOf('string');
  });
});

describe('SPINE_NO_ATTACHMENT_INDEX', () => {
  it('is a numeric constant', () => {
    expect(SPINE_NO_ATTACHMENT_INDEX).toBeTypeOf('number');
  });
});
