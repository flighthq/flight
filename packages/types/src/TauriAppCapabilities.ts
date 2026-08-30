import type { Entity } from './Entity';
import type { HostAppCapabilities } from './Host';

export type TauriAppCapabilities = Entity &
  Required<Pick<HostAppCapabilities, 'hide' | 'locale' | 'name' | 'quit' | 'relaunch' | 'show' | 'version'>>;
