import type { TextSegmentGuard } from '@flighthq/types/contract';

export function reportTextSegmenterUnavailable(): void {
  _guard?.();
}

export function setTextSegmentGuard(guard: TextSegmentGuard | null): void {
  _guard = guard;
}

let _guard: TextSegmentGuard | null = null;
