import type { EntityWithoutRuntime, Host } from '@flighthq/types/contract';

import { createHost } from './host';
import {
  getHostAudioDevice,
  getHostAudioMixer,
  getHostBidiClass,
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
  getHostPathBoolean,
  getHostPlatform,
  getHostPowerKeepAwake,
  getHostScreenQuery,
  getHostSensors,
  getHostSocket,
  getHostSoftKeyboardInfo,
  getHostStorage,
  getHostStoragePersistenceQuery,
  getHostTextSegmenter,
  getHostTextShaper,
  getHostVideo,
  getHostWgpu,
  hasHostAudioDevice,
  hasHostAudioMixer,
  hasHostBidiClass,
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
  hasHostPathBoolean,
  hasHostPlatform,
  hasHostPowerKeepAwake,
  hasHostScreenQuery,
  hasHostSensors,
  hasHostSocket,
  hasHostSoftKeyboardInfo,
  hasHostStorage,
  hasHostStoragePersistenceQuery,
  hasHostTextSegmenter,
  hasHostTextShaper,
  hasHostVideo,
  hasHostWgpu,
} from './hostQuery';

// Each accessor is exercised through a host built by SLOT NAME, so the spelling the test asserts is
// independent of the static property access the accessor compiles to. The decoy case fills a different
// slot in the same capability group: an accessor that reads its neighbour passes the first two cases.

