import type { Entity } from './Entity';
import type { MenuItemTemplate } from './Menu';
import type { RectangleLike } from './Rectangle';
import type { Signal } from './Signal';
import type { Vector2Like } from './Vector2';

// Host construction receives this target explicitly. A native host never reads process.platform or
// probes the runtime to decide which Tray slots to claim.
export type DesktopOsProfile = 'linux' | 'macos' | 'windows';

// A path or data URI understood by the native host. Image decoding remains the provider's job; Tray
// deliberately does not acquire an @flighthq/image dependency.
export type TrayIconSource = string;

export interface TrayIconOptions {
  icon?: TrayIconSource;
  iconTemplate?: boolean;
  signal?: AbortSignal;
  title?: string;
  tooltip?: string;
}

export interface TrayBalloonOptions {
  icon?: TrayIconSource;
  iconType?: 'none' | 'info' | 'warning' | 'error';
  largeIcon?: boolean;
  noSound?: boolean;
  respectQuietTime?: boolean;
  text: string;
  title: string;
}

// Stable public identity. Provider-local numeric/string keys stay inside the native adapter's map.
export interface TrayIcon extends Entity {}

// Capability markers are type-only evidence captured at acquisition. They expose no public mutable
// fields; the concrete provider facet lives in the Entity runtime and remains pinned for its lifetime.
declare const TrayImageFacetKey: unique symbol;
declare const TrayTitleFacetKey: unique symbol;
declare const TrayTooltipFacetKey: unique symbol;
declare const TrayMenuFacetKey: unique symbol;
declare const TrayTemplateImageFacetKey: unique symbol;
declare const TrayBoundsFacetKey: unique symbol;
declare const TrayPopupMenuFacetKey: unique symbol;
declare const TrayDoubleClickPolicyFacetKey: unique symbol;
declare const TrayPressedImageFacetKey: unique symbol;
declare const TrayBalloonFacetKey: unique symbol;
declare const TrayInteractionEventsFacetKey: unique symbol;
declare const TrayMenuSelectionEventsFacetKey: unique symbol;
declare const TrayBalloonEventsFacetKey: unique symbol;
declare const TrayDropEventsFacetKey: unique symbol;

export interface TrayWithImage extends TrayIcon {
  readonly [TrayImageFacetKey]: true;
}
export interface TrayWithTitle extends TrayIcon {
  readonly [TrayTitleFacetKey]: true;
}
export interface TrayWithTooltip extends TrayIcon {
  readonly [TrayTooltipFacetKey]: true;
}
export interface TrayWithMenu extends TrayIcon {
  readonly [TrayMenuFacetKey]: true;
}
export interface TrayWithTemplateImage extends TrayIcon {
  readonly [TrayTemplateImageFacetKey]: true;
}
export interface TrayWithBounds extends TrayIcon {
  readonly [TrayBoundsFacetKey]: true;
}
export interface TrayWithPopupMenu extends TrayIcon {
  readonly [TrayPopupMenuFacetKey]: true;
}
export interface TrayWithDoubleClickPolicy extends TrayIcon {
  readonly [TrayDoubleClickPolicyFacetKey]: true;
}
export interface TrayWithPressedImage extends TrayIcon {
  readonly [TrayPressedImageFacetKey]: true;
}
export interface TrayWithBalloon extends TrayIcon {
  readonly [TrayBalloonFacetKey]: true;
}
export interface TrayWithInteractionEvents extends TrayIcon {
  readonly [TrayInteractionEventsFacetKey]: true;
}
export interface TrayWithMenuSelectionEvents extends TrayIcon {
  readonly [TrayMenuSelectionEventsFacetKey]: true;
}
export interface TrayWithBalloonEvents extends TrayIcon {
  readonly [TrayBalloonEventsFacetKey]: true;
}
export interface TrayWithDropEvents extends TrayIcon {
  readonly [TrayDropEventsFacetKey]: true;
}

type TrayFacetFor<HostType, Slot extends string, Facet> = HostType extends {
  readonly tray: { readonly [Key in Slot]: unknown };
}
  ? Facet
  : unknown;

