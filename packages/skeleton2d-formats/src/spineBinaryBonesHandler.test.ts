import { describe, expect, it } from 'vitest';

import {
  skipSpineBinaryBonesSection,
  spineBinaryBonesSectionHandler,
  spineBinaryBonesSectionReader,
} from './spineBinaryBonesHandler.ts';

describe('skipSpineBinaryBonesSection', () => {
  it('is the bones section skip function', () => {
    expect(skipSpineBinaryBonesSection).toBeTypeOf('function');
  });
});

describe('spineBinaryBonesSectionHandler', () => {
  it('is the bones section handler', () => {
    expect(spineBinaryBonesSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryBonesSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryBonesSectionReader).toBe(spineBinaryBonesSectionHandler);
  });
});