describe('getHostAudioDevice', () => {
  it('returns the provider held in host.media.audioDevice', () => {
    expect(getHostAudioDevice(hostWithSlot('media', 'audioDevice'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostAudioDevice(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostAudioDevice(hostWithSlot('media', 'session'))).toBeNull();
  });
});

describe('getHostAudioMixer', () => {
  it('returns the provider held in host.media.audioMixer', () => {
    expect(getHostAudioMixer(hostWithSlot('media', 'audioMixer'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostAudioMixer(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostAudioMixer(hostWithSlot('media', 'session'))).toBeNull();
  });
});

describe('getHostBidiClass', () => {
  it('returns the provider held in host.text.bidiClass', () => {
    expect(getHostBidiClass(hostWithSlot('text', 'bidiClass'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostBidiClass(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostBidiClass(hostWithSlot('text', 'shaper'))).toBeNull();
  });
});

describe('getHostBitmapEncode', () => {
  it('returns the provider held in host.graphics.bitmapEncode', () => {
    expect(getHostBitmapEncode(hostWithSlot('graphics', 'bitmapEncode'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostBitmapEncode(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostBitmapEncode(hostWithSlot('graphics', 'renderContext'))).toBeNull();
  });
});

describe('getHostBitmapReadback', () => {
  it('returns the provider held in host.graphics.bitmapReadback', () => {
    expect(getHostBitmapReadback(hostWithSlot('graphics', 'bitmapReadback'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostBitmapReadback(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostBitmapReadback(hostWithSlot('graphics', 'renderContext'))).toBeNull();
  });
});

describe('getHostClipboardFormats', () => {
  it('returns the provider held in host.clipboard.formats', () => {
    expect(getHostClipboardFormats(hostWithSlot('clipboard', 'formats'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostClipboardFormats(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostClipboardFormats(hostWithSlot('clipboard', 'text'))).toBeNull();
  });
});

describe('getHostDevice', () => {
  it('returns the provider held in host.system.device', () => {
    expect(getHostDevice(hostWithSlot('system', 'device'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostDevice(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostDevice(hostWithSlot('system', 'permissions'))).toBeNull();
  });
});

describe('getHostFileSystem', () => {
  it('returns the provider held in host.storage.fileSystem', () => {
    expect(getHostFileSystem(hostWithSlot('storage', 'fileSystem'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostFileSystem(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostFileSystem(hostWithSlot('storage', 'change'))).toBeNull();
  });
});

describe('getHostFontLoading', () => {
  it('returns the provider held in host.text.fontLoading', () => {
    expect(getHostFontLoading(hostWithSlot('text', 'fontLoading'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostFontLoading(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostFontLoading(hostWithSlot('text', 'shaper'))).toBeNull();
  });
});

describe('getHostGeolocation', () => {
  it('returns the provider held in host.system.geolocation', () => {
    expect(getHostGeolocation(hostWithSlot('system', 'geolocation'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostGeolocation(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostGeolocation(hostWithSlot('system', 'permissions'))).toBeNull();
  });
});

describe('getHostGlyphRasterizer', () => {
  it('returns the provider held in host.text.glyphRasterizer', () => {
    expect(getHostGlyphRasterizer(hostWithSlot('text', 'glyphRasterizer'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostGlyphRasterizer(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostGlyphRasterizer(hostWithSlot('text', 'shaper'))).toBeNull();
  });
});

describe('getHostHaptics', () => {
  it('returns the provider held in host.input.haptics', () => {
    expect(getHostHaptics(hostWithSlot('input', 'haptics'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostHaptics(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostHaptics(hostWithSlot('input', 'focus'))).toBeNull();
  });
});

describe('getHostImage', () => {
  it('returns the provider held in host.graphics.image', () => {
    expect(getHostImage(hostWithSlot('graphics', 'image'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostImage(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostImage(hostWithSlot('graphics', 'renderContext'))).toBeNull();
  });
});

describe('getHostInputIngress', () => {
  it('returns the provider held in host.input.ingress', () => {
    expect(getHostInputIngress(hostWithSlot('input', 'ingress'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostInputIngress(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostInputIngress(hostWithSlot('input', 'focus'))).toBeNull();
  });
});

describe('getHostLifecycle', () => {
  it('returns the provider held in host.system.lifecycle', () => {
    expect(getHostLifecycle(hostWithSlot('system', 'lifecycle'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostLifecycle(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostLifecycle(hostWithSlot('system', 'permissions'))).toBeNull();
  });
});

describe('getHostNet', () => {
  it('returns the provider held in host.net.http', () => {
    expect(getHostNet(hostWithSlot('net', 'http'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostNet(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostNet(hostWithSlot('net', 'socket'))).toBeNull();
  });
});

describe('getHostNotificationPermission', () => {
  it('returns the provider held in host.notification.permission', () => {
    expect(getHostNotificationPermission(hostWithSlot('notification', 'permission'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostNotificationPermission(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostNotificationPermission(hostWithSlot('notification', 'delivery'))).toBeNull();
  });
});

describe('getHostPathBoolean', () => {
  it('returns the provider held in host.graphics.pathBoolean', () => {
    expect(getHostPathBoolean(hostWithSlot('graphics', 'pathBoolean'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostPathBoolean(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostPathBoolean(hostWithSlot('graphics', 'renderContext'))).toBeNull();
  });
});

describe('getHostPlatform', () => {
  it('returns the provider held in host.system.platform', () => {
    expect(getHostPlatform(hostWithSlot('system', 'platform'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostPlatform(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostPlatform(hostWithSlot('system', 'permissions'))).toBeNull();
  });
});

describe('getHostPowerKeepAwake', () => {
  it('returns the provider held in host.power.keepAwake', () => {
    expect(getHostPowerKeepAwake(hostWithSlot('power', 'keepAwake'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostPowerKeepAwake(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostPowerKeepAwake(hostWithSlot('power', 'status'))).toBeNull();
  });
});

describe('getHostScreenQuery', () => {
  it('returns the provider held in host.screen.query', () => {
    expect(getHostScreenQuery(hostWithSlot('screen', 'query'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostScreenQuery(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostScreenQuery(hostWithSlot('screen', 'details'))).toBeNull();
  });
});

describe('getHostSensors', () => {
  it('returns the provider held in host.system.sensors', () => {
    expect(getHostSensors(hostWithSlot('system', 'sensors'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostSensors(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostSensors(hostWithSlot('system', 'permissions'))).toBeNull();
  });
});

describe('getHostSocket', () => {
  it('returns the provider held in host.net.socket', () => {
    expect(getHostSocket(hostWithSlot('net', 'socket'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostSocket(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostSocket(hostWithSlot('net', 'http'))).toBeNull();
  });
});

describe('getHostSoftKeyboardInfo', () => {
  it('returns the provider held in host.input.softKeyboardInfo', () => {
    expect(getHostSoftKeyboardInfo(hostWithSlot('input', 'softKeyboardInfo'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostSoftKeyboardInfo(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostSoftKeyboardInfo(hostWithSlot('input', 'focus'))).toBeNull();
  });
});

describe('getHostStorage', () => {
  it('returns the provider held in host.storage.local', () => {
    expect(getHostStorage(hostWithSlot('storage', 'local'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostStorage(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostStorage(hostWithSlot('storage', 'change'))).toBeNull();
  });
});

describe('getHostStoragePersistenceQuery', () => {
  it('returns the provider held in host.storage.persistenceQuery', () => {
    expect(getHostStoragePersistenceQuery(hostWithSlot('storage', 'persistenceQuery'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostStoragePersistenceQuery(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostStoragePersistenceQuery(hostWithSlot('storage', 'change'))).toBeNull();
  });
});

describe('getHostTextSegmenter', () => {
  it('returns the provider held in host.text.segmenter', () => {
    expect(getHostTextSegmenter(hostWithSlot('text', 'segmenter'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostTextSegmenter(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostTextSegmenter(hostWithSlot('text', 'shaper'))).toBeNull();
  });
});

describe('getHostTextShaper', () => {
  it('returns the provider held in host.text.shaper', () => {
    expect(getHostTextShaper(hostWithSlot('text', 'shaper'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostTextShaper(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostTextShaper(hostWithSlot('text', 'segmenter'))).toBeNull();
  });
});

describe('getHostVideo', () => {
  it('returns the provider held in host.media.video', () => {
    expect(getHostVideo(hostWithSlot('media', 'video'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostVideo(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostVideo(hostWithSlot('media', 'session'))).toBeNull();
  });
});

describe('getHostWgpu', () => {
  it('returns the provider held in host.graphics.wgpuHost', () => {
    expect(getHostWgpu(hostWithSlot('graphics', 'wgpuHost'))).toBe(PROVIDER);
  });

  it('returns null when the slot is empty', () => {
    expect(getHostWgpu(createHost())).toBeNull();
  });

  it('returns null when a different slot in the same group is filled', () => {
    expect(getHostWgpu(hostWithSlot('graphics', 'renderContext'))).toBeNull();
  });
});

describe('hasHostAudioDevice', () => {
  it('is true only when host.media.audioDevice holds a provider', () => {
    expect(hasHostAudioDevice(hostWithSlot('media', 'audioDevice'))).toBe(true);
    expect(hasHostAudioDevice(hostWithSlot('media', 'session'))).toBe(false);
    expect(hasHostAudioDevice(createHost())).toBe(false);
  });
});

describe('hasHostAudioMixer', () => {
  it('is true only when host.media.audioMixer holds a provider', () => {
    expect(hasHostAudioMixer(hostWithSlot('media', 'audioMixer'))).toBe(true);
    expect(hasHostAudioMixer(hostWithSlot('media', 'session'))).toBe(false);
    expect(hasHostAudioMixer(createHost())).toBe(false);
  });
});

describe('hasHostBidiClass', () => {
  it('is true only when host.text.bidiClass holds a provider', () => {
    expect(hasHostBidiClass(hostWithSlot('text', 'bidiClass'))).toBe(true);
    expect(hasHostBidiClass(hostWithSlot('text', 'shaper'))).toBe(false);
    expect(hasHostBidiClass(createHost())).toBe(false);
  });
});

describe('hasHostBitmapEncode', () => {
  it('is true only when host.graphics.bitmapEncode holds a provider', () => {
    expect(hasHostBitmapEncode(hostWithSlot('graphics', 'bitmapEncode'))).toBe(true);
    expect(hasHostBitmapEncode(hostWithSlot('graphics', 'renderContext'))).toBe(false);
    expect(hasHostBitmapEncode(createHost())).toBe(false);
  });
});

describe('hasHostBitmapReadback', () => {
  it('is true only when host.graphics.bitmapReadback holds a provider', () => {
    expect(hasHostBitmapReadback(hostWithSlot('graphics', 'bitmapReadback'))).toBe(true);
    expect(hasHostBitmapReadback(hostWithSlot('graphics', 'renderContext'))).toBe(false);
    expect(hasHostBitmapReadback(createHost())).toBe(false);
  });
});

describe('hasHostClipboardFormats', () => {
  it('is true only when host.clipboard.formats holds a provider', () => {
    expect(hasHostClipboardFormats(hostWithSlot('clipboard', 'formats'))).toBe(true);
    expect(hasHostClipboardFormats(hostWithSlot('clipboard', 'text'))).toBe(false);
    expect(hasHostClipboardFormats(createHost())).toBe(false);
  });
});

describe('hasHostDevice', () => {
  it('is true only when host.system.device holds a provider', () => {
    expect(hasHostDevice(hostWithSlot('system', 'device'))).toBe(true);
    expect(hasHostDevice(hostWithSlot('system', 'permissions'))).toBe(false);
    expect(hasHostDevice(createHost())).toBe(false);
  });
});

describe('hasHostFileSystem', () => {
  it('is true only when host.storage.fileSystem holds a provider', () => {
    expect(hasHostFileSystem(hostWithSlot('storage', 'fileSystem'))).toBe(true);
    expect(hasHostFileSystem(hostWithSlot('storage', 'change'))).toBe(false);
    expect(hasHostFileSystem(createHost())).toBe(false);
  });
});

describe('hasHostFontLoading', () => {
  it('is true only when host.text.fontLoading holds a provider', () => {
    expect(hasHostFontLoading(hostWithSlot('text', 'fontLoading'))).toBe(true);
    expect(hasHostFontLoading(hostWithSlot('text', 'shaper'))).toBe(false);
    expect(hasHostFontLoading(createHost())).toBe(false);
  });
});

describe('hasHostGeolocation', () => {
  it('is true only when host.system.geolocation holds a provider', () => {
    expect(hasHostGeolocation(hostWithSlot('system', 'geolocation'))).toBe(true);
    expect(hasHostGeolocation(hostWithSlot('system', 'permissions'))).toBe(false);
    expect(hasHostGeolocation(createHost())).toBe(false);
  });
});

describe('hasHostGlyphRasterizer', () => {
  it('is true only when host.text.glyphRasterizer holds a provider', () => {
    expect(hasHostGlyphRasterizer(hostWithSlot('text', 'glyphRasterizer'))).toBe(true);
    expect(hasHostGlyphRasterizer(hostWithSlot('text', 'shaper'))).toBe(false);
    expect(hasHostGlyphRasterizer(createHost())).toBe(false);
  });
});

describe('hasHostHaptics', () => {
  it('is true only when host.input.haptics holds a provider', () => {
    expect(hasHostHaptics(hostWithSlot('input', 'haptics'))).toBe(true);
    expect(hasHostHaptics(hostWithSlot('input', 'focus'))).toBe(false);
    expect(hasHostHaptics(createHost())).toBe(false);
  });
});

describe('hasHostImage', () => {
  it('is true only when host.graphics.image holds a provider', () => {
    expect(hasHostImage(hostWithSlot('graphics', 'image'))).toBe(true);
    expect(hasHostImage(hostWithSlot('graphics', 'renderContext'))).toBe(false);
    expect(hasHostImage(createHost())).toBe(false);
  });
});

describe('hasHostInputIngress', () => {
  it('is true only when host.input.ingress holds a provider', () => {
    expect(hasHostInputIngress(hostWithSlot('input', 'ingress'))).toBe(true);
    expect(hasHostInputIngress(hostWithSlot('input', 'focus'))).toBe(false);
    expect(hasHostInputIngress(createHost())).toBe(false);
  });
});

describe('hasHostLifecycle', () => {
  it('is true only when host.system.lifecycle holds a provider', () => {
    expect(hasHostLifecycle(hostWithSlot('system', 'lifecycle'))).toBe(true);
    expect(hasHostLifecycle(hostWithSlot('system', 'permissions'))).toBe(false);
    expect(hasHostLifecycle(createHost())).toBe(false);
  });
});

describe('hasHostNet', () => {
  it('is true only when host.net.http holds a provider', () => {
    expect(hasHostNet(hostWithSlot('net', 'http'))).toBe(true);
    expect(hasHostNet(hostWithSlot('net', 'socket'))).toBe(false);
    expect(hasHostNet(createHost())).toBe(false);
  });
});

describe('hasHostNotificationPermission', () => {
  it('is true only when host.notification.permission holds a provider', () => {
    expect(hasHostNotificationPermission(hostWithSlot('notification', 'permission'))).toBe(true);
    expect(hasHostNotificationPermission(hostWithSlot('notification', 'delivery'))).toBe(false);
    expect(hasHostNotificationPermission(createHost())).toBe(false);
  });
});

describe('hasHostPathBoolean', () => {
  it('is true only when host.graphics.pathBoolean holds a provider', () => {
    expect(hasHostPathBoolean(hostWithSlot('graphics', 'pathBoolean'))).toBe(true);
    expect(hasHostPathBoolean(hostWithSlot('graphics', 'renderContext'))).toBe(false);
    expect(hasHostPathBoolean(createHost())).toBe(false);
  });
});

describe('hasHostPlatform', () => {
  it('is true only when host.system.platform holds a provider', () => {
    expect(hasHostPlatform(hostWithSlot('system', 'platform'))).toBe(true);
    expect(hasHostPlatform(hostWithSlot('system', 'permissions'))).toBe(false);
    expect(hasHostPlatform(createHost())).toBe(false);
  });
});

describe('hasHostPowerKeepAwake', () => {
  it('is true only when host.power.keepAwake holds a provider', () => {
    expect(hasHostPowerKeepAwake(hostWithSlot('power', 'keepAwake'))).toBe(true);
    expect(hasHostPowerKeepAwake(hostWithSlot('power', 'status'))).toBe(false);
    expect(hasHostPowerKeepAwake(createHost())).toBe(false);
  });
});

describe('hasHostScreenQuery', () => {
  it('is true only when host.screen.query holds a provider', () => {
    expect(hasHostScreenQuery(hostWithSlot('screen', 'query'))).toBe(true);
    expect(hasHostScreenQuery(hostWithSlot('screen', 'details'))).toBe(false);
    expect(hasHostScreenQuery(createHost())).toBe(false);
  });
});

describe('hasHostSensors', () => {
  it('is true only when host.system.sensors holds a provider', () => {
    expect(hasHostSensors(hostWithSlot('system', 'sensors'))).toBe(true);
    expect(hasHostSensors(hostWithSlot('system', 'permissions'))).toBe(false);
    expect(hasHostSensors(createHost())).toBe(false);
  });
});

describe('hasHostSocket', () => {
  it('is true only when host.net.socket holds a provider', () => {
    expect(hasHostSocket(hostWithSlot('net', 'socket'))).toBe(true);
    expect(hasHostSocket(hostWithSlot('net', 'http'))).toBe(false);
    expect(hasHostSocket(createHost())).toBe(false);
  });
});

describe('hasHostSoftKeyboardInfo', () => {
  it('is true only when host.input.softKeyboardInfo holds a provider', () => {
    expect(hasHostSoftKeyboardInfo(hostWithSlot('input', 'softKeyboardInfo'))).toBe(true);
    expect(hasHostSoftKeyboardInfo(hostWithSlot('input', 'focus'))).toBe(false);
    expect(hasHostSoftKeyboardInfo(createHost())).toBe(false);
  });
});

describe('hasHostStorage', () => {
  it('is true only when host.storage.local holds a provider', () => {
    expect(hasHostStorage(hostWithSlot('storage', 'local'))).toBe(true);
    expect(hasHostStorage(hostWithSlot('storage', 'change'))).toBe(false);
    expect(hasHostStorage(createHost())).toBe(false);
  });
});

describe('hasHostStoragePersistenceQuery', () => {
  it('is true only when host.storage.persistenceQuery holds a provider', () => {
    expect(hasHostStoragePersistenceQuery(hostWithSlot('storage', 'persistenceQuery'))).toBe(true);
    expect(hasHostStoragePersistenceQuery(hostWithSlot('storage', 'change'))).toBe(false);
    expect(hasHostStoragePersistenceQuery(createHost())).toBe(false);
  });
});

describe('hasHostTextSegmenter', () => {
  it('is true only when host.text.segmenter holds a provider', () => {
    expect(hasHostTextSegmenter(hostWithSlot('text', 'segmenter'))).toBe(true);
    expect(hasHostTextSegmenter(hostWithSlot('text', 'shaper'))).toBe(false);
    expect(hasHostTextSegmenter(createHost())).toBe(false);
  });
});

describe('hasHostTextShaper', () => {
  it('is true only when host.text.shaper holds a provider', () => {
    expect(hasHostTextShaper(hostWithSlot('text', 'shaper'))).toBe(true);
    expect(hasHostTextShaper(hostWithSlot('text', 'segmenter'))).toBe(false);
    expect(hasHostTextShaper(createHost())).toBe(false);
  });
});

describe('hasHostVideo', () => {
  it('is true only when host.media.video holds a provider', () => {
    expect(hasHostVideo(hostWithSlot('media', 'video'))).toBe(true);
    expect(hasHostVideo(hostWithSlot('media', 'session'))).toBe(false);
    expect(hasHostVideo(createHost())).toBe(false);
  });
});

describe('hasHostWgpu', () => {
  it('is true only when host.graphics.wgpuHost holds a provider', () => {
    expect(hasHostWgpu(hostWithSlot('graphics', 'wgpuHost'))).toBe(true);
    expect(hasHostWgpu(hostWithSlot('graphics', 'renderContext'))).toBe(false);
    expect(hasHostWgpu(createHost())).toBe(false);
  });
});

const PROVIDER = {};

function hostWithSlot(group: string, slot: string): Host {
  // A computed key cannot satisfy createHost's capability generic, so the shape is asserted rather than
  // inferred. The assertion claims only what the literal already is: one group holding one provider.
  return createHost({ [group]: { [slot]: PROVIDER } } as Partial<EntityWithoutRuntime<Host>>);
}
