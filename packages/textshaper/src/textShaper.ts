import type { TextFormat } from '@flighthq/textformat/contract';

import type { HostTextShaperCapability, TextShaperOperation } from './textShaperTypes.ts';

export function explainTextShaperOperation(
  hostTextShaper: Readonly<HostTextShaperCapability>,
  operation: TextShaperOperation,
): { implemented: boolean; layer: 'custom' | 'host' | 'none' | 'sentinel'; operation: string } {
  if (typeof hostTextShaper[operation] === 'function') {
    return { implemented: true, layer: 'host', operation };
  }
  return { implemented: false, layer: 'none', operation };
}

export function hasTextShaperOperation(
  hostTextShaper: Readonly<HostTextShaperCapability>,
  operation: TextShaperOperation,
): boolean {
  return explainTextShaperOperation(hostTextShaper, operation).implemented;
}

export function measureText(
  hostTextShaper: Readonly<HostTextShaperCapability>,
  text: string,
  format: Readonly<TextFormat>,
): number {
  return hostTextShaper.measureText(text, format);
}
