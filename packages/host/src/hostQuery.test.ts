import type { EntityWithoutRuntime, Host } from '@flighthq/types/contract';

import { createHost } from './host';
import {
  getHostAudioDevice,
  getHostAudioMixer,
  getHostBitmapEncode,
  getHostBitmapReadback,
  getHostClipboardFormats,
  getHostDevice,
  getHostFileSystem,
  getHostFontLoading,
  getHostGeolocation,
  getHostGlyphRasterizer,
  getHostHaptics,
  getHostImage,
  getHostInputIngress,
  getHostLifecycle,
  getHostNet,
  getHostNotificationPermission,
  getHostPlatform,
  getHostPowerKeepAwake,
  getHostPreferences,
  getHostScreenQuery,
  getHostSensors,
  getHostSocket,
  getHostSoftKeyboardInfo,
  getHostStoragePersistenceQuery,
  getHostTextSegmenter,
  getHostTextShaper,
  getHostVideo,
  getHostWgpu,
  hasHostAudioDevice,
  hasHostAudioMixer,
  hasHostBitmapEncode,
  hasHostBitmapReadback,
  hasHostClipboardFormats,
  hasHostDevice,
  hasHostFileSystem,
  hasHostFontLoading,
  hasHostGeolocation,
  hasHostGlyphRasterizer,
  hasHostHaptics,
  hasHostImage,
  hasHostInputIngress,
  hasHostLifecycle,
  hasHostNet,
  hasHostNotificationPermission,
  hasHostPlatform,
  hasHostPowerKeepAwake,
  hasHostPreferences,
  hasHostScreenQuery,
  hasHostSensors,
  hasHostSocket,
  hasHostSoftKeyboardInfo,
  hasHostStoragePersistenceQuery,
  hasHostTextSegmenter,
  hasHostTextShaper,
  hasHostVideo,
  hasHostWgpu,
} from './hostQuery';

// Each accessor is exercised through a host built by GROUP AND SLOT NAME, so the spelling the test
// asserts is independent of the static property access the accessor compiles to.
//
// The decoy case is what the flat group structure made necessary. Slot names are scoped by their group
// and therefore collide across groups — `device.info`, `platform.info`, `softKeyboard.info`, and
// `statusBar.info` are four different capabilities — so reading the right slot on the wrong group is now
// the dominant way an accessor can be wrong, and a sibling-slot decoy cannot see it. Each accessor is
// instead handed a host with EVERY other covered slot filled and its own empty: it must still return
// null, which fails for a wrong group, a wrong slot, or both.

