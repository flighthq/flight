import { webHostTextShaper } from '@flighthq/host-web/contract';

import {
  tauriHostAccessibility,
  tauriHostAudio,
  tauriHostBitmap,
  tauriHostConnectivity,
  tauriHostDevice,
  tauriHostFileSystem,
  tauriHostFont,
  tauriHostFullscreen,
  tauriHostGeolocation,
  tauriHostGl,
  tauriHostGlyph,
  tauriHostHaptics,
  tauriHostImage,
  tauriHostInput,
  tauriHostIpc,
  tauriHostLifecycle,
  tauriHostMediaSession,
  tauriHostMidi,
  tauriHostNet,
  tauriHostPermissions,
  tauriHostPower,
  tauriHostPreferences,
  tauriHostProtocol,
  tauriHostScreen,
  tauriHostSensors,
  tauriHostShare,
  tauriHostSocket,
  tauriHostSoftKeyboard,
  tauriHostStatusBar,
  tauriHostCanvas,
  tauriHostSurface,
  tauriHostTextSegment,
  tauriHostDecompress,
  tauriHostTextShaper,
  tauriHostUpdater,
  tauriHostVideo,
  tauriHostWgpu,
} from './tauriUnsupportedHostGroups';

function returnsEmptyGroup(constructor: () => object): () => void {
  return () => {
    it('constructs an explicit empty capability group', () => expect(constructor()).toEqual({}));
  };
}

describe('tauriHostAccessibility', returnsEmptyGroup(tauriHostAccessibility));
describe('tauriHostAudio', returnsEmptyGroup(tauriHostAudio));
describe('tauriHostBitmap', returnsEmptyGroup(tauriHostBitmap));
describe('tauriHostCanvas', () => {
  it('claims no canvas slots', () => expect(tauriHostCanvas()).toEqual({}));
});
describe('tauriHostConnectivity', returnsEmptyGroup(tauriHostConnectivity));
describe('tauriHostDecompress', returnsEmptyGroup(tauriHostDecompress));
describe('tauriHostDevice', returnsEmptyGroup(tauriHostDevice));
describe('tauriHostFileSystem', returnsEmptyGroup(tauriHostFileSystem));
describe('tauriHostFont', returnsEmptyGroup(tauriHostFont));
describe('tauriHostFullscreen', returnsEmptyGroup(tauriHostFullscreen));
describe('tauriHostGeolocation', returnsEmptyGroup(tauriHostGeolocation));
describe('tauriHostGl', returnsEmptyGroup(tauriHostGl));
describe('tauriHostGlyph', returnsEmptyGroup(tauriHostGlyph));
describe('tauriHostHaptics', returnsEmptyGroup(tauriHostHaptics));
describe('tauriHostImage', returnsEmptyGroup(tauriHostImage));
describe('tauriHostInput', returnsEmptyGroup(tauriHostInput));
describe('tauriHostIpc', returnsEmptyGroup(tauriHostIpc));
describe('tauriHostLifecycle', returnsEmptyGroup(tauriHostLifecycle));
describe('tauriHostMediaSession', returnsEmptyGroup(tauriHostMediaSession));
describe('tauriHostMidi', returnsEmptyGroup(tauriHostMidi));
describe('tauriHostNet', returnsEmptyGroup(tauriHostNet));
describe('tauriHostPermissions', returnsEmptyGroup(tauriHostPermissions));
describe('tauriHostPower', returnsEmptyGroup(tauriHostPower));
describe('tauriHostPreferences', returnsEmptyGroup(tauriHostPreferences));
describe('tauriHostProtocol', returnsEmptyGroup(tauriHostProtocol));
describe('tauriHostScreen', returnsEmptyGroup(tauriHostScreen));
describe('tauriHostSensors', returnsEmptyGroup(tauriHostSensors));
describe('tauriHostShare', returnsEmptyGroup(tauriHostShare));
describe('tauriHostSocket', returnsEmptyGroup(tauriHostSocket));
describe('tauriHostSoftKeyboard', returnsEmptyGroup(tauriHostSoftKeyboard));

describe('tauriHostStatusBar', returnsEmptyGroup(tauriHostStatusBar));
describe('tauriHostSurface', returnsEmptyGroup(tauriHostSurface));
describe('tauriHostTextSegment', returnsEmptyGroup(tauriHostTextSegment));
describe('tauriHostTextShaper', () => {
  it('fills the shaper slot with the shared web text shaper', () => {
    const group = tauriHostTextShaper();
    expect(group.shaper).toBe(webHostTextShaper);
  });

  it('is plain data with no Entity runtime and no symbol keys', () => {
    const group = tauriHostTextShaper();
    expect(Symbol.for('EntityRuntime') in group).toBe(false);
    expect(Object.getOwnPropertySymbols(group)).toEqual([]);
    expect(Object.keys(group)).toEqual(['shaper']);
  });
});
describe('tauriHostUpdater', returnsEmptyGroup(tauriHostUpdater));
describe('tauriHostVideo', returnsEmptyGroup(tauriHostVideo));
describe('tauriHostWgpu', returnsEmptyGroup(tauriHostWgpu));
