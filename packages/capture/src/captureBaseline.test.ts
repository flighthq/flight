import { describe, expect, it } from 'vitest';

import {
  createCaptureBaseline,
  formatCaptureBaseline,
  getCaptureBaselineField,
  parseCaptureBaseline,
  setCaptureBaselineField,
} from './captureBaseline';

describe('createCaptureBaseline', () => {
  it('allocates an empty record', () => {
    const baseline = createCaptureBaseline();
    expect(baseline).toEqual({});
    expect(getCaptureBaselineField(baseline, 'canvas', 'fingerprint')).toBeNull();
  });

  it('allocates a distinct record each call', () => {
    const a = createCaptureBaseline();
    const b = createCaptureBaseline();
    setCaptureBaselineField(a, 'canvas', 'fingerprint', '1:000000');
    expect(getCaptureBaselineField(b, 'canvas', 'fingerprint')).toBeNull();
  });
});

describe('formatCaptureBaseline', () => {
  it('sorts columns, orders fields, indents by two spaces, and ends with a newline', () => {
    const baseline = createCaptureBaseline();
    setCaptureBaselineField(baseline, 'flight:webgl', 'sha256', 'aaa');
    setCaptureBaselineField(baseline, 'flight:webgl', 'fingerprint', '1:ffffff');
    setCaptureBaselineField(baseline, 'canvas', 'fingerprint', '1:000000');
    expect(formatCaptureBaseline(baseline)).toBe(
      '{\n' +
        '  "canvas": {\n' +
        '    "fingerprint": "1:000000"\n' +
        '  },\n' +
        '  "flight:webgl": {\n' +
        '    "fingerprint": "1:ffffff",\n' +
        '    "sha256": "aaa"\n' +
        '  }\n' +
        '}\n',
    );
  });

  it('omits undefined fields', () => {
    const baseline = createCaptureBaseline();
    setCaptureBaselineField(baseline, 'canvas', 'sha256', 'hash');
    expect(formatCaptureBaseline(baseline)).toBe('{\n  "canvas": {\n    "sha256": "hash"\n  }\n}\n');
  });

  it('serializes the empty baseline as an empty object with a trailing newline', () => {
    expect(formatCaptureBaseline(createCaptureBaseline())).toBe('{}\n');
  });
});

describe('getCaptureBaselineField', () => {
  it('returns null for absent columns and fields', () => {
    const baseline = createCaptureBaseline();
    setCaptureBaselineField(baseline, 'canvas', 'fingerprint', '1:000000');
    expect(getCaptureBaselineField(baseline, 'canvas', 'sha256')).toBeNull();
    expect(getCaptureBaselineField(baseline, 'webgl', 'fingerprint')).toBeNull();
  });

  it('reads a set field across independent columns', () => {
    const baseline = createCaptureBaseline();
    setCaptureBaselineField(baseline, 'canvas', 'fingerprint', '1:000000');
    setCaptureBaselineField(baseline, 'webgl', 'fingerprint', '1:ffffff');
    expect(getCaptureBaselineField(baseline, 'canvas', 'fingerprint')).toBe('1:000000');
    expect(getCaptureBaselineField(baseline, 'webgl', 'fingerprint')).toBe('1:ffffff');
  });
});

describe('parseCaptureBaseline', () => {
  it('round-trips format output to a stable, equal record', () => {
    const baseline = createCaptureBaseline();
    setCaptureBaselineField(baseline, 'flight:webgl', 'fingerprint', '1:ffffff');
    setCaptureBaselineField(baseline, 'flight:webgl', 'sha256', 'aaa');
    setCaptureBaselineField(baseline, 'canvas', 'fingerprint', '1:000000');
    const text = formatCaptureBaseline(baseline);
    const parsed = parseCaptureBaseline(text);
    expect(parsed).toEqual(baseline);
    expect(parsed).not.toBeNull();
    expect(formatCaptureBaseline(parsed!)).toBe(text);
  });

  it('returns null for malformed JSON', () => {
    expect(parseCaptureBaseline('{not json')).toBeNull();
  });

  it('returns null for a non-object top-level value', () => {
    expect(parseCaptureBaseline('42')).toBeNull();
    expect(parseCaptureBaseline('[]')).toBeNull();
    expect(parseCaptureBaseline('null')).toBeNull();
  });
});

describe('setCaptureBaselineField', () => {
  it('creates the column entry on first write and merges later fields', () => {
    const baseline = createCaptureBaseline();
    setCaptureBaselineField(baseline, 'canvas', 'fingerprint', '1:000000');
    setCaptureBaselineField(baseline, 'canvas', 'sha256', 'hash');
    expect(getCaptureBaselineField(baseline, 'canvas', 'fingerprint')).toBe('1:000000');
    expect(getCaptureBaselineField(baseline, 'canvas', 'sha256')).toBe('hash');
  });

  it('overwrites an existing field in place', () => {
    const baseline = createCaptureBaseline();
    setCaptureBaselineField(baseline, 'canvas', 'fingerprint', '1:000000');
    setCaptureBaselineField(baseline, 'canvas', 'fingerprint', '1:ffffff');
    expect(getCaptureBaselineField(baseline, 'canvas', 'fingerprint')).toBe('1:ffffff');
  });
});
