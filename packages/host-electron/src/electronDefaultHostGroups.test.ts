import {
  webHostAudioDecode,
  webHostImageDecode,
  webHostImageEncode,
  webHostTextShaper,
} from '@flighthq/host-web/contract';
import type { ElectronApi } from '@flighthq/types/contract';

import {
  electronHostAccessibilityGroup,
  electronHostAudioGroup,
  electronHostBitmapGroup,
  electronHostConnectivityGroup,
  electronHostDeviceGroup,
  electronHostFileSystemGroup,
  electronHostFontGroup,
  electronHostFullscreenGroup,
  electronHostGeolocationGroup,
  electronHostGlGroup,
  electronHostGlyphGroup,
  electronHostHapticsGroup,
  electronHostAudioDecodeGroup,
  electronHostImageDecodeGroup,
  electronHostImageEncodeGroup,
  electronHostImageGroup,
  electronHostInputGroup,
  electronHostLifecycleGroup,
  electronHostMediaSessionGroup,
  electronHostMidiGroup,
  electronHostNetGroup,
  electronHostPermissionsGroup,
  electronHostSensorsGroup,
  electronHostShareGroup,
  electronHostSocketGroup,
  electronHostSoftKeyboardGroup,
  electronHostStatusBarGroup,
  electronHostCanvasGroup,
  electronHostSurfaceGroup,
  electronHostTextSegmentGroup,
  electronHostCompressGroup,
  electronHostDecompressGroup,
  electronHostTextShaperGroup,
  electronHostVideoGroup,
  electronHostWgpuGroup,
} from './electronDefaultHostGroups';

const electron = {} as ElectronApi;

function emptyGroup(factory: () => object): () => void {
  return () => {
    it('constructs an exact empty capability group', () => {
      expect(factory()).toEqual({});
    });
  };
}

const accessibilityGroup = emptyGroup(() => electronHostAccessibilityGroup(electron));
const audioGroup = emptyGroup(() => electronHostAudioGroup(electron));
const bitmapGroup = emptyGroup(() => electronHostBitmapGroup(electron));
const connectivityGroup = emptyGroup(() => electronHostConnectivityGroup(electron));
const deviceGroup = emptyGroup(() => electronHostDeviceGroup(electron));
const fileSystemGroup = emptyGroup(() => electronHostFileSystemGroup(electron));
const fontGroup = emptyGroup(() => electronHostFontGroup(electron));
const fullscreenGroup = emptyGroup(() => electronHostFullscreenGroup(electron));
const geolocationGroup = emptyGroup(() => electronHostGeolocationGroup(electron));
const glGroup = emptyGroup(() => electronHostGlGroup(electron));
const glyphGroup = emptyGroup(() => electronHostGlyphGroup(electron));
const hapticsGroup = emptyGroup(() => electronHostHapticsGroup(electron));
const imageGroup = emptyGroup(() => electronHostImageGroup(electron));
const inputGroup = emptyGroup(() => electronHostInputGroup(electron));
const lifecycleGroup = emptyGroup(() => electronHostLifecycleGroup(electron));
const mediaSessionGroup = emptyGroup(() => electronHostMediaSessionGroup(electron));
const midiGroup = emptyGroup(() => electronHostMidiGroup(electron));
const netGroup = emptyGroup(() => electronHostNetGroup(electron));
const permissionsGroup = emptyGroup(() => electronHostPermissionsGroup(electron));
const sensorsGroup = emptyGroup(() => electronHostSensorsGroup(electron));
const shareGroup = emptyGroup(() => electronHostShareGroup(electron));
const socketGroup = emptyGroup(() => electronHostSocketGroup(electron));
const softKeyboardGroup = emptyGroup(() => electronHostSoftKeyboardGroup(electron));
const statusBarGroup = emptyGroup(() => electronHostStatusBarGroup(electron));
const canvasGroup = emptyGroup(() => electronHostCanvasGroup(electron));
const surfaceGroup = emptyGroup(() => electronHostSurfaceGroup(electron));
const textSegmentGroup = emptyGroup(() => electronHostTextSegmentGroup(electron));
const compressGroup = emptyGroup(() => electronHostCompressGroup(electron));
const decompressGroup = emptyGroup(() => electronHostDecompressGroup(electron));
const videoGroup = emptyGroup(() => electronHostVideoGroup(electron));
const wgpuGroup = emptyGroup(() => electronHostWgpuGroup(electron));

describe('electronHostAccessibilityGroup', accessibilityGroup);
describe('electronHostAudioDecodeGroup', () => {
  it('delegates to the shared web audio decode capabilities', () => {
    expect(electronHostAudioDecodeGroup(electron)).toBe(webHostAudioDecode);
  });
});
describe('electronHostAudioGroup', audioGroup);
describe('electronHostBitmapGroup', bitmapGroup);
describe('electronHostCanvasGroup', canvasGroup);
describe('electronHostCompressGroup', compressGroup);
describe('electronHostConnectivityGroup', connectivityGroup);
describe('electronHostDecompressGroup', decompressGroup);
describe('electronHostDeviceGroup', deviceGroup);
describe('electronHostFileSystemGroup', fileSystemGroup);
describe('electronHostFontGroup', fontGroup);
describe('electronHostFullscreenGroup', fullscreenGroup);
describe('electronHostGeolocationGroup', geolocationGroup);
describe('electronHostGlGroup', glGroup);
describe('electronHostGlyphGroup', glyphGroup);
describe('electronHostHapticsGroup', hapticsGroup);
describe('electronHostImageDecodeGroup', () => {
  it('delegates to the shared web image decode capabilities', () => {
    expect(electronHostImageDecodeGroup(electron)).toBe(webHostImageDecode);
  });
});
describe('electronHostImageEncodeGroup', () => {
  it('delegates to the shared web image encode capabilities', () => {
    expect(electronHostImageEncodeGroup(electron)).toBe(webHostImageEncode);
  });
});
describe('electronHostImageGroup', imageGroup);
describe('electronHostInputGroup', inputGroup);
describe('electronHostLifecycleGroup', lifecycleGroup);
describe('electronHostMediaSessionGroup', mediaSessionGroup);
describe('electronHostMidiGroup', midiGroup);
describe('electronHostNetGroup', netGroup);
describe('electronHostPermissionsGroup', permissionsGroup);
describe('electronHostSensorsGroup', sensorsGroup);
describe('electronHostShareGroup', shareGroup);
describe('electronHostSocketGroup', socketGroup);
describe('electronHostSoftKeyboardGroup', softKeyboardGroup);
describe('electronHostStatusBarGroup', statusBarGroup);
describe('electronHostSurfaceGroup', surfaceGroup);

describe('electronHostTextSegmentGroup', textSegmentGroup);
describe('electronHostTextShaperGroup', () => {
  it('fills the shaper slot with the shared web text shaper', () => {
    const group = electronHostTextShaperGroup(electron);
    expect(group.shaper).toBe(webHostTextShaper);
  });

  it('is plain data with no Entity runtime and no symbol keys', () => {
    const group = electronHostTextShaperGroup(electron);
    expect(Symbol.for('EntityRuntime') in group).toBe(false);
    expect(Object.getOwnPropertySymbols(group)).toEqual([]);
    expect(Object.keys(group)).toEqual(['shaper']);
  });
});
describe('electronHostVideoGroup', videoGroup);
describe('electronHostWgpuGroup', wgpuGroup);