// The returned Entity carries exactly the slots present on the Host type supplied to creation.
export type TrayIconForHost<HostType> = TrayIcon &
  TrayFacetFor<HostType, 'image', TrayWithImage> &
  TrayFacetFor<HostType, 'title', TrayWithTitle> &
  TrayFacetFor<HostType, 'tooltip', TrayWithTooltip> &
  TrayFacetFor<HostType, 'menu', TrayWithMenu> &
  TrayFacetFor<HostType, 'templateImage', TrayWithTemplateImage> &
  TrayFacetFor<HostType, 'bounds', TrayWithBounds> &
  TrayFacetFor<HostType, 'popupMenu', TrayWithPopupMenu> &
  TrayFacetFor<HostType, 'doubleClickPolicy', TrayWithDoubleClickPolicy> &
  TrayFacetFor<HostType, 'pressedImage', TrayWithPressedImage> &
  TrayFacetFor<HostType, 'balloon', TrayWithBalloon> &
  TrayFacetFor<HostType, 'interactionEvents', TrayWithInteractionEvents> &
  TrayFacetFor<HostType, 'menuSelectionEvents', TrayWithMenuSelectionEvents> &
  TrayFacetFor<HostType, 'balloonEvents', TrayWithBalloonEvents> &
  TrayFacetFor<HostType, 'dropEvents', TrayWithDropEvents>;

export interface TrayInteractionEvent {
  altKey: boolean;
  bounds: Readonly<RectangleLike> | null;
  ctrlKey: boolean;
  metaKey: boolean;
  position: Readonly<Vector2Like> | null;
  shiftKey: boolean;
  type: 'click' | 'doubleClick' | 'rightClick';
}

export interface TrayMenuSelectionEvent {
  id: string;
}

export interface TrayBalloonEvent {
  type: 'click' | 'close' | 'show';
}

export type TrayDropEvent =
  | { readonly files: readonly string[]; readonly type: 'files' }
  | { readonly text: string; readonly type: 'text' };

export type TrayCreateProviderResult =
  | { readonly outcome: 'created' }
  | { readonly outcome: 'cancelled' }
  | { readonly error?: unknown; readonly outcome: 'runtime-api-unavailable' }
  | { readonly error?: unknown; readonly outcome: 'invalid-icon' }
  | { readonly error?: unknown; readonly outcome: 'tray-create-failed' };

export type TrayCreateResult<Tray extends TrayIcon = TrayIcon> =
  | { readonly outcome: 'created'; readonly tray: Tray }
  | Exclude<TrayCreateProviderResult, { readonly outcome: 'created' }>;

export interface TrayDestroyFailure {
  readonly error?: unknown;
  readonly step: 'native-resource';
}

export type TrayDestroyProviderResult =
  | { readonly outcome: 'destroyed' }
  | { readonly failures: readonly TrayDestroyFailure[]; readonly outcome: 'tray-destroy-failed' };

export type TrayDestroyResult = TrayDestroyProviderResult | { readonly outcome: 'already-destroyed' };

export type TrayImageUpdateResult =
  | { readonly outcome: 'updated' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'invalid-icon' }
  | { readonly error?: unknown; readonly outcome: 'image-update-failed' };

export type TrayTitleUpdateResult =
  | { readonly outcome: 'updated' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'title-update-failed' };

export type TrayTooltipUpdateResult =
  | { readonly outcome: 'updated' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'tooltip-update-failed' };

export type TrayTemplateImageUpdateResult =
  | { readonly outcome: 'updated' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'template-image-update-failed' };

export type TrayPressedImageUpdateResult =
  | { readonly outcome: 'updated' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'invalid-icon' }
  | { readonly error?: unknown; readonly outcome: 'pressed-image-update-failed' };

export type TrayDoubleClickPolicyUpdateResult =
  | { readonly outcome: 'updated' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'double-click-policy-update-failed' };

export type TrayMenuUpdateResult =
  | { readonly outcome: 'updated' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'menu-build-failed' }
  | { readonly error?: unknown; readonly outcome: 'menu-install-failed' };

export type TrayTitleReadResult =
  | { readonly outcome: 'available'; readonly title: string }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'title-read-failed' };

export type TrayTooltipReadResult =
  | { readonly outcome: 'available'; readonly tooltip: string }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'tooltip-read-failed' };

export type TrayBoundsResult =
  | { readonly bounds: Readonly<RectangleLike>; readonly outcome: 'available' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'bounds-read-failed' };

export type TrayPopupMenuResult =
  | { readonly outcome: 'shown' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly outcome: 'menu-not-set' }
  | { readonly error?: unknown; readonly outcome: 'popup-failed' };

