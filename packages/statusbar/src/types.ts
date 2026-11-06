import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

interface StatusBarEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export type StatusBarStyle = 'light' | 'dark' | 'default';

export type StatusBarAnimation = 'none' | 'fade' | 'slide';

export type StatusBarStyleEntryHandle = number;

export interface StatusBarInfo extends StatusBarEntity {
  color: number;
  height: number;
  overlaysContent: boolean;
  style: StatusBarStyle;
  visible: boolean;
}

export interface StatusBarStyleEntry {
  animation?: StatusBarAnimation;
  color?: number;
  overlaysContent?: boolean;
  style?: StatusBarStyle;
  visible?: boolean;
}

export interface HostStatusBarChangeCapability {
  subscribe(listener: () => void): () => void;
}

export interface HostStatusBarInfoCapability {
  getInfo(out: StatusBarInfo): void;
}

export interface HostStatusBarOverlaysCapability {
  setOverlaysContent(overlay: boolean): void;
}

export interface HostStatusBarStyleCapability {
  setStyle(style: StatusBarStyle): void;
}

export interface HostStatusBarColorCapability {
  setBackgroundColor(color: number, animated?: boolean): void;
}

export interface HostStatusBarVisibilityCapability {
  setVisible(visible: boolean, animation?: StatusBarAnimation): void;
}

export interface HostStatusBarCapabilities {
  readonly change?: HostStatusBarChangeCapability;
  readonly color?: HostStatusBarColorCapability;
  readonly info?: HostStatusBarInfoCapability;
  readonly overlays?: HostStatusBarOverlaysCapability;
  readonly style?: HostStatusBarStyleCapability;
  readonly visibility?: HostStatusBarVisibilityCapability;
}

export interface StatusBar extends StatusBarEntity {
  onChange: Signal<Readonly<StatusBarInfo>>;
}
