// Opaque: created by the device and bound, never inspected. On web it is the browser's GPUSampler; a
// native host supplies its own handle.
export type WgpuSampler = GPUSampler;

export type WgpuAddressMode = 'clamp-to-edge' | 'mirror-repeat' | 'repeat';

export type WgpuCompareFunction =
  | 'always'
  | 'equal'
  | 'greater'
  | 'greater-equal'
  | 'less'
  | 'less-equal'
  | 'never'
  | 'not-equal';

export type WgpuFilterMode = 'linear' | 'nearest';

export type WgpuMipmapFilterMode = 'linear' | 'nearest';

export interface WgpuSamplerDescriptor {
  addressModeU?: WgpuAddressMode;
  addressModeV?: WgpuAddressMode;
  addressModeW?: WgpuAddressMode;
  compare?: WgpuCompareFunction;
  label?: string;
  lodMaxClamp?: number;
  lodMinClamp?: number;
  magFilter?: WgpuFilterMode;
  maxAnisotropy?: number;
  minFilter?: WgpuFilterMode;
  mipmapFilter?: WgpuMipmapFilterMode;
}