export type TrayBalloonDisplayResult =
  | { readonly outcome: 'displayed' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'balloon-display-failed' };

export type TrayBalloonRemoveResult =
  | { readonly outcome: 'removed' }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly outcome: 'balloon-not-active' }
  | { readonly error?: unknown; readonly outcome: 'balloon-remove-failed' };

export type TrayReleaseResult =
  | { readonly outcome: 'released' }
  | { readonly outcome: 'already-released' }
  | { readonly error?: unknown; readonly outcome: 'release-failed' };

export interface TrayEventRelease {
  release(): Promise<TrayReleaseResult>;
}

export type TrayEventAttachResult =
  | { readonly outcome: 'attached'; readonly release: TrayEventRelease }
  | { readonly outcome: 'tray-destroyed' }
  | { readonly error?: unknown; readonly outcome: 'subscription-failed' };

export type TrayAnimationStartResult =
  | { readonly outcome: 'started'; readonly release: TrayEventRelease }
  | { readonly outcome: 'empty' }
  | Exclude<TrayImageUpdateResult, { readonly outcome: 'updated' }>;

export type TrayAnimationStopResult = { readonly outcome: 'stopped' } | { readonly outcome: 'already-stopped' };

// Provider contracts. Each shape is independently claimable by Host construction; an unsupported
// operation has no slot and therefore no callable method or runtime `unsupported` outcome.
export interface TrayLifecycleBackend extends Entity {
  create(tray: TrayIcon, options: Readonly<TrayIconOptions>): Promise<TrayCreateProviderResult>;
  destroy(tray: TrayIcon): Promise<TrayDestroyProviderResult>;
  isDestroyed(tray: TrayIcon): boolean;
  list(): readonly TrayIcon[];
}

export interface TrayImageBackend extends Entity {
  set(tray: TrayIcon, icon: TrayIconSource): Promise<TrayImageUpdateResult>;
}

export interface TrayTitleBackend extends Entity {
  get(tray: TrayIcon): Promise<TrayTitleReadResult>;
  set(tray: TrayIcon, title: string): Promise<TrayTitleUpdateResult>;
}

export interface TrayTooltipBackend extends Entity {
  get(tray: TrayIcon): Promise<TrayTooltipReadResult>;
  set(tray: TrayIcon, tooltip: string): Promise<TrayTooltipUpdateResult>;
}

export interface TrayMenuBackend extends Entity {
  set(tray: TrayIcon, items: readonly MenuItemTemplate[]): Promise<TrayMenuUpdateResult>;
}

export interface TrayTemplateImageBackend extends Entity {
  set(tray: TrayIcon, isTemplate: boolean): Promise<TrayTemplateImageUpdateResult>;
}

export interface TrayBoundsBackend extends Entity {
  get(tray: TrayIcon): Promise<TrayBoundsResult>;
}

export interface TrayPopupMenuBackend extends Entity {
  popup(tray: TrayIcon, position?: Readonly<Vector2Like>): Promise<TrayPopupMenuResult>;
}

export interface TrayDoubleClickPolicyBackend extends Entity {
  setIgnore(tray: TrayIcon, ignore: boolean): Promise<TrayDoubleClickPolicyUpdateResult>;
}

export interface TrayPressedImageBackend extends Entity {
  set(tray: TrayIcon, icon: TrayIconSource): Promise<TrayPressedImageUpdateResult>;
}

export interface TrayBalloonBackend extends Entity {
  display(tray: TrayIcon, options: Readonly<TrayBalloonOptions>): Promise<TrayBalloonDisplayResult>;
  remove(tray: TrayIcon): Promise<TrayBalloonRemoveResult>;
}

export interface TrayInteractionEventsBackend extends Entity {
  getSignal(tray: TrayIcon): Signal<(event: Readonly<TrayInteractionEvent>) => void> | null;
}

export interface TrayMenuSelectionEventsBackend extends Entity {
  getSignal(tray: TrayIcon): Signal<(event: Readonly<TrayMenuSelectionEvent>) => void> | null;
}

export interface TrayBalloonEventsBackend extends Entity {
  getSignal(tray: TrayIcon): Signal<(event: Readonly<TrayBalloonEvent>) => void> | null;
}

export interface TrayDropEventsBackend extends Entity {
  getSignal(tray: TrayIcon): Signal<(event: Readonly<TrayDropEvent>) => void> | null;
}
