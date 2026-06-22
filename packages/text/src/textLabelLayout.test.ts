import { createTextMetrics, setTextLayoutMeasureProvider } from '@flighthq/text-layout';

import { createRichText, setRichTextString } from './richText';
import { createTextLabel, setTextLabelString } from './textLabel';
import { ensureTextLayout, getTextLayout, getTextLayoutMetrics } from './textLabelLayout';

// A fake fixed-advance measure (7px per char) — exercises the ensure path without a renderer.
const measure = (text: string) => text.length * 7;

afterEach(() => {
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
