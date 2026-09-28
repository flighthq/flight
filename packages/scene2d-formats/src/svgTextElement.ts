import { packColor } from '@flighthq/color/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createRichText, createTextLabel } from '@flighthq/text/contract';
import { createTextFormatRange } from '@flighthq/textlayout/contract';
import type {
  Node2D,
  SvgElementContext,
  SvgImportContext,
  SvgStyle,
  TextFormat,
  TextFormatRange,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { applySvgElementClip } from './svgClip.ts';
import { resolveSvgColor } from './svgColor.ts';
import { applySvgElementAppearance } from './svgDocument.ts';
import { resolveSvgStyle } from './svgStyle.ts';
import { svgAttribute, svgFirstNumber, svgLocalName } from './svgXml.ts';

/**
 * The `<text>` element and its `<tspan>` runs.
 *
 * ★ ONE LABEL OR A RICH TEXT, DECIDED BY WHETHER THE RUNS AGREE. A `<text>` whose spans share one style becomes a
 * TextLabel; spans that differ become a RichText with a format range each, because that is the only Flight node that
 * carries more than one format. Both are unmeasurable without a shaper, which is why the bounds module declines a
 * subtree containing either.
 *
 * Per-span `x`/`y` positioning is NOT carried: SVG lets every glyph be placed individually and Flight lays a run out
 * once, so a document that positions spans is reported rather than laid out wrongly.
 */
interface SvgTextRun {
  opacity: number;
  style: Readonly<SvgStyle>;
  text: string;
}

export function svgTextElementHandler(context: SvgElementContext): Node2D | null {
  return createSvgTextNode(context.element, context.parentStyle, context.import);
}

function createSvgTextNode(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: SvgImportContext,
): Node2D {
  const style = resolveSvgStyle(element, parentStyle, context);
  const format = createSvgTextFormat(style);
  const directTspans = element.children.filter((child) => svgLocalName(child.name) === 'tspan');
  const tspans = collectSvgTspanElements(element);
  const runs: SvgTextRun[] = [];
  collectSvgTextRuns(element, style, context, runs);
  const lastRun = runs[runs.length - 1];
  if (lastRun !== undefined) lastRun.text = lastRun.text.trimEnd();
  const text = runs.map((run) => run.text).join('');
  const ranges: TextFormatRange[] = [];
  let offset = 0;
  for (const run of runs) {
    const end = offset + run.text.length;
    if (run.style !== style) {
      ranges.push(createTextFormatRange(createSvgTextFormat(run.style, run.opacity), offset, end));
    }
    offset = end;
  }
  const firstTspan = directTspans[0];
  const xElement = svgAttribute(element, 'x') === null && firstTspan !== undefined ? firstTspan : element;
  const yElement = svgAttribute(element, 'y') === null && firstTspan !== undefined ? firstTspan : element;
  const x =
    svgFirstNumber(svgAttribute(xElement, 'x'), 0) +
    svgFirstNumber(svgAttribute(element, 'dx'), 0) +
    (xElement === element ? 0 : svgFirstNumber(svgAttribute(xElement, 'dx'), 0));
  const y =
    svgFirstNumber(svgAttribute(yElement, 'y'), 0) +
    svgFirstNumber(svgAttribute(element, 'dy'), 0) +
    (yElement === element ? 0 : svgFirstNumber(svgAttribute(yElement, 'dy'), 0)) -
    style.fontSize;
  const common = {
    alpha: style.opacity,
    name: svgAttribute(element, 'id'),
    visible: style.display !== 'none' && style.visibility === 'visible',
  };
  const label =
    ranges.length === 0
      ? createTextLabel({
          ...common,
          data: { autoSize: 'left', height: style.fontSize * 1.25, text, textFormat: format, width: 10000 },
        })
      : createRichText({
          ...common,
          data: {
            autoSize: 'left',
            defaultTextFormat: format,
            height: style.fontSize * 1.25,
            text,
            textFormat: format,
            textFormatRanges: ranges,
            width: 10000,
          },
        });
  if (hasFlattenedSvgTextPosition(tspans, firstTspan)) {
    reportImportDiagnostic(
      context.diagnostics,
      ImportDiagnosticSeverity.Recover,
      'svg.tspan-position-flattened',
      'createSvgTextNode',
      { count: tspans.length },
    );
  }
  applySvgElementAppearance(label, element, parentStyle, context, createMatrix(1, 0, 0, 1, x, y));
  applySvgElementClip(label, element, context, null);
  return label;
}

function createSvgTextFormat(style: Readonly<SvgStyle>, opacity = 1): TextFormat {
  const color = resolveSvgColor(style.fill, style.color) ?? { alpha: 0, rgb: 0 };
  return {
    align: style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left',
    bold: style.fontWeight === 'bold' || Number(style.fontWeight) >= 600,
    color: packColor(
      ((color.rgb >>> 16) & 0xff) / 255,
      ((color.rgb >>> 8) & 0xff) / 255,
      (color.rgb & 0xff) / 255,
      color.alpha * style.fillOpacity * opacity,
    ),
    font: style.fontFamily.replace(/^['"]|['"]$/g, ''),
    italic: style.fontStyle === 'italic' || style.fontStyle === 'oblique',
    size: style.fontSize,
  };
}

function collectSvgTextRuns(
  element: Readonly<XmlElement>,
  style: Readonly<SvgStyle>,
  context: Readonly<SvgImportContext>,
  out: SvgTextRun[],
  opacity = 1,
): void {
  if (style.display === 'none') return;
  for (const content of element.content) {
    if (typeof content === 'string') {
      if (style.visibility === 'visible') appendSvgTextRun(out, style, content, opacity);
      continue;
    }
    if (svgLocalName(content.name) !== 'tspan') continue;
    const childStyle = resolveSvgStyle(content, style, context);
    collectSvgTextRuns(content, childStyle, context, out, opacity * childStyle.opacity);
  }
}

function collectSvgTspanElements(element: Readonly<XmlElement>): XmlElement[] {
  const out: XmlElement[] = [];
  for (const child of element.children) {
    if (svgLocalName(child.name) === 'tspan') out.push(child);
    out.push(...collectSvgTspanElements(child));
  }
  return out;
}

function appendSvgTextRun(out: SvgTextRun[], style: Readonly<SvgStyle>, source: string, opacity: number): void {
  let text = source
    .replace(/[\n\r]/g, '')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ');
  if (out.length === 0) text = text.trimStart();
  const previous = out[out.length - 1];
  if (previous?.text.endsWith(' ') === true && text.startsWith(' ')) text = text.slice(1);
  if (text !== '') out.push({ opacity, style, text });
}

function hasFlattenedSvgTextPosition(
  tspans: ReadonlyArray<Readonly<XmlElement>>,
  firstTspan: Readonly<XmlElement> | undefined,
): boolean {
  return tspans.some((tspan) =>
    ['x', 'y', 'dx', 'dy', 'rotate', 'transform'].some(
      (name) =>
        svgAttribute(tspan, name) !== null && (tspan !== firstTspan || name === 'rotate' || name === 'transform'),
    ),
  );
}
