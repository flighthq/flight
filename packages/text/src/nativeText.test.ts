import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRevision, getNodeLocalContentRevision, getNodeLocalTransformRevision } from '@flighthq/node';
import type { NativeText, NativeTextRuntime, Node, PartialNode } from '@flighthq/types';
import { NativeTextKind } from '@flighthq/types';

import {
  computeNativeTextLocalBoundsRectangle,
  createNativeText,
  createNativeTextData,
  createNativeTextRuntime,
  getNativeTextMeasuredHeight,
  getNativeTextMeasuredWidth,
  getNativeTextRuntime,
  getNativeTextString,
  getNativeTextStyle,
  invalidateNativeText,
  patchNativeTextStyle,
  setNativeTextAutoSize,
  setNativeTextHeight,
  setNativeTextString,
  setNativeTextStyle,
  setNativeTextWidth,
} from './nativeText';

describe('computeNativeTextLocalBoundsRectangle', () => {
  it('sets out dimensions from data width and height when autoSize is none', () => {
    const native = createNativeText({ data: { width: 200, height: 50 } });
    const out = createRectangle();
    computeNativeTextLocalBoundsRectangle(out, native as unknown as Node);
    expect(out.x).toBe(0);
    expect(out.width).toBe(200);
    expect(out.height).toBe(50);
  });

  it('falls back to the fixed box under autoSize until the element has been measured', () => {
    const native = createNativeText({ data: { autoSize: 'left', width: 200, height: 50 } });
    const out = createRectangle();
    computeNativeTextLocalBoundsRectangle(out, native as unknown as Node);
    expect(out.width).toBe(200);
    expect(out.height).toBe(50);
  });

  it('uses the measured size the platform renderer wrote back under autoSize', () => {
    const native = createNativeText({ data: { autoSize: 'left', width: 200, height: 50 } });
    const runtime = getNativeTextRuntime(native) as NativeTextRuntime;
    runtime.measuredWidth = 80;
    runtime.measuredHeight = 24;
    const out = createRectangle();
    computeNativeTextLocalBoundsRectangle(out, native as unknown as Node);
    expect(out.width).toBe(80);
    expect(out.height).toBe(24);
  });
});

describe('createNativeText', () => {
  let native: NativeText;

  beforeEach(() => {
    native = createNativeText();
  });

  it('initializes default values', () => {
    expect(native.data.text).toBe('');
    expect(native.data.autoSize).toBe('none');
    expect(native.data.width).toBe(100);
    expect(native.data.height).toBe(100);
    expect(native.data.style).not.toBeNull();
    expect(native.kind).toStrictEqual(NativeTextKind);
  });

  it('allows pre-defined values', () => {
    const base: PartialNode<NativeText> = {
      data: {
        autoSize: 'left',
        text: 'foo',
        width: 300,
        height: 40,
      },
    };
    const obj = createNativeText(base);
    expect(obj.data.autoSize).toStrictEqual(base.data!.autoSize);
    expect(obj.data.text).toStrictEqual(base.data!.text);
    expect(obj.data.width).toBe(300);
    expect(obj.data.height).toBe(40);
  });
});

describe('createNativeTextData', () => {
  it('returns default values', () => {
    const data = createNativeTextData();
    expect(data.autoSize).toBe('none');
    expect(data.height).toBe(100);
    expect(data.text).toBe('');
    expect(data.style).not.toBeNull();
    expect(data.width).toBe(100);
  });

  it('allows pre-defined values', () => {
    const data = createNativeTextData({ autoSize: 'left', text: 'hello', width: 250, height: 30 });
    expect(data.autoSize).toBe('left');
    expect(data.text).toBe('hello');
    expect(data.width).toBe(250);
    expect(data.height).toBe(30);
  });
});

describe('createNativeTextRuntime', () => {
  it('returns a non-null runtime with empty platform slots', () => {
    const runtime = createNativeTextRuntime();
    expect(runtime).not.toBeNull();
    expect(runtime.element).toBeNull();
    expect(runtime.measuredWidth).toBe(0);
    expect(runtime.measuredHeight).toBe(0);
  });

  it('uses computeNativeTextLocalBoundsRectangle', () => {
    const runtime = createNativeTextRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeNativeTextLocalBoundsRectangle);
  });
});

describe('getNativeTextMeasuredHeight', () => {
  it('returns 0 before the platform renderer writes a measurement', () => {
    const native = createNativeText();
    expect(getNativeTextMeasuredHeight(native)).toBe(0);
  });

  it('returns the value the renderer wrote back', () => {
    const native = createNativeText();
    (getNativeTextRuntime(native) as NativeTextRuntime).measuredHeight = 24;
    expect(getNativeTextMeasuredHeight(native)).toBe(24);
  });
});