describe('getHostAudioDevice', () => {
  it('returns the capability held in host.audio.device', () => {
    expect(getHostAudioDevice(hostWithSlot('audio', 'device'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostAudioDevice(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostAudioDevice(hostWithEveryCoveredSlotExcept('audio', 'device'))).toBeNull();
  });
});

describe('getHostAudioMixer', () => {
  it('returns the capability held in host.audio.mixer', () => {
    expect(getHostAudioMixer(hostWithSlot('audio', 'mixer'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostAudioMixer(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostAudioMixer(hostWithEveryCoveredSlotExcept('audio', 'mixer'))).toBeNull();
  });
});

describe('getHostBitmapEncode', () => {
  it('returns the capability held in host.bitmap.encode', () => {
    expect(getHostBitmapEncode(hostWithSlot('bitmap', 'encode'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostBitmapEncode(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostBitmapEncode(hostWithEveryCoveredSlotExcept('bitmap', 'encode'))).toBeNull();
  });
});

describe('getHostBitmapReadback', () => {
  it('returns the capability held in host.bitmap.readback', () => {
    expect(getHostBitmapReadback(hostWithSlot('bitmap', 'readback'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostBitmapReadback(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostBitmapReadback(hostWithEveryCoveredSlotExcept('bitmap', 'readback'))).toBeNull();
  });
});

describe('getHostClipboardFormats', () => {
  it('returns the capability held in host.clipboard.formats', () => {
    expect(getHostClipboardFormats(hostWithSlot('clipboard', 'formats'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostClipboardFormats(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostClipboardFormats(hostWithEveryCoveredSlotExcept('clipboard', 'formats'))).toBeNull();
  });
});

describe('getHostDevice', () => {
  it('returns the capability held in host.device.info', () => {
    expect(getHostDevice(hostWithSlot('device', 'info'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostDevice(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostDevice(hostWithEveryCoveredSlotExcept('device', 'info'))).toBeNull();
  });
});

describe('getHostFileSystem', () => {
  it('returns the capability held in host.fileSystem.access', () => {
    expect(getHostFileSystem(hostWithSlot('fileSystem', 'access'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostFileSystem(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostFileSystem(hostWithEveryCoveredSlotExcept('fileSystem', 'access'))).toBeNull();
  });
});

describe('getHostFontLoading', () => {
  it('returns the capability held in host.font.loader', () => {
    expect(getHostFontLoading(hostWithSlot('font', 'loader'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostFontLoading(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostFontLoading(hostWithEveryCoveredSlotExcept('font', 'loader'))).toBeNull();
  });
});

describe('getHostGeolocation', () => {
  it('returns the capability held in host.geolocation.position', () => {
    expect(getHostGeolocation(hostWithSlot('geolocation', 'position'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostGeolocation(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostGeolocation(hostWithEveryCoveredSlotExcept('geolocation', 'position'))).toBeNull();
  });
});

describe('getHostGlyphRasterizer', () => {
  it('returns the capability held in host.glyph.rasterizer', () => {
    expect(getHostGlyphRasterizer(hostWithSlot('glyph', 'rasterizer'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostGlyphRasterizer(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostGlyphRasterizer(hostWithEveryCoveredSlotExcept('glyph', 'rasterizer'))).toBeNull();
  });
});

describe('getHostHaptics', () => {
  it('returns the capability held in host.haptics.engine', () => {
    expect(getHostHaptics(hostWithSlot('haptics', 'engine'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostHaptics(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostHaptics(hostWithEveryCoveredSlotExcept('haptics', 'engine'))).toBeNull();
  });
});

describe('getHostImage', () => {
  it('returns the capability held in host.image.loader', () => {
    expect(getHostImage(hostWithSlot('image', 'loader'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostImage(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostImage(hostWithEveryCoveredSlotExcept('image', 'loader'))).toBeNull();
  });
});

describe('getHostInputIngress', () => {
  it('returns the capability held in host.input.ingress', () => {
    expect(getHostInputIngress(hostWithSlot('input', 'ingress'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostInputIngress(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostInputIngress(hostWithEveryCoveredSlotExcept('input', 'ingress'))).toBeNull();
  });
});

describe('getHostLifecycle', () => {
  it('returns the capability held in host.lifecycle.state', () => {
    expect(getHostLifecycle(hostWithSlot('lifecycle', 'state'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostLifecycle(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostLifecycle(hostWithEveryCoveredSlotExcept('lifecycle', 'state'))).toBeNull();
  });
});

describe('getHostNet', () => {
  it('returns the capability held in host.net.http', () => {
    expect(getHostNet(hostWithSlot('net', 'http'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostNet(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostNet(hostWithEveryCoveredSlotExcept('net', 'http'))).toBeNull();
  });
});

describe('getHostNotificationPermission', () => {
  it('returns the capability held in host.notification.permission', () => {
    expect(getHostNotificationPermission(hostWithSlot('notification', 'permission'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostNotificationPermission(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostNotificationPermission(hostWithEveryCoveredSlotExcept('notification', 'permission'))).toBeNull();
  });
});

describe('getHostPlatform', () => {
  it('returns the capability held in host.platform.info', () => {
    expect(getHostPlatform(hostWithSlot('platform', 'info'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostPlatform(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostPlatform(hostWithEveryCoveredSlotExcept('platform', 'info'))).toBeNull();
  });
});

describe('getHostPowerKeepAwake', () => {
  it('returns the capability held in host.power.keepAwake', () => {
    expect(getHostPowerKeepAwake(hostWithSlot('power', 'keepAwake'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostPowerKeepAwake(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostPowerKeepAwake(hostWithEveryCoveredSlotExcept('power', 'keepAwake'))).toBeNull();
  });
});

describe('getHostPreferences', () => {
  it('returns the capability held in host.preferences.local', () => {
    expect(getHostPreferences(hostWithSlot('preferences', 'local'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostPreferences(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostPreferences(hostWithEveryCoveredSlotExcept('preferences', 'local'))).toBeNull();
  });
});

describe('getHostScreenQuery', () => {
  it('returns the capability held in host.screen.query', () => {
    expect(getHostScreenQuery(hostWithSlot('screen', 'query'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostScreenQuery(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostScreenQuery(hostWithEveryCoveredSlotExcept('screen', 'query'))).toBeNull();
  });
});

describe('getHostSensors', () => {
  it('returns the capability held in host.sensors.query', () => {
    expect(getHostSensors(hostWithSlot('sensors', 'query'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostSensors(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostSensors(hostWithEveryCoveredSlotExcept('sensors', 'query'))).toBeNull();
  });
});

describe('getHostSocket', () => {
  it('returns the capability held in host.socket.connection', () => {
    expect(getHostSocket(hostWithSlot('socket', 'connection'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostSocket(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostSocket(hostWithEveryCoveredSlotExcept('socket', 'connection'))).toBeNull();
  });
});

describe('getHostSoftKeyboardInfo', () => {
  it('returns the capability held in host.softKeyboard.info', () => {
    expect(getHostSoftKeyboardInfo(hostWithSlot('softKeyboard', 'info'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostSoftKeyboardInfo(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostSoftKeyboardInfo(hostWithEveryCoveredSlotExcept('softKeyboard', 'info'))).toBeNull();
  });
});

describe('getHostStoragePersistenceQuery', () => {
  it('returns the capability held in host.preferences.persistenceQuery', () => {
    expect(getHostStoragePersistenceQuery(hostWithSlot('preferences', 'persistenceQuery'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostStoragePersistenceQuery(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(
      getHostStoragePersistenceQuery(hostWithEveryCoveredSlotExcept('preferences', 'persistenceQuery')),
    ).toBeNull();
  });
});

describe('getHostTextSegmenter', () => {
  it('returns the capability held in host.textSegment.segmenter', () => {
    expect(getHostTextSegmenter(hostWithSlot('textSegment', 'segmenter'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostTextSegmenter(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostTextSegmenter(hostWithEveryCoveredSlotExcept('textSegment', 'segmenter'))).toBeNull();
  });
});

describe('getHostTextShaper', () => {
  it('returns the capability held in host.textShaper.shaper', () => {
    expect(getHostTextShaper(hostWithSlot('textShaper', 'shaper'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostTextShaper(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostTextShaper(hostWithEveryCoveredSlotExcept('textShaper', 'shaper'))).toBeNull();
  });
});

describe('getHostVideo', () => {
  it('returns the capability held in host.video.playback', () => {
    expect(getHostVideo(hostWithSlot('video', 'playback'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostVideo(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostVideo(hostWithEveryCoveredSlotExcept('video', 'playback'))).toBeNull();
  });
});

describe('getHostWgpu', () => {
  it('returns the capability held in host.wgpu.context', () => {
    expect(getHostWgpu(hostWithSlot('wgpu', 'context'))).toBe(CAPABILITY);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostWgpu(createHost())).toBeNull();
  });

  it('returns null when every other covered slot is filled and this one is not', () => {
    expect(getHostWgpu(hostWithEveryCoveredSlotExcept('wgpu', 'context'))).toBeNull();
  });
});

describe('hasHostAudioDevice', () => {
  it('is true only when host.audio.device holds a capability', () => {
    expect(hasHostAudioDevice(hostWithSlot('audio', 'device'))).toBe(true);
    expect(hasHostAudioDevice(hostWithEveryCoveredSlotExcept('audio', 'device'))).toBe(false);
    expect(hasHostAudioDevice(createHost())).toBe(false);
  });
});

describe('hasHostAudioMixer', () => {
  it('is true only when host.audio.mixer holds a capability', () => {
    expect(hasHostAudioMixer(hostWithSlot('audio', 'mixer'))).toBe(true);
    expect(hasHostAudioMixer(hostWithEveryCoveredSlotExcept('audio', 'mixer'))).toBe(false);
    expect(hasHostAudioMixer(createHost())).toBe(false);
  });
});

describe('hasHostBitmapEncode', () => {
  it('is true only when host.bitmap.encode holds a capability', () => {
    expect(hasHostBitmapEncode(hostWithSlot('bitmap', 'encode'))).toBe(true);
    expect(hasHostBitmapEncode(hostWithEveryCoveredSlotExcept('bitmap', 'encode'))).toBe(false);
    expect(hasHostBitmapEncode(createHost())).toBe(false);
  });
});

describe('hasHostBitmapReadback', () => {
  it('is true only when host.bitmap.readback holds a capability', () => {
    expect(hasHostBitmapReadback(hostWithSlot('bitmap', 'readback'))).toBe(true);
    expect(hasHostBitmapReadback(hostWithEveryCoveredSlotExcept('bitmap', 'readback'))).toBe(false);
    expect(hasHostBitmapReadback(createHost())).toBe(false);
  });
});

describe('hasHostClipboardFormats', () => {
  it('is true only when host.clipboard.formats holds a capability', () => {
    expect(hasHostClipboardFormats(hostWithSlot('clipboard', 'formats'))).toBe(true);
    expect(hasHostClipboardFormats(hostWithEveryCoveredSlotExcept('clipboard', 'formats'))).toBe(false);
    expect(hasHostClipboardFormats(createHost())).toBe(false);
  });
});

describe('hasHostDevice', () => {
  it('is true only when host.device.info holds a capability', () => {
    expect(hasHostDevice(hostWithSlot('device', 'info'))).toBe(true);
    expect(hasHostDevice(hostWithEveryCoveredSlotExcept('device', 'info'))).toBe(false);
    expect(hasHostDevice(createHost())).toBe(false);
  });
});

describe('hasHostFileSystem', () => {
  it('is true only when host.fileSystem.access holds a capability', () => {
    expect(hasHostFileSystem(hostWithSlot('fileSystem', 'access'))).toBe(true);
    expect(hasHostFileSystem(hostWithEveryCoveredSlotExcept('fileSystem', 'access'))).toBe(false);
    expect(hasHostFileSystem(createHost())).toBe(false);
  });
});

describe('hasHostFontLoading', () => {
  it('is true only when host.font.loader holds a capability', () => {
    expect(hasHostFontLoading(hostWithSlot('font', 'loader'))).toBe(true);
    expect(hasHostFontLoading(hostWithEveryCoveredSlotExcept('font', 'loader'))).toBe(false);
    expect(hasHostFontLoading(createHost())).toBe(false);
  });
});

describe('hasHostGeolocation', () => {
  it('is true only when host.geolocation.position holds a capability', () => {
    expect(hasHostGeolocation(hostWithSlot('geolocation', 'position'))).toBe(true);
    expect(hasHostGeolocation(hostWithEveryCoveredSlotExcept('geolocation', 'position'))).toBe(false);
    expect(hasHostGeolocation(createHost())).toBe(false);
  });
});

describe('hasHostGlyphRasterizer', () => {
  it('is true only when host.glyph.rasterizer holds a capability', () => {
    expect(hasHostGlyphRasterizer(hostWithSlot('glyph', 'rasterizer'))).toBe(true);
    expect(hasHostGlyphRasterizer(hostWithEveryCoveredSlotExcept('glyph', 'rasterizer'))).toBe(false);
    expect(hasHostGlyphRasterizer(createHost())).toBe(false);
  });
});

describe('hasHostHaptics', () => {
  it('is true only when host.haptics.engine holds a capability', () => {
    expect(hasHostHaptics(hostWithSlot('haptics', 'engine'))).toBe(true);
    expect(hasHostHaptics(hostWithEveryCoveredSlotExcept('haptics', 'engine'))).toBe(false);
    expect(hasHostHaptics(createHost())).toBe(false);
  });
});

describe('hasHostImage', () => {
  it('is true only when host.image.loader holds a capability', () => {
    expect(hasHostImage(hostWithSlot('image', 'loader'))).toBe(true);
    expect(hasHostImage(hostWithEveryCoveredSlotExcept('image', 'loader'))).toBe(false);
    expect(hasHostImage(createHost())).toBe(false);
  });
});

describe('hasHostInputIngress', () => {
  it('is true only when host.input.ingress holds a capability', () => {
    expect(hasHostInputIngress(hostWithSlot('input', 'ingress'))).toBe(true);
    expect(hasHostInputIngress(hostWithEveryCoveredSlotExcept('input', 'ingress'))).toBe(false);
    expect(hasHostInputIngress(createHost())).toBe(false);
  });
});

describe('hasHostLifecycle', () => {
  it('is true only when host.lifecycle.state holds a capability', () => {
    expect(hasHostLifecycle(hostWithSlot('lifecycle', 'state'))).toBe(true);
    expect(hasHostLifecycle(hostWithEveryCoveredSlotExcept('lifecycle', 'state'))).toBe(false);
    expect(hasHostLifecycle(createHost())).toBe(false);
  });
});

describe('hasHostNet', () => {
  it('is true only when host.net.http holds a capability', () => {
    expect(hasHostNet(hostWithSlot('net', 'http'))).toBe(true);
    expect(hasHostNet(hostWithEveryCoveredSlotExcept('net', 'http'))).toBe(false);
    expect(hasHostNet(createHost())).toBe(false);
  });
});

describe('hasHostNotificationPermission', () => {
  it('is true only when host.notification.permission holds a capability', () => {
    expect(hasHostNotificationPermission(hostWithSlot('notification', 'permission'))).toBe(true);
    expect(hasHostNotificationPermission(hostWithEveryCoveredSlotExcept('notification', 'permission'))).toBe(false);
    expect(hasHostNotificationPermission(createHost())).toBe(false);
  });
});

describe('hasHostPlatform', () => {
  it('is true only when host.platform.info holds a capability', () => {
    expect(hasHostPlatform(hostWithSlot('platform', 'info'))).toBe(true);
    expect(hasHostPlatform(hostWithEveryCoveredSlotExcept('platform', 'info'))).toBe(false);
    expect(hasHostPlatform(createHost())).toBe(false);
  });
});

describe('hasHostPowerKeepAwake', () => {
  it('is true only when host.power.keepAwake holds a capability', () => {
    expect(hasHostPowerKeepAwake(hostWithSlot('power', 'keepAwake'))).toBe(true);
    expect(hasHostPowerKeepAwake(hostWithEveryCoveredSlotExcept('power', 'keepAwake'))).toBe(false);
    expect(hasHostPowerKeepAwake(createHost())).toBe(false);
  });
});

describe('hasHostPreferences', () => {
  it('is true only when host.preferences.local holds a capability', () => {
    expect(hasHostPreferences(hostWithSlot('preferences', 'local'))).toBe(true);
    expect(hasHostPreferences(hostWithEveryCoveredSlotExcept('preferences', 'local'))).toBe(false);
    expect(hasHostPreferences(createHost())).toBe(false);
  });
});

describe('hasHostScreenQuery', () => {
  it('is true only when host.screen.query holds a capability', () => {
    expect(hasHostScreenQuery(hostWithSlot('screen', 'query'))).toBe(true);
    expect(hasHostScreenQuery(hostWithEveryCoveredSlotExcept('screen', 'query'))).toBe(false);
    expect(hasHostScreenQuery(createHost())).toBe(false);
  });
});

describe('hasHostSensors', () => {
  it('is true only when host.sensors.query holds a capability', () => {
    expect(hasHostSensors(hostWithSlot('sensors', 'query'))).toBe(true);
    expect(hasHostSensors(hostWithEveryCoveredSlotExcept('sensors', 'query'))).toBe(false);
    expect(hasHostSensors(createHost())).toBe(false);
  });
});

describe('hasHostSocket', () => {
  it('is true only when host.socket.connection holds a capability', () => {
    expect(hasHostSocket(hostWithSlot('socket', 'connection'))).toBe(true);
    expect(hasHostSocket(hostWithEveryCoveredSlotExcept('socket', 'connection'))).toBe(false);
    expect(hasHostSocket(createHost())).toBe(false);
  });
});

describe('hasHostSoftKeyboardInfo', () => {
  it('is true only when host.softKeyboard.info holds a capability', () => {
    expect(hasHostSoftKeyboardInfo(hostWithSlot('softKeyboard', 'info'))).toBe(true);
    expect(hasHostSoftKeyboardInfo(hostWithEveryCoveredSlotExcept('softKeyboard', 'info'))).toBe(false);
    expect(hasHostSoftKeyboardInfo(createHost())).toBe(false);
  });
});

describe('hasHostStoragePersistenceQuery', () => {
  it('is true only when host.preferences.persistenceQuery holds a capability', () => {
    expect(hasHostStoragePersistenceQuery(hostWithSlot('preferences', 'persistenceQuery'))).toBe(true);
    expect(hasHostStoragePersistenceQuery(hostWithEveryCoveredSlotExcept('preferences', 'persistenceQuery'))).toBe(
      false,
    );
    expect(hasHostStoragePersistenceQuery(createHost())).toBe(false);
  });
});

describe('hasHostTextSegmenter', () => {
  it('is true only when host.textSegment.segmenter holds a capability', () => {
    expect(hasHostTextSegmenter(hostWithSlot('textSegment', 'segmenter'))).toBe(true);
    expect(hasHostTextSegmenter(hostWithEveryCoveredSlotExcept('textSegment', 'segmenter'))).toBe(false);
    expect(hasHostTextSegmenter(createHost())).toBe(false);
  });
});

describe('hasHostTextShaper', () => {
  it('is true only when host.textShaper.shaper holds a capability', () => {
    expect(hasHostTextShaper(hostWithSlot('textShaper', 'shaper'))).toBe(true);
    expect(hasHostTextShaper(hostWithEveryCoveredSlotExcept('textShaper', 'shaper'))).toBe(false);
    expect(hasHostTextShaper(createHost())).toBe(false);
  });
});

describe('hasHostVideo', () => {
  it('is true only when host.video.playback holds a capability', () => {
    expect(hasHostVideo(hostWithSlot('video', 'playback'))).toBe(true);
    expect(hasHostVideo(hostWithEveryCoveredSlotExcept('video', 'playback'))).toBe(false);
    expect(hasHostVideo(createHost())).toBe(false);
  });
});

describe('hasHostWgpu', () => {
  it('is true only when host.wgpu.context holds a capability', () => {
    expect(hasHostWgpu(hostWithSlot('wgpu', 'context'))).toBe(true);
    expect(hasHostWgpu(hostWithEveryCoveredSlotExcept('wgpu', 'context'))).toBe(false);
    expect(hasHostWgpu(createHost())).toBe(false);
  });
});

const CAPABILITY = {};

// The (group, slot) path of every accessor in this file, written out rather than read from
// hostExplain's coverage table: the decoys are only a test of the accessors if their ground truth comes
// from somewhere the accessors do not.
const COVERED_SLOTS: readonly (readonly [string, string])[] = [
  ['audio', 'device'],
  ['audio', 'mixer'],
  ['bitmap', 'encode'],
  ['bitmap', 'readback'],
  ['clipboard', 'formats'],
  ['device', 'info'],
  ['fileSystem', 'access'],
  ['font', 'loader'],
  ['geolocation', 'position'],
  ['glyph', 'rasterizer'],
  ['haptics', 'engine'],
  ['image', 'loader'],
  ['input', 'ingress'],
  ['lifecycle', 'state'],
  ['net', 'http'],
  ['notification', 'permission'],
  ['platform', 'info'],
  ['power', 'keepAwake'],
  ['preferences', 'local'],
  ['screen', 'query'],
  ['sensors', 'query'],
  ['socket', 'connection'],
  ['softKeyboard', 'info'],
  ['preferences', 'persistenceQuery'],
  ['textSegment', 'segmenter'],
  ['textShaper', 'shaper'],
  ['video', 'playback'],
  ['wgpu', 'context'],
];

function hostWithEveryCoveredSlotExcept(group: string, slot: string): Host {
  const groups: Record<string, Record<string, unknown>> = {};
  for (const [coveredGroup, coveredSlot] of COVERED_SLOTS) {
    if (coveredGroup === group && coveredSlot === slot) continue;
    (groups[coveredGroup] ??= {})[coveredSlot] = CAPABILITY;
  }
  // The literal is a stand-in per slot rather than a real capability, so the shape is asserted. Every
  // assertion against this host reads absence, which structure cannot fake.
  return createHost(groups as Partial<EntityWithoutRuntime<Host>>);
}

function hostWithSlot(group: string, slot: string): Host {
  // A computed key cannot satisfy createHost's capability generic, so the shape is asserted rather than
  // inferred. The assertion claims only what the literal already is: one group holding one capability.
  return createHost({ [group]: { [slot]: CAPABILITY } } as Partial<EntityWithoutRuntime<Host>>);
}
