import type { WgpuAdapterCapabilities } from '@flighthq/types';

// Queries a GPUAdapter for the capabilities that createWgpuRenderState uses to gate format and
// feature paths. Call this after requestAdapter but before createWgpuRenderState and pass the
// result as options.adapterCapabilities so the state is configured correctly from the start.
//
// The adapter is read-only here — no device is created. This is intentional: capabilities are
// queried at configuration time, before the device is allocated, so the device can be requested
// with the right requiredFeatures list.
export function getWgpuAdapterCapabilities(adapter: GPUAdapter): WgpuAdapterCapabilities {
  const features = adapter.features;
  const limits = adapter.limits;

  // float32-filterable: allows rgba16float render targets with linear filtering (HDR).
  const supportsFloat32Filterable = features.has('float32-filterable');

  // timestamp-query: enables GPU time measurement (enableWgpuTimestampQueries).
  const supportsTimestampQuery = features.has('timestamp-query');

  // maxTextureDimension2D: the limit is defined by the spec; fall back to 8192 if absent.
  const maxTextureDimension2D = limits.maxTextureDimension2D ?? 8192;

  // WebGPU does not expose supported MSAA sample counts per format directly via the adapter.
  // All conformant WebGPU implementations support sampleCount 4 for standard formats; 8+ is
  // implementation-defined. Report 4 as the safe maximum for antialias paths.
  const maxSampleCount = 4;

  return {
    maxSampleCount,
    maxTextureDimension2D,
    supportsFloat32Filterable,
    supportsTimestampQuery,
  };
}
