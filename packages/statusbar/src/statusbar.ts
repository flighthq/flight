import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  HasUiStatusBarChange,
  HasUiStatusBarColor,
  HasUiStatusBarInfo,
  HasUiStatusBarOverlays,
  HasUiStatusBarStyle,
  HasUiStatusBarStyleStack,
  HasUiStatusBarVisibility,
  StatusBar,
  StatusBarAnimation,
  StatusBarColorBackend,
  StatusBarInfo,
  StatusBarOverlaysBackend,
  StatusBarStyle,
  StatusBarStyleBackend,
  StatusBarStyleEntry,
  StatusBarStyleEntryHandle,
  StatusBarVisibilityBackend,
} from '@flighthq/types/contract';

export function attachStatusBar(host: HasUiStatusBarChange & HasUiStatusBarInfo, bar: StatusBar): void {
  detachStatusBar(bar);
  const changeProvider = host.ui.statusBarChange;
  const infoProvider = host.ui.statusBarInfo;
  const unsubscribe = changeProvider.subscribe(() => {
    emitSignal(bar.onChange, infoProvider.getInfo(createStatusBarInfo()));
  });
  _subscriptions.set(bar, unsubscribe);
}

export function clearStatusBarStyleStack(host: HasUiStatusBarStyleStack): void {
  const state = _styleStacks.get(host);
  if (state === undefined || state.entries.length === 0) return;
  state.entries.length = 0;
  applyTopStyleEntry(host, state);
}

export function createStatusBar(): StatusBar {
  const out = allocateEntity<StatusBar>();
  initializeStatusBar(out);
  return finishEntity(out);
}

export function createStatusBarInfo(): StatusBarInfo {
  const out = allocateEntity<StatusBarInfo>();
  initializeStatusBarInfo(out);
  return finishEntity(out);
}

export function detachStatusBar(bar: StatusBar): void {
  const unsubscribe = _subscriptions.get(bar);
  if (unsubscribe === undefined) return;
  unsubscribe();
  _subscriptions.delete(bar);
}

export function disposeStatusBar(bar: StatusBar): void {
  detachStatusBar(bar);
}

export function getStatusBarHeight(host: HasUiStatusBarInfo): number {
  return host.ui.statusBarInfo.getInfo(_scratchInfo).height;
}

export function getStatusBarInfo(host: HasUiStatusBarInfo, out: StatusBarInfo): StatusBarInfo {
  return host.ui.statusBarInfo.getInfo(out);
}

export function hasStatusBarStyleEntry(host: HasUiStatusBarStyleStack, handle: StatusBarStyleEntryHandle): boolean {
  if (handle === INVALID_HANDLE) return false;
  return _styleStacks.get(host)?.entries.some((entry) => entry.handle === handle) ?? false;
}

export function initializeStatusBar(out: EntityConstruction<StatusBar>): void {
  out.onChange = createSignal();
}

export function initializeStatusBarInfo(out: EntityConstruction<StatusBarInfo>): void {
  out.color = 0;
  out.height = -1;
  out.overlaysContent = false;
  out.style = 'default';
  out.visible = true;
}

export function packedRgbaToHexColor(color: number): string {
  const rgb = (color >>> 8) & 0xffffff;
  return '#' + rgb.toString(16).padStart(6, '0');
}

export function popStatusBarStyleEntry(host: HasUiStatusBarStyleStack, handle: StatusBarStyleEntryHandle): void {
  if (handle === INVALID_HANDLE) return;
  const state = _styleStacks.get(host);
  if (state === undefined) return;
  const index = state.entries.findIndex((entry) => entry.handle === handle);
  if (index === -1) return;
  state.entries.splice(index, 1);
  applyTopStyleEntry(host, state);
}

