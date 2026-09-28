import { clamp } from '@flighthq/math/contract';
import type { PathWinding, SvgCssRule, SvgImportContext, SvgStyle, XmlElement } from '@flighthq/types/contract';

import { svgAttribute, svgLocalName, parseSvgCssNumber, parseSvgLength, visitSvgElements } from './svgXml.ts';

/**
 * The SVG style cascade: presentation attributes, the `style` attribute, and the `<style>` element's CSS rules.
 *
 * ★ THREE SOURCES, ONE PRECEDENCE, AND IT IS NOT THE OBVIOUS ONE. A presentation attribute loses to a CSS rule, which
 * loses to an inline `style` — so the three are resolved in that order rather than merged, and a rule's specificity
 * decides between rules. Every element family reads a resolved style and none of them re-derives it.
 *
 * `resolveSvgDefinitionStyle` is the same cascade taken for an element that is never drawn — a gradient stop, a clip
 * child — and it is cached because a definition is read once per REFERENCE, not once per document.
 */
export const defaultSvgStyle: SvgStyle = {
  clipRule: 'nonZero',
  color: '#000000',
  display: 'inline',
  fill: '#000000',
  fillOpacity: 1,
  fillRule: 'nonZero',
  filter: 'none',
  fontFamily: 'sans-serif',
  fontSize: 16,
  fontStyle: 'normal',
  fontWeight: 'normal',
  opacity: 1,
  stroke: 'none',
  strokeDasharray: 'none',
  strokeDashoffset: 0,
  strokeLinecap: 'butt',
  strokeLinejoin: 'miter',
  strokeMiterlimit: 4,
  strokeOpacity: 1,
  strokeWidth: 1,
  textAnchor: 'start',
  visibility: 'visible',
};

export function collectCssRules(root: Readonly<XmlElement>): SvgCssRule[] {
  const rules: SvgCssRule[] = [];
  visitSvgElements(root, (element) => {
    if (svgLocalName(element.name) !== 'style') return;
    const text = element.text.replace(/\/\*[\s\S]*?\*\//g, '');
    const expression = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text)) !== null) {
      const declarations = parseStyleDeclarations(match[2]);
      for (const selectorText of match[1].split(',')) {
        const selector = selectorText.trim();
        if (selector === '' || /[\s>+~:[\]]/.test(selector)) continue;
        rules.push({ declarations, order: rules.length, selector, specificity: getCssSelectorSpecificity(selector) });
      }
    }
  });
  return rules;
}

function getCssSelectorSpecificity(selector: string): number {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+/g)?.length ?? 0;
  const hasType = /^[a-zA-Z_][\w-]*/.test(selector) ? 1 : 0;
  return ids * 100 + classes * 10 + hasType;
}

function matchesCssSelector(element: Readonly<XmlElement>, selector: string): boolean {
  if (selector.startsWith('#')) return svgAttribute(element, 'id') === selector.slice(1);
  if (selector.startsWith('.')) {
    const classes = (svgAttribute(element, 'class') ?? '').split(/\s+/);
    return classes.includes(selector.slice(1));
  }
  const [tag, className] = selector.split('.');
  return (
    svgLocalName(element.name) === tag && (className === undefined || matchesCssSelector(element, `.${className}`))
  );
}

export function parseStyleDeclarations(value: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const part of value.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const name = part.slice(0, colon).trim();
    const propertyValue = part
      .slice(colon + 1)
      .trim()
      .replace(/\s*!important\s*$/, '');
    if (name !== '') declarations[name] = propertyValue;
  }
  return declarations;
}

export function resolveSvgDefinitionStyle(element: Readonly<XmlElement>, context: SvgImportContext): SvgStyle {
  const cached = context.resolvedDefinitionStyles.get(element);
  if (cached !== undefined) return cached;
  const parent = context.parentByElement.get(element) ?? null;
  const parentStyle = parent === null ? defaultSvgStyle : resolveSvgDefinitionStyle(parent, context);
  const style = resolveSvgStyle(element, parentStyle, context);
  context.resolvedDefinitionStyles.set(element, style);
  return style;
}

