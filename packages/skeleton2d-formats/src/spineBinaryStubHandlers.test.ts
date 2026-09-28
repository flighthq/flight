import { describe, expect, it } from 'vitest';

import {
  skipSpineBinaryEventsSection,
  skipSpineBinaryIkConstraintsSection,
  skipSpineBinaryPathConstraintsSection,
  skipSpineBinaryTransformConstraintsSection,
  spineBinaryEventsSectionHandler,
  spineBinaryEventsSectionReader,
  spineBinaryIkConstraintsSectionHandler,
  spineBinaryIkConstraintsSectionReader,
  spineBinaryPathConstraintsSectionHandler,
  spineBinaryPathConstraintsSectionReader,
  spineBinaryTransformConstraintsSectionHandler,
  spineBinaryTransformConstraintsSectionReader,
} from './spineBinaryStubHandlers.ts';

describe('skipSpineBinaryEventsSection', () => {
  it('is the events section skip function', () => {
    expect(skipSpineBinaryEventsSection).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryIkConstraintsSection', () => {
  it('is the ik constraints section skip function', () => {
    expect(skipSpineBinaryIkConstraintsSection).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryPathConstraintsSection', () => {
  it('is the path constraints section skip function', () => {
    expect(skipSpineBinaryPathConstraintsSection).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryTransformConstraintsSection', () => {
  it('is the transform constraints section skip function', () => {
    expect(skipSpineBinaryTransformConstraintsSection).toBeTypeOf('function');
  });
});

describe('spineBinaryEventsSectionHandler', () => {
  it('is the events section handler', () => {
    expect(spineBinaryEventsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryEventsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryEventsSectionReader).toBe(spineBinaryEventsSectionHandler);
  });
});

describe('spineBinaryIkConstraintsSectionHandler', () => {
  it('is the ik constraints section handler', () => {
    expect(spineBinaryIkConstraintsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryIkConstraintsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryIkConstraintsSectionReader).toBe(spineBinaryIkConstraintsSectionHandler);
  });
});

describe('spineBinaryPathConstraintsSectionHandler', () => {
  it('is the path constraints section handler', () => {
    expect(spineBinaryPathConstraintsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryPathConstraintsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryPathConstraintsSectionReader).toBe(spineBinaryPathConstraintsSectionHandler);
  });
});

describe('spineBinaryTransformConstraintsSectionHandler', () => {
  it('is the transform constraints section handler', () => {
    expect(spineBinaryTransformConstraintsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryTransformConstraintsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryTransformConstraintsSectionReader).toBe(spineBinaryTransformConstraintsSectionHandler);
  });
});