describe('getNativeTextMeasuredWidth', () => {
  it('returns 0 before the platform renderer writes a measurement', () => {
    const native = createNativeText();
    expect(getNativeTextMeasuredWidth(native)).toBe(0);
  });

  it('returns the value the renderer wrote back', () => {
    const native = createNativeText();
    (getNativeTextRuntime(native) as NativeTextRuntime).measuredWidth = 80;
    expect(getNativeTextMeasuredWidth(native)).toBe(80);
  });
});

describe('getNativeTextRuntime', () => {
  it('returns the runtime for a NativeText', () => {
    const native = createNativeText();
    const runtime = getNativeTextRuntime(native);
    expect(runtime).not.toBeNull();
  });
});

describe('getNativeTextString', () => {
  it('returns the text field', () => {
    const native = createNativeText({ data: { text: 'hello' } });
    expect(getNativeTextString(native)).toBe('hello');
  });
});

describe('getNativeTextStyle', () => {
  it('returns the style field', () => {
    const style = { size: 16, bold: true };
    const native = createNativeText({ data: { style } });
    expect(getNativeTextStyle(native)).toBe(native.data.style);
  });
});

describe('invalidateNativeText', () => {
  it('bumps content and local bounds without touching the transform', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    const bounds = getNodeLocalBoundsRevision(native);
    const transform = getNodeLocalTransformRevision(native);
    invalidateNativeText(native);
    expect(getNodeLocalContentRevision(native)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(native)).toBe(bounds + 1);
    expect(getNodeLocalTransformRevision(native)).toBe(transform);
  });
});

describe('patchNativeTextStyle', () => {
  it('merges the patch into the existing style', () => {
    const native = createNativeText({ data: { style: { size: 14, bold: false } } });
    patchNativeTextStyle(native, { bold: true, color: 0xff0000 });
    expect(native.data.style.size).toBe(14);
    expect(native.data.style.bold).toBe(true);
    expect(native.data.style.color).toBe(0xff0000);
  });

  it('bumps content after patching', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    patchNativeTextStyle(native, { size: 20 });
    expect(getNodeLocalContentRevision(native)).toBe(content + 1);
  });
});

describe('setNativeTextAutoSize', () => {
  it('sets autoSize, bumps content, and invalidates local bounds', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    const bounds = getNodeLocalBoundsRevision(native);
    setNativeTextAutoSize(native, 'left');
    expect(native.data.autoSize).toBe('left');
    expect(getNodeLocalContentRevision(native)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(native)).not.toBe(bounds);
  });

  it('does not bump content when the value is unchanged', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    setNativeTextAutoSize(native, 'none');
    expect(getNodeLocalContentRevision(native)).toBe(content);
  });
});

describe('setNativeTextHeight', () => {
  it('sets height, bumps content, and invalidates local bounds', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    const bounds = getNodeLocalBoundsRevision(native);
    setNativeTextHeight(native, 250);
    expect(native.data.height).toBe(250);
    expect(getNodeLocalContentRevision(native)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(native)).not.toBe(bounds);
  });
});

describe('setNativeTextString', () => {
  it('sets text and bumps content', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    setNativeTextString(native, 'hello');
    expect(native.data.text).toBe('hello');
    expect(getNodeLocalContentRevision(native)).toBe(content + 1);
  });

  it('does not bump content when the value is unchanged', () => {
    const native = createNativeText({ data: { text: 'same' } });
    const content = getNodeLocalContentRevision(native);
    setNativeTextString(native, 'same');
    expect(getNodeLocalContentRevision(native)).toBe(content);
  });
});

describe('setNativeTextStyle', () => {
  it('replaces the style and bumps content', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    const style = { size: 24 };
    setNativeTextStyle(native, style);
    expect(native.data.style).toBe(style);
    expect(getNodeLocalContentRevision(native)).toBe(content + 1);
  });
});

describe('setNativeTextWidth', () => {
  it('sets width, bumps content, and invalidates local bounds', () => {
    const native = createNativeText();
    const content = getNodeLocalContentRevision(native);
    const bounds = getNodeLocalBoundsRevision(native);
    setNativeTextWidth(native, 300);
    expect(native.data.width).toBe(300);
    expect(getNodeLocalContentRevision(native)).toBe(content + 1);
    expect(getNodeLocalBoundsRevision(native)).not.toBe(bounds);
  });
});
