import type { ConvolutionEffect, DisplacementEffect, DomRenderState, Node2D } from '@flighthq/types/contract';

import { setDomCssFilter } from './domCSSFilterBinding';

export function applyDomSvgFilterToNode(
  state: DomRenderState,
  node: Node2D,
  effect: Readonly<ConvolutionEffect | DisplacementEffect>,
): void {
  const defs = getSvgDefs(state);
  if (defs === null) return;
  const body = getDomSvgFilter(state, effect);
  if (body === null) return;
  const id = ensureFilterElement(state, defs, body);
  setDomCssFilter(state, node, `url(#${id})`);
}

/** Returns the canonical SVG filter body for a convolution effect. */
export function createDomSvgConvolutionFilter(effect: Readonly<ConvolutionEffect>): string {
  const order = `${Math.max(1, Math.floor(effect.matrixX))} ${Math.max(1, Math.floor(effect.matrixY))}`;
  const matrix = effect.matrix.map((value) => formatNumber(value)).join(' ');
  const attributes = [`order="${order}"`, `kernelMatrix="${matrix}"`];
  if (effect.divisor !== undefined) attributes.push(`divisor="${formatNumber(effect.divisor)}"`);
  if (effect.bias !== undefined) attributes.push(`bias="${formatNumber(effect.bias)}"`);
  if (effect.clamp !== undefined) attributes.push(`edgeMode="${effect.clamp ? 'duplicate' : 'none'}"`);
  if (effect.preserveAlpha !== undefined) attributes.push(`preserveAlpha="${effect.preserveAlpha ? 'true' : 'false'}"`);
  return `<feConvolveMatrix ${attributes.join(' ')}/>`;
}

/** Returns the canonical SVG filter body for the procedural displacement effect. */
export function createDomSvgDisplacementMapFilter(effect: Readonly<DisplacementEffect>): string {
  const frequency = formatNumber(effect.frequency ?? 12);
  const scale = formatNumber(effect.intensity ?? 8);
  const seed = formatNumber(effect.seed ?? 0);
  return (
    `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" seed="${seed}" ` +
    `numOctaves="1" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" ` +
    `scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`
  );
}

/** Enables the DOM raster-filter cache for a render state. */
export function enableDomRasterFilterSupport(state: DomRenderState): void {
  if (_enabledStates.has(state)) return;
  _enabledStates.add(state);
  getCache(state);
  injectSvgDefs(state);
}

/** Returns (and caches) the SVG body for an effect on an enabled state. */
export function getDomSvgFilter(
  state: DomRenderState,
  effect: Readonly<ConvolutionEffect | DisplacementEffect>,
): string | null {
  if (!_enabledStates.has(state)) return null;
  const cache = getCache(state);
  if (cache === null) return null;
  const key =
    effect.kind === 'ConvolutionEffect'
      ? `convolution:${JSON.stringify(effect)}`
      : `displacement:${JSON.stringify(effect)}`;
  let body = cache.get(key);
  if (body === undefined) {
    body =
      effect.kind === 'ConvolutionEffect'
        ? createDomSvgConvolutionFilter(effect)
        : createDomSvgDisplacementMapFilter(effect);
    cache.set(key, body);
  }
  return body;
}

export function removeDomSvgFilterFromNode(state: DomRenderState, node: Node2D): void {
  setDomCssFilter(state, node, null);
}

function ensureFilterElement(state: DomRenderState, defs: SVGDefsElement, body: string): string {
  const filterElements = getFilterElements(state);
  let id = filterElements.get(body);
  if (id !== undefined) return id;
  id = `flight-filter-${_nextFilterId++}`;
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', id);
  filter.innerHTML = body;
  defs.appendChild(filter);
  filterElements.set(body, id);
  return id;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

function getCache(state: DomRenderState): Map<string, string> {
  let cache = _filterCaches.get(state);
  if (cache === undefined) {
    cache = new Map();
    _filterCaches.set(state, cache);
  }
  return cache;
}

function getFilterElements(state: DomRenderState): Map<string, string> {
  let elements = _filterElements.get(state);
  if (elements === undefined) {
    elements = new Map();
    _filterElements.set(state, elements);
  }
  return elements;
}

function getSvgDefs(state: DomRenderState): SVGDefsElement | null {
  return _svgDefs.get(state) ?? null;
}

function injectSvgDefs(state: DomRenderState): void {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);
  state.element.appendChild(svg);
  _svgDefs.set(state, defs);
}

const _filterCaches = new WeakMap<DomRenderState, Map<string, string>>();
const _filterElements = new WeakMap<DomRenderState, Map<string, string>>();
const _enabledStates = new WeakSet<DomRenderState>();
const _svgDefs = new WeakMap<DomRenderState, SVGDefsElement>();
let _nextFilterId = 0;
