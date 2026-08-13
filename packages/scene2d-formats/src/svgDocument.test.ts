import { createRectangle } from '@flighthq/geometry/contract';
import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import { getShapeBounds, getShapeBoundsCommand, unregisterShapeBoundsCommand } from '@flighthq/shape/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Sprite, ImportDiagnostic, Matrix, Node2D, RichText, Shape, TextLabel } from '@flighthq/types/contract';
import {
  SpriteKind,
  DisplayObjectKind,
  ImportDiagnosticSeverity,
  RichTextKind,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/types/contract';

import { createScene2DFromSvgDocument } from './svgDocument';
import { createReadyImageResourceForTest } from './testHelper';

describe('createScene2DFromSvgDocument', () => {
  it('explicitly registers neutral bounds for shapes imported without a renderer', () => {
    unregisterShapeBoundsCommand('drawPath');
    expect(getShapeBoundsCommand('drawPath')).toBeNull();

    const root = createScene2DFromSvgDocument('<svg><rect x="3" width="10" height="10"/></svg>');
    const shape = getNodeChildAt(root, 0) as Shape;
    const bounds = createRectangle();

    expect(getShapeBounds(bounds, shape, 'fill')).toBe(true);
    expect(bounds).toMatchObject({ height: 10, width: 10, x: 3, y: 0 });
  });

  // ★ THE BOUNDING BOX THESE UNITS ARE DEFINED AGAINST EXCLUDES STROKE-WIDTH. Asserted as an AGREEMENT
  // between two routes to the same box, because that is the form the defect took: the node's own bounds
  // include the stroke (correct for culling and hit-testing), so a shape clipped through a parent <g> got a
  // 14-wide box while the same shape clipped directly got 10. Two answers for one element, and no assertion
  // anywhere compared them.
  //
  // A single-route test would pass against either convention as long as it was applied consistently, which
  // is exactly what was NOT true here. Pinning the number as well, so the pair cannot agree on the wrong one.
  it('measures the objectBoundingBox without stroke, identically through a shape and through its group', () => {
    const clip = `<defs><clipPath id="c" clipPathUnits="objectBoundingBox"><rect width="0.5" height="1"/></clipPath></defs>`;
    const stroked = `<rect x="0" y="0" width="10" height="10" fill="#f00" stroke="#00f" stroke-width="4"`;
    const clipWidth = (body: string): number | undefined => {
      const root = createScene2DFromSvgDocument(`<svg>${clip}${body}</svg>`);
      return (getNodeChildAt(root, 0) as Node2D | null)?.clip?.rect.width;
    };

    // Half of a 10-wide geometry box. The inked extent is 14 wide, which would give 7.
    expect(clipWidth(`${stroked} clip-path="url(#c)"/>`)).toBeCloseTo(5, 4);
    expect(clipWidth(`<g clip-path="url(#c)">${stroked}/></g>`)).toBeCloseTo(5, 4);
  });

  // ★ THE GRADIENT BOX IS PLACED BY ITS ORIGIN, NOT ITS CENTRE. `createGradientTransformMatrix` ends with
  // `tx + width / 2` — it centres the box itself — so a caller that passes the midpoint gets the offset
  // applied twice and every gradient slides by half its own extent. That shipped: a 320-wide rect at x=60
  // ramped from 220 instead of 60, measured on canvas, webgl and webgpu alike.
  //
  // Asserted on the recorded matrix rather than on pixels, so it fails in this package rather than in a
  // render baseline three layers away. The numbers are derived from the format, not read off the output:
  // an objectBoundingBox ramp x1=0→x2=1 over a rect at x=60 width=320 must span 60→380, so the box is 320
  // wide and its CENTRE — which is what the matrix carries after the helper's own offset — is 220.
  // A gradientTransform is authored text, so `scale(0)` is a plain thing to write. Validated where the
  // file's value enters rather than at the renderer: `inverseMatrix` answers a singular matrix with a
  // defined-but-wrong result rather than NaN, so an unvalidated one paints wrong pixels silently.
  it('drops a singular gradientTransform and names the gradient, rather than carrying it to the renderer', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromSvgDocument(
      `<svg>
        <defs><linearGradient id="collapsed" gradientTransform="scale(0)" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#collapsed)"/>
      </svg>`,
      diagnostics,
    );
    const matches = diagnostics.filter((d) => d.kind === 'svg.gradient-transform-singular');
    expect(matches).toHaveLength(1);
    expect(matches[0].severity).toBe('Recover');
    expect(matches[0].detail).toMatchObject({ gradient: 'collapsed' });
  });

  it('keeps an invertible gradientTransform and reports nothing', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromSvgDocument(
      `<svg>
        <defs><linearGradient id="fine" gradientTransform="scale(2)" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>
        <rect x="0" y="0" width="100" height="100" fill="url(#fine)"/>
      </svg>`,
      diagnostics,
    );
    expect(diagnostics.filter((d) => d.kind === 'svg.gradient-transform-singular')).toHaveLength(0);
  });

  it('places a linear gradient box by its origin, spanning the shape rather than starting at its middle', () => {
    const root = createScene2DFromSvgDocument(
      `<svg>
        <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>
        <rect x="60" y="0" width="320" height="200" fill="url(#g)"/>
      </svg>`,
    );

    const shape = getNodeChildAt(root, 0) as Shape;
    const commands = shape.data.commands;
    const matrix = commands[commands.indexOf('beginGradientFill') + 6] as Matrix;

    expect(matrix.a * 1638.4).toBeCloseTo(320, 4);
    expect(matrix.tx).toBeCloseTo(220, 4);
  });

  // objectBoundingBox units on geometry with no width or height mean the effect is IGNORED — the same rule
  // the clip path already follows, defined once for every consumer of these units. So a zero-area shape
  // paints no gradient and says NOTHING: this is correct rendering of a correct file, not a failure.
  //
  // The second assertion is the one worth having. "Ignored" and "unresolved" both end with no gradient
  // painted, and the natural implementation — dropping the resolved gradient — routes conformant input into
  // `svg.unresolved-fill-gradient`, a Drop that blames the file for something the format prescribes. That is
  // the mistake this test exists to catch, and it caught it while this was being written.
  it('ignores an objectBoundingBox gradient on a zero-area shape without calling it unresolved', () => {
    const gradient = `<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>`;
    const diagnostics: ImportDiagnostic[] = [];

    createScene2DFromSvgDocument(`<svg>${gradient}<rect width="0" height="10" fill="url(#g)"/></svg>`, diagnostics);

    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual([]);
  });

  // A clean parse is two claims: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // here checks the first. This checks the second — the one that catches an importer that produced a
  // plausible-looking tree while telling nobody it could not read part of the input.
  //
  // Skip is excluded rather than the list asserted empty: SVG is a large format and a well-formed document
  // may use an element this importer does not model, which is correct behaviour on correct input. What must
  // not appear is anything of higher severity.
  it('raises no data-integrity diagnostic for a well-formed document', () => {
    const diagnostics: ImportDiagnostic[] = [];

    createScene2DFromSvgDocument(
      `
        <svg>
          <rect x="1" y="2" width="30" height="40" fill="#ff0000" />
          <g transform="translate(5,6)">
            <circle cx="10" cy="10" r="4" fill="#00ff00" />
          </g>
        </svg>
      `,
      diagnostics,
    );

    const integrity = diagnostics.filter((diagnostic) => diagnostic.severity !== ImportDiagnosticSeverity.Skip);
    expect(
      integrity.map((diagnostic) => diagnostic.kind),
      `a good SVG made the importer complain: ${integrity.map((d) => d.kind).join(', ')}`,
    ).toEqual([]);
  });

  it('applies object-bounding-box clip and mask content units to target geometry', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <clipPath id="half" clipPathUnits="objectBoundingBox">
            <rect width="0.5" height="1"/>
          </clipPath>
          <mask id="quarter" maskContentUnits="objectBoundingBox">
            <rect x="0.25" width="0.5" height="1"/>
          </mask>
        </defs>
        <rect width="200" height="100" clip-path="url(#half)"/>
        <rect width="200" height="100" mask="url(#quarter)"/>
      </svg>
    `);

    const clipped = getNodeChildAt(root, 0)!;
    expect(clipped.clip?.rect).toMatchObject({ height: 100, width: 100, x: 0, y: 0 });
    const masked = getNodeChildAt(root, 1)!;
    expect(masked.clip?.rect).toMatchObject({ height: 100, width: 100, x: 50, y: 0 });
  });

  it('applies object-bounding-box clips in image-local geometry', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const image = createReadyImageResourceForTest(20, 10);
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <clipPath id="half" clipPathUnits="objectBoundingBox">
              <rect width="0.5" height="1"/>
            </clipPath>
            <symbol id="panel" viewBox="0 0 20 10" preserveAspectRatio="none">
              <rect width="20" height="10"/>
            </symbol>
          </defs>
          <image href="asset.png" width="200" height="100" clip-path="url(#half)"/>
          <g clip-path="url(#half)"><rect width="200" height="100"/></g>
          <use href="#panel" width="200" height="100" clip-path="url(#half)"/>
          <text font-size="10" clip-path="url(#half)">Unmeasured</text>
        </svg>
      `,
      diagnostics,
      { resolveImageResource: () => image },
    );

    const bitmap = getNodeChildAt(root, 0) as Sprite;
    expect(bitmap.clip?.rect).toMatchObject({ height: 10, width: 10, x: 0, y: 0 });
    expect(bitmap.scaleX * (bitmap.clip?.rect.width ?? 0)).toBe(100);
    expect(bitmap.scaleY * (bitmap.clip?.rect.height ?? 0)).toBe(100);
    expect(getNodeChildAt(root, 1)?.clip?.rect).toMatchObject({ height: 100, width: 100, x: 0, y: 0 });
    expect(getNodeChildAt(root, 2)?.clip?.rect).toMatchObject({ height: 100, width: 100, x: 0, y: 0 });
    expect(getNodeChildAt(root, 3)?.clip).toBeNull();
    // Reported because the bounds are UNMEASURABLE — this importer performs no text layout, so the format
    // defines a box here that we cannot compute. A zero-area target reaches the same code path and is
    // deliberately silent instead, because there the dropped clip is the correct rendering.
    expect(diagnostics).toContainEqual({
      detail: { id: 'half' },
      kind: 'svg.object-bounding-box-clip-unmeasurable-bounds',
      origin: 'applySvgElementClip',
      severity: 'Skip',
    });
  });

  it('applies root presentation to descendants', () => {
    const root = createScene2DFromSvgDocument('<svg fill="red"><rect width="10" height="10"/></svg>');
    const shape = getNodeChildAt(root, 0) as Shape;

    expect(shape.data.commands).toContain(0xff0000);
  });

  it('parses HSL colors and percentage alpha components', () => {
    const root = createScene2DFromSvgDocument(
      '<svg><rect width="10" height="10" fill="hsla(120 100% 25% / 50%)" stroke="rgba(0 0 255 / 25%)"/></svg>',
    );
    const shape = getNodeChildAt(root, 0) as Shape;
    const fill = shape.data.commands.indexOf('beginFill');
    const stroke = shape.data.commands.indexOf('lineStyle');

    expect(shape.data.commands.slice(fill + 2, fill + 4)).toEqual([0x008000, 0.5]);
    expect(shape.data.commands.slice(stroke + 3, stroke + 5)).toEqual([0x0000ff, 0.25]);
  });

  it('resolves currentColor in gradient stops', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <linearGradient id="current" color="#123456">
            <stop offset="0" stop-color="CURRENTCOLOR"/>
            <stop offset="1" color="#abcdef" stop-color="currentColor"/>
          </linearGradient>
        </defs>
        <rect width="10" height="10" fill="url(#current)"/>
      </svg>
    `);
    const shape = getNodeChildAt(root, 0) as Shape;
    const gradient = shape.data.commands.indexOf('beginGradientFill');

    expect(shape.data.commands[gradient + 3]).toEqual([0x123456, 0xabcdef]);
  });

  it('composes image geometry before its SVG transform', () => {
    const image = createReadyImageResourceForTest(20, 10);
    const root = createScene2DFromSvgDocument(
      '<svg><image href="asset.png" x="3" y="4" width="40" height="30" preserveAspectRatio="none" transform="translate(10 20)"/></svg>',
      undefined,
      { resolveImageResource: () => image },
    );

    const bitmap = getNodeChildAt(root, 0) as Sprite;
    expect(bitmap.x).toBe(13);
    expect(bitmap.y).toBe(24);
    expect(bitmap.scaleX).toBe(2);
    expect(bitmap.scaleY).toBe(3);
  });

  it('maps image intrinsic dimensions with default preserveAspectRatio and explicit none', () => {
    const image = createReadyImageResourceForTest(20, 10);
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <image href="asset.png" x="10" y="20" width="100" height="100"/>
          <image href="asset.png" x="10" y="20" width="100" height="100" preserveAspectRatio="none"/>
        </svg>
      `,
      undefined,
      { resolveImageResource: () => image },
    );

    expect(getNodeChildAt(root, 0)).toMatchObject({ scaleX: 5, scaleY: 5, x: 10, y: 45 });
    expect(getNodeChildAt(root, 1)).toMatchObject({ scaleX: 5, scaleY: 10, x: 10, y: 20 });
  });

  it('composes authored geometry before transforms uniformly across element types', () => {
    const image = createReadyImageResourceForTest(10, 10);
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs><g id="mark"><rect width="1" height="1"/></g></defs>
          <rect x="3" width="10" height="10" transform="translate(10 5)"/>
          <image href="asset.png" x="3" width="10" height="10" transform="translate(10 5)"/>
          <use href="#mark" x="3" transform="translate(10 5)"/>
          <text x="3" y="15" font-size="10" transform="translate(10 5)">T</text>
        </svg>
      `,
      undefined,
      { resolveImageResource: () => image },
    );

    const shape = getNodeChildAt(root, 0) as Shape;
    const shapeBounds = createRectangle();
    getShapeBounds(shapeBounds, shape);
    expect(shape.x + shapeBounds.x).toBe(13);
    expect((getNodeChildAt(root, 1) as Sprite).x).toBe(13);
    expect(getNodeChildAt(root, 2)?.x).toBe(13);
    expect((getNodeChildAt(root, 3) as TextLabel).x).toBe(13);
  });

  it('composes use placement before its SVG transform', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs><g id="mark"><rect width="1" height="1"/></g></defs>
        <use href="#mark" x="7" y="9" transform="scale(2)"/>
      </svg>
    `);

    const use = getNodeChildAt(root, 0)!;
    expect(use.x).toBe(14);
    expect(use.y).toBe(18);
    expect(use.scaleX).toBe(2);
    expect(use.scaleY).toBe(2);
  });

  it('diagnoses applied filters and nested animation at their use sites', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromSvgDocument(
      `
        <svg>
          <defs><filter id="blur"/></defs>
          <rect width="10" height="10" filter="url(#blur)">
            <animate attributeName="x" from="0" to="10"/>
          </rect>
        </svg>
      `,
      diagnostics,
    );

    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual([
      'svg.unsupported-filter',
      'svg.unsupported-animate',
    ]);
  });

  it('inherits fill-rule through groups', () => {
    const root = createScene2DFromSvgDocument(`
      <svg><g fill-rule="evenodd"><path d="M0 0 L10 0 L10 10 Z"/></g></svg>
    `);
    const group = getNodeChildAt(root, 0)!;
    const shape = getNodeChildAt(group, 0) as Shape;
    const drawPathIndex = shape.data.commands.indexOf('drawPath');

    expect(shape.data.commands[drawPathIndex + 4]).toBe('evenOdd');
  });

  it('honors clip-rule winding and diagnoses mixed clip child winding', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <clipPath id="hole" clip-rule="evenodd">
              <g><path d="M0 0 H20 V20 H0 Z M5 5 H15 V15 H5 Z"/></g>
            </clipPath>
            <clipPath id="mixed">
              <rect width="10" height="10" clip-rule="evenodd"/>
              <circle cx="5" cy="5" r="2" clip-rule="nonzero"/>
            </clipPath>
            <clipPath id="fillOnly" fill-rule="evenodd">
              <path d="M0 0 H20 V20 H0 Z M5 5 H15 V15 H5 Z"/>
            </clipPath>
          </defs>
          <rect width="20" height="20" clip-path="url(#hole)"/>
          <rect width="20" height="20" clip-path="url(#mixed)"/>
          <rect width="20" height="20" clip-path="url(#fillOnly)"/>
        </svg>
      `,
      diagnostics,
    );

    expect(getNodeChildAt(root, 0)?.clip?.winding).toBe('evenOdd');
    expect(getNodeChildAt(root, 2)?.clip?.winding).toBe('nonZero');
    expect(diagnostics).toContainEqual({
      detail: { id: 'mixed' },
      kind: 'svg.mixed-clip-rule',
      origin: 'createSvgClipRegion',
      severity: 'Recover',
    });
  });

  it('instantiates use geometry inside clip paths with placement and transforms', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <path id="clipShape" d="M0 0 H10 V10 H0 Z"/>
          <clipPath id="used"><use href="#clipShape" x="5" transform="scale(2)"/></clipPath>
        </defs>
        <rect width="40" height="40" clip-path="url(#used)"/>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 20, width: 20, x: 10, y: 0 });
  });

  it('honors display suppression and descendant visibility overrides in clip geometry', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <clipPath id="visibleOnly">
            <rect x="0" width="10" height="10" display="none"/>
            <rect x="10" width="10" height="10"/>
          </clipPath>
          <clipPath id="visibilityOverride">
            <g visibility="hidden">
              <rect x="0" width="10" height="10"/>
              <rect x="20" width="10" height="10" visibility="visible"/>
            </g>
          </clipPath>
        </defs>
        <rect width="40" height="40" clip-path="url(#visibleOnly)"/>
        <rect width="40" height="40" clip-path="url(#visibilityOverride)"/>
      </svg>
    `);

    expect(getNodeChildAt(root, 0)?.clip?.rect).toMatchObject({ height: 10, width: 10, x: 10, y: 0 });
    expect(getNodeChildAt(root, 1)?.clip?.rect).toMatchObject({ height: 10, width: 10, x: 20, y: 0 });
  });

  it('lets author CSS outrank presentation attributes by specificity and source order', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <style>
          rect { fill: red }
          .accent { fill: green }
          .accent { fill: orange }
        </style>
        <rect class="accent" fill="blue" width="10" height="10"/>
      </svg>
    `);
    const shape = getNodeChildAt(root, 0) as Shape;

    expect(shape.data.commands).toContain(0xffa500);
    expect(shape.data.commands).not.toContain(0x0000ff);
  });

  it('preserves mixed text and tspan source order', () => {
    const root = createScene2DFromSvgDocument('<svg><text font-size="12">A<tspan fill="red">B</tspan>C</text></svg>');
    const text = getNodeChildAt(root, 0) as RichText;

    expect(text.data.text).toBe('ABC');
    expect(text.data.textFormatRanges).toHaveLength(1);
    expect(text.data.textFormatRanges[0]).toMatchObject({ end: 2, start: 1 });
    expect(text.data.textFormatRanges[0].format.color).toBe(0xff0000ff);
  });

  it('preserves meaningful collapsed whitespace across mixed text runs', () => {
    const root = createScene2DFromSvgDocument(
      '<svg><text font-size="12">Hello <tspan fill="red">world</tspan>!</text></svg>',
    );
    const text = getNodeChildAt(root, 0) as RichText;

    expect(text.data.text).toBe('Hello world!');
    expect(text.data.textFormatRanges[0]).toMatchObject({ end: 11, start: 6 });
  });

  it('returns an empty tree and a structured diagnostic for non-SVG input', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument('<html/>', diagnostics);

    expect(root.kind).toBe(DisplayObjectKind);
    expect(getNodeChildCount(root)).toBe(0);
    expect(diagnostics).toEqual([
      {
        detail: undefined,
        kind: 'svg.invalid-document',
        origin: 'createScene2DFromSvgDocument',
        severity: 'Reject',
      },
    ]);
  });

  it('imports grouped geometry with inherited CSS presentation and transforms', () => {
    const root = createScene2DFromSvgDocument(`
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
    const root = createScene2DFromSvgDocument(
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
      origin: 'applySvgElementClip',
      severity: 'Recover',
    });
  });

  it('imports every common SVG geometry element and skips live-document features loudly', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
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
    // `image-resolver-unwired`, not `unresolved-image`: this document wires no resolveImageResource hook
    // at all, which is an unwired host integration rather than a fault in the file. The split exists so a
    // caller stops reading "your file lost data" when they simply have not wired the seam.
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual([
      'svg.image-resolver-unwired',
      'svg.unsupported-foreignObject',
    ]);
  });

  it('resolves image resources through an explicit no-I/O seam', () => {
    const image = createReadyImageResourceForTest(20, 10);
    const root = createScene2DFromSvgDocument(
      '<svg><image id="photo" href="asset.png" x="3" y="4" width="40" height="30" preserveAspectRatio="none"/></svg>',
      undefined,
      { resolveImageResource: (href) => (href === 'asset.png' ? image : null) },
    );

    const bitmap = getNodeChildAt(root, 0) as Sprite;
    expect(bitmap.kind).toBe(SpriteKind);
    expect(bitmap.name).toBe('photo');
    expect(bitmap.data.texture === null ? null : getTextureSource(bitmap.data.texture)).toBe(image);
    expect(bitmap.x).toBe(3);
    expect(bitmap.y).toBe(4);
    expect(bitmap.scaleX).toBe(2);
    expect(bitmap.scaleY).toBe(3);
  });

  it('retains tspan style runs and diagnoses positional flattening', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const root = createScene2DFromSvgDocument(
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
    expect(text.data.text).toBe('Red Blue');
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

  it('composes text placement and baseline before its SVG transform', () => {
    const root = createScene2DFromSvgDocument(
      '<svg><text x="3" y="20" font-size="10" transform="translate(10 5)">Hello</text></svg>',
    );
    const text = getNodeChildAt(root, 0) as TextLabel;

    expect(text.x).toBe(13);
    expect(text.y).toBe(15);
  });

  it('honors preserveAspectRatio and forward gradient inheritance', () => {
    const root = createScene2DFromSvgDocument(`
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

    const stretched = createScene2DFromSvgDocument(
      '<svg width="200" height="100" viewBox="0 0 50 50" preserveAspectRatio="none"/>',
    );
    expect(stretched.scaleX).toBe(4);
    expect(stretched.scaleY).toBe(2);
    expect(stretched.x).toBe(0);
  });

  it('uses symbol viewBox semantics and the use viewport size', () => {
    const root = createScene2DFromSvgDocument(`
      <svg>
        <defs>
          <symbol id="icon" viewBox="0 0 10 10" preserveAspectRatio="none">
            <rect width="10" height="10"/>
          </symbol>
        </defs>
        <use href="#icon" width="20" height="30"/>
      </svg>
    `);

    const use = getNodeChildAt(root, 0)!;
    const symbol = getNodeChildAt(use, 0)!;
    expect(symbol.scaleX).toBe(2);
    expect(symbol.scaleY).toBe(3);
  });

  it('reports unsupported animation inside an instantiated symbol', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DFromSvgDocument(
      `
        <svg>
          <defs>
            <symbol id="animated">
              <rect width="10" height="10">
                <animate attributeName="x" from="0" to="10"/>
              </rect>
            </symbol>
          </defs>
          <use href="#animated"/>
        </svg>
      `,
      diagnostics,
    );

    expect(diagnostics).toContainEqual({
      detail: { element: 'animate' },
      kind: 'svg.unsupported-animate',
      // Reported by the sweep for elements a symbol instantiation never visited, not by the node
      // builder — which is the distinction the origin field exists to carry.
      origin: 'reportRemainingUnsupportedSvgElements',
      severity: 'Skip',
    });
  });
});