export function pushStatusBarStyleEntry(
  host: HasUiStatusBarStyleStack,
  entry: Readonly<StatusBarStyleEntry>,
): StatusBarStyleEntryHandle {
  let state = _styleStacks.get(host);
  if (state === undefined) {
    const infoProvider = host.ui.statusBarInfo;
    const baseline = infoProvider.getInfo(createStatusBarInfo());
    state = {
      applied: { ...baseline },
      baseline,
      colorProvider: host.ui.statusBarColor,
      entries: [],
      overlaysProvider: host.ui.statusBarOverlays,
      styleProvider: host.ui.statusBarStyle,
      visibilityProvider: host.ui.statusBarVisibility,
    };
    _styleStacks.set(host, state);
  }
  const handle = _nextHandle++;
  state.entries.push({ entry, handle });
  applyTopStyleEntry(host, state);
  return handle;
}

export function setStatusBarColor(host: HasUiStatusBarColor, color: number, animated?: boolean): void {
  host.ui.statusBarColor.setBackgroundColor(color, animated);
}

export function setStatusBarOverlaysContent(host: HasUiStatusBarOverlays, overlay: boolean): void {
  host.ui.statusBarOverlays.setOverlaysContent(overlay);
}

export function setStatusBarStyle(host: HasUiStatusBarStyle, style: StatusBarStyle): void {
  host.ui.statusBarStyle.setStyle(style);
}

export function setStatusBarVisible(
  host: HasUiStatusBarVisibility,
  visible: boolean,
  animation?: StatusBarAnimation,
): void {
  host.ui.statusBarVisibility.setVisible(visible, animation);
}

interface StyleStackState {
  applied: StatusBarInfo;
  baseline: StatusBarInfo;
  colorProvider: StatusBarColorBackend;
  entries: Array<{ entry: Readonly<StatusBarStyleEntry>; handle: StatusBarStyleEntryHandle }>;
  overlaysProvider: StatusBarOverlaysBackend;
  styleProvider: StatusBarStyleBackend;
  visibilityProvider: StatusBarVisibilityBackend;
}

const INVALID_HANDLE: StatusBarStyleEntryHandle = -1;
let _nextHandle: StatusBarStyleEntryHandle = 1;
const _scratchInfo: StatusBarInfo = createStatusBarInfo();
const _styleStacks = new WeakMap<HasUiStatusBarStyleStack, StyleStackState>();
const _subscriptions = new WeakMap<StatusBar, () => void>();

function applyTopStyleEntry(host: HasUiStatusBarStyleStack, state: StyleStackState): void {
  let animation: StatusBarAnimation | undefined;
  let color: number | undefined;
  let overlaysContent: boolean | undefined;
  let style: StatusBarStyle | undefined;
  let visible: boolean | undefined;
  for (let index = state.entries.length - 1; index >= 0; index--) {
    const entry = state.entries[index].entry;
    if (animation === undefined && entry.animation !== undefined) animation = entry.animation;
    if (color === undefined && entry.color !== undefined) color = entry.color;
    if (overlaysContent === undefined && entry.overlaysContent !== undefined) {
      overlaysContent = entry.overlaysContent;
    }
    if (style === undefined && entry.style !== undefined) style = entry.style;
    if (visible === undefined && entry.visible !== undefined) visible = entry.visible;
  }

  color ??= state.baseline.color;
  overlaysContent ??= state.baseline.overlaysContent;
  style ??= state.baseline.style;
  visible ??= state.baseline.visible;

  if (color !== state.applied.color) state.colorProvider.setBackgroundColor(color, false);
  if (overlaysContent !== state.applied.overlaysContent) state.overlaysProvider.setOverlaysContent(overlaysContent);
  if (style !== state.applied.style) state.styleProvider.setStyle(style);
  if (visible !== state.applied.visible) state.visibilityProvider.setVisible(visible, animation ?? 'none');

  state.applied.color = color;
  state.applied.overlaysContent = overlaysContent;
  state.applied.style = style;
  state.applied.visible = visible;
  if (state.entries.length === 0) _styleStacks.delete(host);
}
