import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, Host } from '@flighthq/types/contract';

export function createHost<Capabilities extends Partial<EntityWithoutRuntime<Host>>>(
  capabilities: Readonly<Capabilities> = {} as Capabilities,
): Host & Capabilities {
  const out = allocateEntity<Host & Capabilities>();
  initializeHost(out, capabilities);
  return finishEntity(out);
}

export function initializeHost<Capabilities extends Partial<EntityWithoutRuntime<Host>>>(
  out: EntityConstruction<Host & Capabilities>,
  capabilities: Readonly<Capabilities>,
): void {
  out.accessibility = (capabilities.accessibility ?? {}) as Host['accessibility'];
  out.app = (capabilities.app ?? {}) as Host['app'];
  out.audio = (capabilities.audio ?? {}) as Host['audio'];
  out.bitmap = (capabilities.bitmap ?? {}) as Host['bitmap'];
  out.clipboard = (capabilities.clipboard ?? {}) as Host['clipboard'];
  out.connectivity = (capabilities.connectivity ?? {}) as Host['connectivity'];
  out.device = (capabilities.device ?? {}) as Host['device'];
  out.dialog = (capabilities.dialog ?? {}) as Host['dialog'];
  out.fileSystem = (capabilities.fileSystem ?? {}) as Host['fileSystem'];
  out.font = (capabilities.font ?? {}) as Host['font'];
  out.fullscreen = (capabilities.fullscreen ?? {}) as Host['fullscreen'];
  out.geolocation = (capabilities.geolocation ?? {}) as Host['geolocation'];
  out.gl = (capabilities.gl ?? {}) as Host['gl'];
  out.glyph = (capabilities.glyph ?? {}) as Host['glyph'];
  out.haptics = (capabilities.haptics ?? {}) as Host['haptics'];
  out.image = (capabilities.image ?? {}) as Host['image'];
  out.input = (capabilities.input ?? {}) as Host['input'];
  out.ipc = (capabilities.ipc ?? {}) as Host['ipc'];
  out.lifecycle = (capabilities.lifecycle ?? {}) as Host['lifecycle'];
  out.mediaSession = (capabilities.mediaSession ?? {}) as Host['mediaSession'];
  out.menu = (capabilities.menu ?? {}) as Host['menu'];
  out.midi = (capabilities.midi ?? {}) as Host['midi'];
  out.net = (capabilities.net ?? {}) as Host['net'];
  out.notification = (capabilities.notification ?? {}) as Host['notification'];
  out.permissions = (capabilities.permissions ?? {}) as Host['permissions'];
  out.platform = (capabilities.platform ?? {}) as Host['platform'];
  out.power = (capabilities.power ?? {}) as Host['power'];
  out.preferences = (capabilities.preferences ?? {}) as Host['preferences'];
  out.protocol = (capabilities.protocol ?? {}) as Host['protocol'];
  out.screen = (capabilities.screen ?? {}) as Host['screen'];
  out.sensors = (capabilities.sensors ?? {}) as Host['sensors'];
  out.share = (capabilities.share ?? {}) as Host['share'];
  out.shell = (capabilities.shell ?? {}) as Host['shell'];
  out.shortcut = (capabilities.shortcut ?? {}) as Host['shortcut'];
  out.softKeyboard = (capabilities.softKeyboard ?? {}) as Host['softKeyboard'];
  out.statusBar = (capabilities.statusBar ?? {}) as Host['statusBar'];
  out.surface = (capabilities.surface ?? {}) as Host['surface'];
  out.textSegment = (capabilities.textSegment ?? {}) as Host['textSegment'];
  out.textShaper = (capabilities.textShaper ?? {}) as Host['textShaper'];
  out.tray = (capabilities.tray ?? {}) as Host['tray'];
  out.updater = (capabilities.updater ?? {}) as Host['updater'];
  out.video = (capabilities.video ?? {}) as Host['video'];
  out.wgpu = (capabilities.wgpu ?? {}) as Host['wgpu'];
  out.window = (capabilities.window ?? {}) as Host['window'];
}
