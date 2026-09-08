import type { ConvolutionEffect, DisplacementEffect, DomRenderState } from '@flighthq/types/contract';

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
  _enabledStates.add(state);
  getCache(state);
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

function getCache(state: DomRenderState): Map<string, string> {
  let cache = _filterCaches.get(state);
  if (cache === undefined) {
    cache = new Map();
    _filterCaches.set(state, cache);
  }
  return cache;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

const _filterCaches = new WeakMap<DomRenderState, Map<string, string>>();
const _enabledStates = new WeakSet<DomRenderState>();
