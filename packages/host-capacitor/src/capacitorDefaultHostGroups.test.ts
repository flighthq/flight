import { webHostTextShaper } from '@flighthq/host-web/contract';

import {
  capacitorHostAccessibility,
  capacitorHostAudio,
  capacitorHostBitmap,
  capacitorHostFont,
  capacitorHostFullscreen,
  capacitorHostGl,
  capacitorHostGlyph,
  capacitorHostImage,
  capacitorHostInput,
  capacitorHostIpc,
  capacitorHostLifecycle,
  capacitorHostMediaSession,
  capacitorHostMenu,
  capacitorHostMidi,
  capacitorHostNet,
  capacitorHostPermissions,
  capacitorHostPlatform,
  capacitorHostPower,
  capacitorHostPreferences,
  capacitorHostScreen,
  capacitorHostSensors,
  capacitorHostShell,
  capacitorHostShortcut,
  capacitorHostSocket,
  capacitorHostCanvas,
  capacitorHostSurface,
  capacitorHostTextSegment,
  capacitorHostCompress,
  capacitorHostDecompress,
  capacitorHostTextShaper,
  capacitorHostTray,
  capacitorHostUpdater,
  capacitorHostVideo,
  capacitorHostWgpu,
  capacitorHostWindow,
} from './capacitorDefaultHostGroups';

describe('capacitorHostAccessibility', () => {
  it('claims no accessibility slots', () => expect(capacitorHostAccessibility()).toEqual({}));
});

describe('capacitorHostAudio', () => {
  it('claims no audio slots', () => expect(capacitorHostAudio()).toEqual({}));
});

describe('capacitorHostBitmap', () => {
  it('claims no bitmap slots', () => expect(capacitorHostBitmap()).toEqual({}));
});

describe('capacitorHostCanvas', () => {
  it('claims no canvas slots', () => expect(capacitorHostCanvas()).toEqual({}));
});

describe('capacitorHostCompress', () => {
  it('claims no compression slots', () => expect(capacitorHostCompress()).toEqual({}));
});

describe('capacitorHostDecompress', () => {
  it('claims no decompression slots', () => expect(capacitorHostDecompress()).toEqual({}));
});

describe('capacitorHostFont', () => {
  it('claims no font slots', () => expect(capacitorHostFont()).toEqual({}));
});

describe('capacitorHostFullscreen', () => {
  it('claims no fullscreen slots', () => expect(capacitorHostFullscreen()).toEqual({}));
});

describe('capacitorHostGl', () => {
  it('claims no GL slots', () => expect(capacitorHostGl()).toEqual({}));
});

describe('capacitorHostGlyph', () => {
  it('claims no glyph slots', () => expect(capacitorHostGlyph()).toEqual({}));
});

describe('capacitorHostImage', () => {
  it('claims no image slots', () => expect(capacitorHostImage()).toEqual({}));
});

describe('capacitorHostInput', () => {
  it('claims no input slots', () => expect(capacitorHostInput()).toEqual({}));
});

describe('capacitorHostIpc', () => {
  it('claims no IPC slots', () => expect(capacitorHostIpc()).toEqual({}));
});

describe('capacitorHostLifecycle', () => {
  it('claims no lifecycle slots', () => expect(capacitorHostLifecycle()).toEqual({}));
});

describe('capacitorHostMediaSession', () => {
  it('claims no media-session slots', () => expect(capacitorHostMediaSession()).toEqual({}));
});

describe('capacitorHostMenu', () => {
  it('claims no menu slots', () => expect(capacitorHostMenu()).toEqual({}));
});

describe('capacitorHostMidi', () => {
  it('claims no MIDI slots', () => expect(capacitorHostMidi()).toEqual({}));
});

describe('capacitorHostNet', () => {
  it('claims no net slots', () => expect(capacitorHostNet()).toEqual({}));
});

describe('capacitorHostPermissions', () => {
  it('claims no permission slots', () => expect(capacitorHostPermissions()).toEqual({}));
});

describe('capacitorHostPlatform', () => {
  it('claims no platform slots', () => expect(capacitorHostPlatform()).toEqual({}));
});

describe('capacitorHostPower', () => {
  it('claims no power slots', () => expect(capacitorHostPower()).toEqual({}));
});

describe('capacitorHostPreferences', () => {
  it('claims no preference slots', () => expect(capacitorHostPreferences()).toEqual({}));
});

describe('capacitorHostScreen', () => {
  it('claims no screen slots', () => expect(capacitorHostScreen()).toEqual({}));
});

describe('capacitorHostSensors', () => {
  it('claims no sensor slots', () => expect(capacitorHostSensors()).toEqual({}));
});

describe('capacitorHostShell', () => {
  it('claims no shell slots', () => expect(capacitorHostShell()).toEqual({}));
});

describe('capacitorHostShortcut', () => {
  it('claims no shortcut slots', () => expect(capacitorHostShortcut()).toEqual({}));
});

describe('capacitorHostSocket', () => {
  it('claims no socket slots', () => expect(capacitorHostSocket()).toEqual({}));
});

describe('capacitorHostSurface', () => {
  it('claims no surface slots', () => expect(capacitorHostSurface()).toEqual({}));
});

describe('capacitorHostTextSegment', () => {
  it('claims no text-segment slots', () => expect(capacitorHostTextSegment()).toEqual({}));
});

describe('capacitorHostTextShaper', () => {
  it('fills the shaper slot with the shared web text shaper', () => {
    const group = capacitorHostTextShaper();
    expect(group.shaper).toBe(webHostTextShaper);
  });

  it('is plain data with no Entity runtime and no symbol keys', () => {
    const group = capacitorHostTextShaper();
    expect(Symbol.for('EntityRuntime') in group).toBe(false);
    expect(Object.getOwnPropertySymbols(group)).toEqual([]);
    expect(Object.keys(group)).toEqual(['shaper']);
  });
});

describe('capacitorHostTray', () => {
  it('claims no tray slots', () => expect(capacitorHostTray()).toEqual({}));
});

describe('capacitorHostUpdater', () => {
  it('claims no updater slots', () => expect(capacitorHostUpdater()).toEqual({}));
});

describe('capacitorHostVideo', () => {
  it('claims no video slots', () => expect(capacitorHostVideo()).toEqual({}));
});

describe('capacitorHostWgpu', () => {
  it('claims no WGPU slots', () => expect(capacitorHostWgpu()).toEqual({}));
});

describe('capacitorHostWindow', () => {
  it('claims no window capabilities', () => expect(capacitorHostWindow()).toEqual({}));
});
