import type {
  BackendOperationExplanation,
  HostTextShaperCapability,
  TextFormat,
  TextShaperOperation,
} from '@flighthq/types/contract';

export function explainTextShaperOperation(
  hostTextShaper: Readonly<HostTextShaperCapability>,
  operation: TextShaperOperation,
): BackendOperationExplanation {
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
