import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  HostStatusBarChangeCapability,
  HostStatusBarColorCapability,
  HostStatusBarInfoCapability,
  HostStatusBarOverlaysCapability,
  HostStatusBarStyleCapability,
  HostStatusBarVisibilityCapability,
  StatusBar,
  StatusBarAnimation,
  StatusBarInfo,
  StatusBarStyle,
  StatusBarStyleEntry,
  StatusBarStyleEntryHandle,
} from '@flighthq/types/contract';

export function attachStatusBar(
  hostStatusBarChange: Readonly<HostStatusBarChangeCapability>,
  hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>,
  bar: StatusBar,
): void {
  detachStatusBar(bar);
  const changeProvider = hostStatusBarChange;
  const infoProvider = hostStatusBarInfo;
  const unsubscribe = changeProvider.subscribe(() => {
    emitSignal(bar.onChange, infoProvider.getInfo(createStatusBarInfo()));
  });
  _subscriptions.set(bar, unsubscribe);
}

export function clearStatusBarStyleStack(hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>): void {
  const state = _styleStacks.get(hostStatusBarInfo);
  if (state === undefined || state.entries.length === 0) return;
  state.entries.length = 0;
  applyTopStyleEntry(hostStatusBarInfo, state);
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

export function getStatusBarHeight(hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>): number {
  return hostStatusBarInfo.getInfo(_scratchInfo).height;
}

export function getStatusBarInfo(
  hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>,
  out: StatusBarInfo,
): StatusBarInfo {
  return hostStatusBarInfo.getInfo(out);
}

export function hasStatusBarStyleEntry(
  hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>,
  handle: StatusBarStyleEntryHandle,
): boolean {
  if (handle === INVALID_HANDLE) return false;
  return _styleStacks.get(hostStatusBarInfo)?.entries.some((entry) => entry.handle === handle) ?? false;
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

export function popStatusBarStyleEntry(
  hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>,
  handle: StatusBarStyleEntryHandle,
): void {
  if (handle === INVALID_HANDLE) return;
  const state = _styleStacks.get(hostStatusBarInfo);
  if (state === undefined) return;
  const index = state.entries.findIndex((entry) => entry.handle === handle);
  if (index === -1) return;
  state.entries.splice(index, 1);
  applyTopStyleEntry(hostStatusBarInfo, state);
}

export function pushStatusBarStyleEntry(
  hostStatusBarColor: Readonly<HostStatusBarColorCapability>,
  hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>,
  hostStatusBarOverlays: Readonly<HostStatusBarOverlaysCapability>,
  hostStatusBarStyle: Readonly<HostStatusBarStyleCapability>,
  hostStatusBarVisibility: Readonly<HostStatusBarVisibilityCapability>,
  entry: Readonly<StatusBarStyleEntry>,
): StatusBarStyleEntryHandle {
  let state = _styleStacks.get(hostStatusBarInfo);
  if (state === undefined) {
    const infoProvider = hostStatusBarInfo;
    const baseline = infoProvider.getInfo(createStatusBarInfo());
    state = {
      applied: { ...baseline },
      baseline,
      colorProvider: hostStatusBarColor,
      entries: [],
      overlaysProvider: hostStatusBarOverlays,
      styleProvider: hostStatusBarStyle,
      visibilityProvider: hostStatusBarVisibility,
    };
    _styleStacks.set(hostStatusBarInfo, state);
  }
  const handle = _nextHandle++;
  state.entries.push({ entry, handle });
  applyTopStyleEntry(hostStatusBarInfo, state);
  return handle;
}

export function setStatusBarColor(
  hostStatusBarColor: Readonly<HostStatusBarColorCapability>,
  color: number,
  animated?: boolean,
): void {
  hostStatusBarColor.setBackgroundColor(color, animated);
}

export function setStatusBarOverlaysContent(
  hostStatusBarOverlays: Readonly<HostStatusBarOverlaysCapability>,
  overlay: boolean,
): void {
  hostStatusBarOverlays.setOverlaysContent(overlay);
}

export function setStatusBarStyle(
  hostStatusBarStyle: Readonly<HostStatusBarStyleCapability>,
  style: StatusBarStyle,
): void {
  hostStatusBarStyle.setStyle(style);
}

export function setStatusBarVisible(
  hostStatusBarVisibility: Readonly<HostStatusBarVisibilityCapability>,
  visible: boolean,
  animation?: StatusBarAnimation,
): void {
  hostStatusBarVisibility.setVisible(visible, animation);
}

interface StyleStackState {
  applied: StatusBarInfo;
  baseline: StatusBarInfo;
  colorProvider: HostStatusBarColorCapability;
  entries: Array<{ entry: Readonly<StatusBarStyleEntry>; handle: StatusBarStyleEntryHandle }>;
  overlaysProvider: HostStatusBarOverlaysCapability;
  styleProvider: HostStatusBarStyleCapability;
  visibilityProvider: HostStatusBarVisibilityCapability;
}

const INVALID_HANDLE: StatusBarStyleEntryHandle = -1;
let _nextHandle: StatusBarStyleEntryHandle = 1;
const _scratchInfo: StatusBarInfo = createStatusBarInfo();
const _styleStacks = new WeakMap<HostStatusBarInfoCapability, StyleStackState>();
const _subscriptions = new WeakMap<StatusBar, () => void>();

function applyTopStyleEntry(hostStatusBarInfo: Readonly<HostStatusBarInfoCapability>, state: StyleStackState): void {
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
  if (state.entries.length === 0) _styleStacks.delete(hostStatusBarInfo);
}
