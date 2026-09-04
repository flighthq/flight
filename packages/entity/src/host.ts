import type { EntityConstruction, EntityWithoutRuntime, Host } from '@flighthq/types/contract';

import { allocateEntity, finishEntity } from './entity';

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
  out.clipboard = (capabilities.clipboard ?? {}) as Host['clipboard'];
  out.connectivity = (capabilities.connectivity ?? {}) as Host['connectivity'];
  out.dialog = (capabilities.dialog ?? {}) as Host['dialog'];
  out.graphics = (capabilities.graphics ?? {}) as Host['graphics'];
  out.input = (capabilities.input ?? {}) as Host['input'];
  out.ipc = (capabilities.ipc ?? {}) as Host['ipc'];
  out.media = (capabilities.media ?? {}) as Host['media'];
  out.menu = (capabilities.menu ?? {}) as Host['menu'];
  out.midi = (capabilities.midi ?? {}) as Host['midi'];
  out.net = (capabilities.net ?? {}) as Host['net'];
  out.notification = (capabilities.notification ?? {}) as Host['notification'];
  out.power = (capabilities.power ?? {}) as Host['power'];
  out.protocol = (capabilities.protocol ?? {}) as Host['protocol'];
  out.screen = (capabilities.screen ?? {}) as Host['screen'];
  out.share = (capabilities.share ?? {}) as Host['share'];
  out.shell = (capabilities.shell ?? {}) as Host['shell'];
  out.shortcut = (capabilities.shortcut ?? {}) as Host['shortcut'];
  out.storage = (capabilities.storage ?? {}) as Host['storage'];
  out.system = (capabilities.system ?? {}) as Host['system'];
  out.text = (capabilities.text ?? {}) as Host['text'];
  out.tray = (capabilities.tray ?? {}) as Host['tray'];
  out.ui = (capabilities.ui ?? {}) as Host['ui'];
  out.updater = (capabilities.updater ?? {}) as Host['updater'];
  out.window = (capabilities.window ?? {}) as Host['window'];
}
