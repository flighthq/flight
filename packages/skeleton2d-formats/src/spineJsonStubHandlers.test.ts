import { describe, expect, it } from 'vitest';

import {
  spineJsonDeformTimelineHandler,
  spineJsonDeformTimelineReader,
  spineJsonEventsSectionHandler,
  spineJsonEventsSectionReader,
  spineJsonEventTimelineHandler,
  spineJsonEventTimelineReader,
  spineJsonIkConstraintsSectionHandler,
  spineJsonIkConstraintsSectionReader,
  spineJsonIkTimelineHandler,
  spineJsonIkTimelineReader,
  spineJsonPathConstraintsSectionHandler,
  spineJsonPathConstraintsSectionReader,
  spineJsonPathTimelineHandler,
  spineJsonPathTimelineReader,
  spineJsonTransformConstraintsSectionHandler,
  spineJsonTransformConstraintsSectionReader,
  spineJsonTransformTimelineHandler,
  spineJsonTransformTimelineReader,
} from './spineJsonStubHandlers.ts';

describe('spineJsonDeformTimelineHandler', () => {
  it('is the deform timeline stub handler', () => {
    expect(spineJsonDeformTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonDeformTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonDeformTimelineReader).toBe(spineJsonDeformTimelineHandler);
  });
});

describe('spineJsonEventsSectionHandler', () => {
  it('is the events section stub handler', () => {
    expect(spineJsonEventsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonEventsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonEventsSectionReader).toBe(spineJsonEventsSectionHandler);
  });
});

describe('spineJsonEventTimelineHandler', () => {
  it('is the event timeline stub handler', () => {
    expect(spineJsonEventTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonEventTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonEventTimelineReader).toBe(spineJsonEventTimelineHandler);
  });
});

describe('spineJsonIkConstraintsSectionHandler', () => {
  it('is the ik constraints section stub handler', () => {
    expect(spineJsonIkConstraintsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonIkConstraintsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonIkConstraintsSectionReader).toBe(spineJsonIkConstraintsSectionHandler);
  });
});

describe('spineJsonIkTimelineHandler', () => {
  it('is the ik timeline stub handler', () => {
    expect(spineJsonIkTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonIkTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonIkTimelineReader).toBe(spineJsonIkTimelineHandler);
  });
});

describe('spineJsonPathConstraintsSectionHandler', () => {
  it('is the path constraints section stub handler', () => {
    expect(spineJsonPathConstraintsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonPathConstraintsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonPathConstraintsSectionReader).toBe(spineJsonPathConstraintsSectionHandler);
  });
});

describe('spineJsonPathTimelineHandler', () => {
  it('is the path timeline stub handler', () => {
    expect(spineJsonPathTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonPathTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonPathTimelineReader).toBe(spineJsonPathTimelineHandler);
  });
});

describe('spineJsonTransformConstraintsSectionHandler', () => {
  it('is the transform constraints section stub handler', () => {
    expect(spineJsonTransformConstraintsSectionHandler).toBeTypeOf('function');
  });
});

describe('spineJsonTransformConstraintsSectionReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonTransformConstraintsSectionReader).toBe(spineJsonTransformConstraintsSectionHandler);
  });
});

describe('spineJsonTransformTimelineHandler', () => {
  it('is the transform timeline stub handler', () => {
    expect(spineJsonTransformTimelineHandler).toBeTypeOf('function');
  });
});

describe('spineJsonTransformTimelineReader', () => {
  it('is an alias for the handler', () => {
    expect(spineJsonTransformTimelineReader).toBe(spineJsonTransformTimelineHandler);
  });
});
