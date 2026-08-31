import { createTextMetrics, setTextLayoutMeasureProvider } from '@flighthq/textlayout/contract';

import { createRichText, setRichTextString } from './richText';
import { createTextLabel, setTextLabelString } from './textLabel';
import { ensureTextLayout, getTextLayout, getTextLayoutMetrics, setTextLabelGuard } from './textLabelLayout';

// A fake fixed-advance measure (7px per char) — exercises the ensure path without a renderer.
const measure = (text: string) => text.length * 7;

afterEach(() => {
  setTextLabelGuard(null);
  setTextLayoutMeasureProvider(null);
});

describe('ensureTextLayout', () => {
  it('leaves the layout null when no measure provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    ensureTextLayout(richText);
    expect(getTextLayout(richText)).toBeNull();
  });

  it('computes a layout for a RichText once a provider is registered', () => {
    setTextLayoutMeasureProvider(measure);
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    ensureTextLayout(richText);
    expect(getTextLayout(richText)).not.toBeNull();
  });

  it('computes a layout for a TextLabel via the shared single-run path', () => {
    setTextLayoutMeasureProvider(measure);
    const label = createTextLabel();
    setTextLabelString(label, 'hi');
    ensureTextLayout(label);
    expect(getTextLayout(label)).not.toBeNull();
  });
});

describe('getTextLayout', () => {
  it('ensures the layout and returns it', () => {
    setTextLayoutMeasureProvider(measure);
    const richText = createRichText();
    setRichTextString(richText, 'hi');
    expect(getTextLayout(richText)).not.toBeNull();
  });
});

describe('getTextLayoutMetrics', () => {
  it('measures the content size for a RichText', () => {
    setTextLayoutMeasureProvider(measure);
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    const out = createTextMetrics();
    getTextLayoutMetrics(out, richText);
    expect(out.width).toBeGreaterThan(0);
    expect(out.numLines).toBeGreaterThanOrEqual(1);
  });

  it('measures the content size for a TextLabel', () => {
    setTextLayoutMeasureProvider(measure);
    const label = createTextLabel();
    setTextLabelString(label, 'hello');
    const out = createTextMetrics();
    getTextLayoutMetrics(out, label);
    expect(out.width).toBeGreaterThan(0);
  });

  it('zeroes the metrics when no provider is registered', () => {
    const richText = createRichText();
    setRichTextString(richText, 'hello');
    const out = createTextMetrics();
    out.width = 99;
    getTextLayoutMetrics(out, richText);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
    expect(out.numLines).toBe(0);
  });
});

describe('setTextLabelGuard', () => {
  it('calls the guard when data.text disagrees with the rasterized string', () => {
    setTextLayoutMeasureProvider(measure);
    const label = createTextLabel();
    setTextLabelString(label, 'first');
    ensureTextLayout(label);

    let captured: [string, string] | null = null;
    setTextLabelGuard((live, rasterized) => {
      captured = [live, rasterized];
    });

    label.data.text = 'second';
    ensureTextLayout(label);

    expect(captured).toEqual(['second', 'first']);
  });

  it('does not call the guard when content revision was bumped', () => {
    setTextLayoutMeasureProvider(measure);
    const label = createTextLabel();
    setTextLabelString(label, 'first');
    ensureTextLayout(label);

    let called = false;
    setTextLabelGuard(() => {
      called = true;
    });

    setTextLabelString(label, 'second');
    ensureTextLayout(label);

    expect(called).toBe(false);
  });

  it('accepts null to remove the guard', () => {
    setTextLayoutMeasureProvider(measure);
    const label = createTextLabel();
    setTextLabelString(label, 'first');
    ensureTextLayout(label);

    let called = false;
    setTextLabelGuard(() => {
      called = true;
    });
    setTextLabelGuard(null);

    label.data.text = 'second';
    ensureTextLayout(label);

    expect(called).toBe(false);
  });
});
