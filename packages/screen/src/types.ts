import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

interface ScreenEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export type ScreenColorSpace = 'display-p3' | 'rec2020' | 'srgb';

export type ScreenOrientation = 'Landscape' | 'LandscapeFlipped' | 'Portrait' | 'PortraitFlipped';

export interface ScreenInfo extends ScreenEntity {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  workWidth: number;
  workHeight: number;
  scaleFactor: number;
  isPrimary: boolean;
  rotation: number;
  orientation: ScreenOrientation;
  refreshRate: number;
  colorDepth: number;
  pixelDepth: number;
  physicalWidth: number;
  physicalHeight: number;
  isHdr: boolean;
  colorSpace: ScreenColorSpace;
  maxLuminance: number;
  depthPerComponent: number;
  dpi: number;
  label: string;
  internal: boolean;
  touchSupport: string;
  monochrome: boolean;
}

export type ScreenPermissionState = 'denied' | 'granted' | 'prompt';

export interface HostScreenQueryCapability {
  destroy?(): void;
  getScreens(out: ScreenInfo[]): void;
  getPrimaryScreen(out: ScreenInfo): void;
  getCursorPosition(out: { x: number; y: number }): void;
}

export interface HostScreenChangeCapability {
  subscribe(listener: (event: Readonly<ScreenChangeEvent>) => void): () => void;
}

export interface HostScreenDetailsCapability {
  queryPermission(): Promise<ScreenPermissionState>;
  request(): Promise<boolean>;
}

export interface HostScreenPermissionChangeCapability {
  subscribe(listener: (state: ScreenPermissionState) => void): () => void;
}

export interface HostScreenCapabilities {
  readonly change?: HostScreenChangeCapability;
  readonly details?: HostScreenDetailsCapability;
  readonly permissionChange?: HostScreenPermissionChangeCapability;
  readonly query?: HostScreenQueryCapability;
}

export type ScreenChangeKind = 'ScreenAdded' | 'ScreenMetricsChanged' | 'ScreenRemoved';

export interface ScreenChangedMetrics {
  bounds: boolean;
  workArea: boolean;
  scaleFactor: boolean;
  orientation: boolean;
}

export interface ScreenChangeEvent {
  kind: ScreenChangeKind;
  screen: ScreenInfo;
  changedMetrics: ScreenChangedMetrics | null;
}

export interface ScreenMode extends ScreenEntity {
  width: number;
  height: number;
  refreshRate: number;
  colorDepth: number;
  pixelFormat: string;
}

export interface ScreenSignals extends ScreenEntity {
  onScreenAdded: Signal<Readonly<ScreenInfo>>;
  onScreenMetricsChanged: Signal<Readonly<ScreenChangeEvent>>;
  onScreenRemoved: Signal<Readonly<ScreenInfo>>;
}

export interface ScreenPermissionChange extends ScreenEntity {
  onChange: Signal<ScreenPermissionState>;
}
