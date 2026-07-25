import { createImageResource } from '@flighthq/image';
import { getNodeChildAt, getNodeChildCount } from '@flighthq/node';
import type { Bitmap, ImportDiagnostic, RichText, Shape, TextLabel } from '@flighthq/types';
import { BitmapKind, DisplayObjectKind, RichTextKind, ShapeKind, TextLabelKind } from '@flighthq/types';

import { createDisplayObjectFromSvgDocument } from './svgDocument';

describe('createDisplayObjectFromSvgDocument', () => {
  it('returns an empty tree and a structured diagnostic for non-SVG input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createDisplayObjectFromSvgDocument('<html/>', diagnostics);

    expect(root.kind).toBe(DisplayObjectKind);
    expect(getNodeChildCount(root)).toBe(0);
    expect(diagnostics).toEqual([
      {
        detail: undefined,
        kind: 'svg.invalid-document',
        origin: 'createDisplayObjectFromSvgDocument',
        severity: 'Reject',
      },
    ]);
  });

  it('imports grouped geometry with inherited CSS presentation and transforms', () => {
    const root = createDisplayObjectFromSvgDocument(`
      <svg id="art" width="200" height="100" viewBox="0 0 100 50">
        <style>.accent { fill: #123456; stroke: rgb(255, 0, 0); stroke-width: 3 }</style>
        <g id="layer" opacity="0.5" transform="translate(4 5)">
          <path id="mark" class="accent" d="M0 0 L20 0 L20 10 Z"/>
        </g>
      </svg>
    `);

    expect(root.name).toBe('art');
    expect(root.scaleX).toBe(2);
    expect(root.scaleY).toBe(2);
    const group = getNodeChildAt(root, 0)!;
    expect(group.name).toBe('layer');
    expect(group.alpha).toBe(0.5);
    expect(group.x).toBe(4);
    expect(group.y).toBe(5);
    const shape = getNodeChildAt(group, 0) as Shape;
    expect(shape.kind).toBe(ShapeKind);
    expect(shape.name).toBe('mark');
    expect(shape.data.commands).toContain('beginFill');
    expect(shape.data.commands).toContain('lineStyle');
    expect(shape.data.commands).toContain('drawPath');
    expect(shape.data.commands).toContain(0x123456);
    expect(shape.data.commands).toContain(0xff0000);
  });

  it('imports gradients, use references, text, clips, and mask degradation', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createDisplayObjectFromSvgDocument(
      `
        <svg>
          <defs>
            <linearGradient id="paint" x1="0" y1="0" x2="80" y2="0">
              <stop offset="0%" stop-color="#ff0000"/>
              <stop offset="100%" style="stop-color:#0000ff;stop-opacity:.5"/>
            </linearGradient>
            <clipPath id="crop"><circle cx="10" cy="10" r="8"/></clipPath>
            <mask id="matte"><rect x="0" y="0" width="20" height="20"/></mask>
            <symbol id="badge"><rect width="10" height="6" fill="url(#paint)"/></symbol>
          </defs>
          <use id="first" href="#badge" x="7" y="9" clip-path="url(#crop)"/>
          <text id="caption" x="12" y="30" font-family="Inter" font-size="14" fill="#336699">Hello</text>
          <rect id="masked" width="20" height="20" mask="url(#matte)"/>
        </svg>
      `,
      diagnostics,
    );

    const use = getNodeChildAt(root, 0)!;
    expect(use.name).toBe('first');
    expect(use.x).toBe(7);
    expect(use.y).toBe(9);
    expect(use.clip?.contours).not.toBeNull();
    const symbol = getNodeChildAt(use, 0)!;
    const gradientShape = getNodeChildAt(symbol, 0) as Shape;
    const gradientCommandIndex = gradientShape.data.commands.indexOf('beginGradientFill');
    expect(gradientCommandIndex).toBeGreaterThanOrEqual(0);
    expect(gradientShape.data.commands[gradientCommandIndex + 3]).toEqual([0xff0000, 0x0000ff]);

    const text = getNodeChildAt(root, 1) as TextLabel;
    expect(text.kind).toBe(TextLabelKind);
    expect(text.name).toBe('caption');
    expect(text.data.text).toBe('Hello');
    expect(text.data.textFormat.font).toBe('Inter');
    expect(text.data.textFormat.size).toBe(14);
    expect(text.x).toBe(12);
    expect(text.y).toBe(16);

    const masked = getNodeChildAt(root, 2)!;
    expect(masked.clip).not.toBeNull();
    expect(diagnostics).toContainEqual({
      detail: { id: 'matte' },
      kind: 'svg.mask-as-hard-clip',
      origin: 'applySvgElementAppearance',
      severity: 'Recover',
    });
  });

  it('imports every common SVG geometry element and skips live-document features loudly', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createDisplayObjectFromSvgDocument(
      `
        <svg>
          <rect x="1" y="2" width="3" height="4" rx="1"/>
          <circle cx="5" cy="6" r="2"/>
          <ellipse cx="8" cy="9" rx="3" ry="2"/>
          <line x1="0" y1="0" x2="4" y2="5" stroke="black"/>
          <polyline points="0,0 1,2 3,4" fill="none" stroke="blue"/>
          <polygon points="0,0 5,0 2,4"/>
          <image href="photo.png"/>
          <foreignObject><div/></foreignObject>
        </svg>
      `,
      diagnostics,
    );

    expect(getNodeChildCount(root)).toBe(6);
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual([
      'svg.unresolved-image',
      'svg.unsupported-foreignObject',
    ]);
  });

  it('resolves image resources through an explicit no-I/O seam', () => {
    const image = createImageResource();
    image.width = 20;
    image.height = 10;
    const root = createDisplayObjectFromSvgDocument(
      '<svg><image id="photo" href="asset.png" x="3" y="4" width="40" height="30"/></svg>',
      undefined,
      { resolveImageResource: (href) => (href === 'asset.png' ? image : null) },
    );

    const bitmap = getNodeChildAt(root, 0) as Bitmap;
    expect(bitmap.kind).toBe(BitmapKind);
    expect(bitmap.name).toBe('photo');
    expect(bitmap.data.image).toBe(image);
    expect(bitmap.x).toBe(3);
    expect(bitmap.y).toBe(4);
    expect(bitmap.scaleX).toBe(2);
    expect(bitmap.scaleY).toBe(3);
  });

  it('retains tspan style runs and diagnoses positional flattening', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createDisplayObjectFromSvgDocument(
      `
        <svg>
          <text id="mixed" font-family="Inter" font-size="12">
            <tspan x="4" y="20" fill="#ff0000">Red</tspan>
            <tspan x="30" y="20" fill="#0000ff" font-weight="bold">Blue</tspan>
          </text>
        </svg>
      `,
      diagnostics,
    );

    const text = getNodeChildAt(root, 0) as RichText;
    expect(text.kind).toBe(RichTextKind);
    expect(text.data.text).toBe('RedBlue');
    expect(text.data.textFormatRanges).toHaveLength(2);
    expect(text.data.textFormatRanges[0].format.color).toBe(0xff0000ff);
    expect(text.data.textFormatRanges[1].format.color).toBe(0x0000ffff);
    expect(text.data.textFormatRanges[1].format.bold).toBe(true);
    expect(text.x).toBe(4);
    expect(text.y).toBe(8);
    expect(diagnostics).toContainEqual({
      detail: { count: 2 },
      kind: 'svg.tspan-position-flattened',
      origin: 'createSvgTextNode',
      severity: 'Recover',
    });
  });

  it('honors preserveAspectRatio and forward gradient inheritance', () => {
    const root = createDisplayObjectFromSvgDocument(`
      <svg width="200" height="100" viewBox="0 0 50 50">
        <defs>
          <linearGradient id="derived" href="#base" x2="100%"/>
          <linearGradient id="base">
            <stop offset="0" stop-color="red"/>
            <stop offset="1" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect width="50" height="50" fill="url(#derived)"/>
      </svg>
    `);

    expect(root.scaleX).toBe(2);
    expect(root.scaleY).toBe(2);
    expect(root.x).toBe(50);
    const shape = getNodeChildAt(root, 0) as Shape;
    const gradientCommandIndex = shape.data.commands.indexOf('beginGradientFill');
    expect(shape.data.commands[gradientCommandIndex + 3]).toEqual([0xff0000, 0x0000ff]);

    const stretched = createDisplayObjectFromSvgDocument(
      '<svg width="200" height="100" viewBox="0 0 50 50" preserveAspectRatio="none"/>',
    );
    expect(stretched.scaleX).toBe(4);
    expect(stretched.scaleY).toBe(2);
    expect(stretched.x).toBe(0);
  });
});
