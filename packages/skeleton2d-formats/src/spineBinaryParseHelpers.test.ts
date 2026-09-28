import { describe, expect, it } from 'vitest';

import {
  SPINE_BINARY_ATTACHMENT_SEQUENCE,
  SPINE_BINARY_ATTACHMENT_TYPES,
  SPINE_BINARY_BOUNDS_BYTES,
  SPINE_BINARY_COLOR_BYTES,
  SPINE_BINARY_CURVE_BEZIER,
  SPINE_BINARY_CURVE_EPSILON,
  SPINE_BINARY_DEFAULT_SKIN_NAME,
  SPINE_BINARY_FPS_BYTES,
  SPINE_BINARY_HASH_BYTES,
  SPINE_BINARY_MESH_UV_BYTES,
  SPINE_BINARY_NO_ATTACHMENT_INDEX,
  SPINE_BINARY_NO_DARK_COLOR,
  SPINE_BINARY_PATH_MIX,
  SPINE_BINARY_SKIN_REQUIREMENT_LISTS,
  SPINE_BINARY_SLOT_ATTACHMENT,
  SPINE_BINARY_SLOT_RGBA,
  SPINE_BINARY_TRIANGLE_INDEX_BYTES,
  clampSpineBinaryUnit,
  readSpineBinaryStringReference,
  reportSpineBinaryCrumb,
  skipSpineBinaryCurveFrames,
  skipSpineBinaryCurveTag,
  tally,
} from './spineBinaryParseHelpers.ts';

describe('clampSpineBinaryUnit', () => {
  it('is a function', () => {
    expect(clampSpineBinaryUnit).toBeTypeOf('function');
  });
});

describe('readSpineBinaryStringReference', () => {
  it('is a function', () => {
    expect(readSpineBinaryStringReference).toBeTypeOf('function');
  });
});

describe('reportSpineBinaryCrumb', () => {
  it('is a function', () => {
    expect(reportSpineBinaryCrumb).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryCurveFrames', () => {
  it('is a function', () => {
    expect(skipSpineBinaryCurveFrames).toBeTypeOf('function');
  });
});

describe('skipSpineBinaryCurveTag', () => {
  it('is a function', () => {
    expect(skipSpineBinaryCurveTag).toBeTypeOf('function');
  });
});

describe('SPINE_BINARY_ATTACHMENT_SEQUENCE', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_ATTACHMENT_SEQUENCE).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_ATTACHMENT_TYPES', () => {
  it('is an array', () => {
    expect(Array.isArray(SPINE_BINARY_ATTACHMENT_TYPES)).toBe(true);
  });
});

describe('SPINE_BINARY_BOUNDS_BYTES', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_BOUNDS_BYTES).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_COLOR_BYTES', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_COLOR_BYTES).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_CURVE_BEZIER', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_CURVE_BEZIER).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_CURVE_EPSILON', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_CURVE_EPSILON).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_DEFAULT_SKIN_NAME', () => {
  it('is a string', () => {
    expect(SPINE_BINARY_DEFAULT_SKIN_NAME).toBeTypeOf('string');
  });
});

describe('SPINE_BINARY_FPS_BYTES', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_FPS_BYTES).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_HASH_BYTES', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_HASH_BYTES).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_MESH_UV_BYTES', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_MESH_UV_BYTES).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_NO_ATTACHMENT_INDEX', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_NO_ATTACHMENT_INDEX).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_NO_DARK_COLOR', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_NO_DARK_COLOR).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_PATH_MIX', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_PATH_MIX).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_SKIN_REQUIREMENT_LISTS', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_SKIN_REQUIREMENT_LISTS).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_SLOT_ATTACHMENT', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_SLOT_ATTACHMENT).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_SLOT_RGBA', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_SLOT_RGBA).toBeTypeOf('number');
  });
});

describe('SPINE_BINARY_TRIANGLE_INDEX_BYTES', () => {
  it('is a number', () => {
    expect(SPINE_BINARY_TRIANGLE_INDEX_BYTES).toBeTypeOf('number');
  });
});

describe('tally', () => {
  it('is a function', () => {
    expect(tally).toBeTypeOf('function');
  });
});
