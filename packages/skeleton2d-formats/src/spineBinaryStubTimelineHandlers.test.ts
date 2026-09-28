import { describe, expect, it } from 'vitest';

import {
  skipSpineBinaryDeformTimelines,
  skipSpineBinaryEventTimelines,
  skipSpineBinaryIkTimelines,
  skipSpineBinaryPathTimelines,
  skipSpineBinaryTransformTimelines,
  spineBinaryDeformTimelineHandler,
  spineBinaryDeformTimelineReader,
  spineBinaryEventTimelineHandler,
  spineBinaryEventTimelineReader,
  spineBinaryIkTimelineHandler,
  spineBinaryIkTimelineReader,
  spineBinaryPathTimelineHandler,
  spineBinaryPathTimelineReader,
  spineBinaryTransformTimelineHandler,
  spineBinaryTransformTimelineReader,
} from './spineBinaryStubTimelineHandlers.ts';

describe('skipSpineBinaryDeformTimelines', () => {
  it('is the deform timeline skip function', () => {
    expect(skipSpineBinaryDeformTimelines).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryEventTimelines', () => {
  it('is the event timeline skip function', () => {
    expect(skipSpineBinaryEventTimelines).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryIkTimelines', () => {
  it('is the ik timeline skip function', () => {
    expect(skipSpineBinaryIkTimelines).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryPathTimelines', () => {
  it('is the path timeline skip function', () => {
    expect(skipSpineBinaryPathTimelines).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryTransformTimelines', () => {
  it('is the transform timeline skip function', () => {
    expect(skipSpineBinaryTransformTimelines).toBeTypeOf('function');
  });
});

describe('spineBinaryDeformTimelineHandler', () => {
  it('is the deform timeline handler', () => {
    expect(spineBinaryDeformTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryDeformTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryDeformTimelineReader).toBe(spineBinaryDeformTimelineHandler);
  });
});

describe('spineBinaryEventTimelineHandler', () => {
  it('is the event timeline handler', () => {
    expect(spineBinaryEventTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryEventTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryEventTimelineReader).toBe(spineBinaryEventTimelineHandler);
  });
});

describe('spineBinaryIkTimelineHandler', () => {
  it('is the ik timeline handler', () => {
    expect(spineBinaryIkTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryIkTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryIkTimelineReader).toBe(spineBinaryIkTimelineHandler);
  });
});

describe('spineBinaryPathTimelineHandler', () => {
  it('is the path timeline handler', () => {
    expect(spineBinaryPathTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryPathTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryPathTimelineReader).toBe(spineBinaryPathTimelineHandler);
  });
});

describe('spineBinaryTransformTimelineHandler', () => {
  it('is the transform timeline handler', () => {
    expect(spineBinaryTransformTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineBinaryTransformTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineBinaryTransformTimelineReader).toBe(spineBinaryTransformTimelineHandler);
  });
});