export function resolveSvgStyle(
  element: Readonly<XmlElement>,
  parentStyle: Readonly<SvgStyle>,
  context: Readonly<SvgImportContext>,
): SvgStyle {
  const declarations: Record<string, string> = {};
  for (const name of svgPresentationAttributes) {
    const value = svgAttribute(element, name);
    if (value !== null) declarations[name] = value;
  }
  const matchingRules = context.cssRules
    .filter((rule) => matchesCssSelector(element, rule.selector))
    .sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  for (const rule of matchingRules) Object.assign(declarations, rule.declarations);
  Object.assign(declarations, parseStyleDeclarations(svgAttribute(element, 'style') ?? ''));

  // `inherit` is the CSS-wide keyword for "the parent's computed value", legal on every property
  // here. For an inherited property that is exactly what an absent declaration already resolves to,
  // so the declaration is dropped; the three non-inherited properties below reset to an initial
  // value instead, and so name the parent explicitly. Left in the map, the literal string reaches
  // the paint parser as if it were a color, yields no paint, and the geometry silently disappears.
  const inheritedProperties = new Set<string>();
  for (const name of Object.keys(declarations)) {
    if (declarations[name].trim() !== 'inherit') continue;
    inheritedProperties.add(name);
    delete declarations[name];
  }

  const style: SvgStyle = { ...parentStyle };
  style.clipRule = resolveSvgWinding(declarations['clip-rule'], style.clipRule);
  style.color = declarations.color ?? style.color;
  // `display` is not inherited. An ancestor with display:none still suppresses its subtree via
  // the display-object hierarchy (and the clip collector's early return).
  style.display = inheritedProperties.has('display') ? parentStyle.display : (declarations.display ?? 'inline');
  style.fill = declarations.fill ?? style.fill;
  style.fillOpacity = clamp(parseSvgCssNumber(declarations['fill-opacity'], style.fillOpacity), 0, 1);
  style.fillRule = resolveSvgWinding(declarations['fill-rule'], style.fillRule);
  style.filter = inheritedProperties.has('filter') ? parentStyle.filter : (declarations.filter ?? 'none');
  style.fontFamily = declarations['font-family'] ?? style.fontFamily;
  style.fontSize = parseSvgLength(declarations['font-size'] ?? null, style.fontSize);
  style.fontStyle = declarations['font-style'] ?? style.fontStyle;
  style.fontWeight = declarations['font-weight'] ?? style.fontWeight;
  style.opacity = inheritedProperties.has('opacity')
    ? parentStyle.opacity
    : clamp(parseSvgCssNumber(declarations.opacity, 1), 0, 1);
  style.stroke = declarations.stroke ?? style.stroke;
  style.strokeDasharray = declarations['stroke-dasharray'] ?? style.strokeDasharray;
  style.strokeDashoffset = parseSvgLength(declarations['stroke-dashoffset'] ?? null, style.strokeDashoffset);
  style.strokeLinecap = declarations['stroke-linecap'] ?? style.strokeLinecap;
  style.strokeLinejoin = declarations['stroke-linejoin'] ?? style.strokeLinejoin;
  style.strokeMiterlimit = parseSvgCssNumber(declarations['stroke-miterlimit'], style.strokeMiterlimit);
  style.strokeOpacity = clamp(parseSvgCssNumber(declarations['stroke-opacity'], style.strokeOpacity), 0, 1);
  style.strokeWidth = Math.max(0, parseSvgLength(declarations['stroke-width'] ?? null, style.strokeWidth));
  style.textAnchor = declarations['text-anchor'] ?? style.textAnchor;
  style.visibility = declarations.visibility ?? style.visibility;
  return style;
}

export function resolveSvgWinding(value: string | undefined, fallback: PathWinding): PathWinding {
  if (value === 'evenodd') return 'evenOdd';
  if (value === 'nonzero') return 'nonZero';
  return fallback;
}

const svgPresentationAttributes = [
  'clip-rule',
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'visibility',
] as const;
