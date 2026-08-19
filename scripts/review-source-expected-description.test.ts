import { describe, expect, it } from 'vitest';

import {
  sourceContainsExpectedDescription,
  sourceDeclaresFunctionalBackendControl,
  sourceWithheldExpectedDescription,
} from '../tools/review/src/sourceExpectedDescription';

describe('sourceDeclaresFunctionalBackendControl', () => {
  it('recognizes the exported const declaration with or without an as-const assertion', () => {
    expect(sourceDeclaresFunctionalBackendControl("export const functionalBackendSupport = 'control' as const;")).toBe(
      true,
    );
    expect(sourceDeclaresFunctionalBackendControl('export const functionalBackendSupport = "control";')).toBe(true);
  });

  it('does not turn comments, local variables, or other support values into control cells', () => {
    expect(
      sourceDeclaresFunctionalBackendControl(`
        // export const functionalBackendSupport = 'control';
        const functionalBackendSupport = 'control';
      `),
    ).toBe(false);
    expect(sourceDeclaresFunctionalBackendControl("export const functionalBackendSupport = 'partial';")).toBe(false);
  });
});

describe('sourceContainsExpectedDescription', () => {
  it('accepts the functional-target field form', () => {
    expect(
      sourceContainsExpectedDescription(`
        createFunctionalTarget({
          expectedImageDescription: 'a red square',
        });
      `),
    ).toBe(true);
  });

  it('accepts the call form used by effect-pipeline scenes', () => {
    expect(sourceContainsExpectedDescription(`declareExpectedImageDescription('a red square');`)).toBe(true);
  });

  it('does not mistake prose or unrelated identifiers for a declaration', () => {
    expect(
      sourceContainsExpectedDescription(`
        // expectedImageDescription and declareExpectedImageDescription are discussed here.
        const expectedImageDescriptionStatus = 'missing';
        createFunctionalTarget({ background: 0x000000ff });
      `),
    ).toBe(false);
  });
});

describe('sourceWithheldExpectedDescription', () => {
  // A withheld scene is not an undescribed one. Without this the review UI falls through to "this scene
  // has no expectedImageDescription" and asks a reviewer to author what somebody deliberately declined.
  it('returns the reason a scene gives for withholding its description', () => {
    expect(
      sourceWithheldExpectedDescription('declareExpectedImageDescriptionWithheld("shader bug: sectors degenerate");'),
    ).toBe('shader bug: sectors degenerate');
  });

  // Reasons are concatenations for the same line-width reason descriptions are.
  it('joins a reason split across concatenated operands', () => {
    expect(sourceWithheldExpectedDescription('declareExpectedImageDescriptionWithheld("a " + "b " + "c");')).toBe(
      'a b c',
    );
  });

  it('returns null for an empty reason, which is not a withholding', () => {
    expect(sourceWithheldExpectedDescription('declareExpectedImageDescriptionWithheld("");')).toBeNull();
  });

  it('returns null for a described scene', () => {
    expect(sourceWithheldExpectedDescription('declareExpectedImageDescription("a red square");')).toBeNull();
  });
});
