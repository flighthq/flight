import { createEntity, stripEntityRuntime } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  HasScreenChange,
  HasScreenDetails,
  HasScreenPermissionChange,
  HasScreenQuery,
  RectangleLike,
  ScreenInfo,
  ScreenMode,
  ScreenPermissionChange,
  ScreenPermissionState,
  ScreenSignals,
  Vector2Like,
} from '@flighthq/types/contract';

export function attachScreenPermissionChange(
  host: HasScreenPermissionChange,
  permissionChange: ScreenPermissionChange,
): void {
  detachScreenPermissionChange(permissionChange);
  const unsubscribe = host.screen.permissionChange.subscribe((state) => emitSignal(permissionChange.onChange, state));
  _permissionSubscriptions.set(permissionChange, unsubscribe);
}

export function attachScreenSignals(host: HasScreenChange, signals: ScreenSignals): void {
  detachScreenSignals(signals);
  const unsubscribe = host.screen.change.subscribe((event) => {
    if (event.kind === 'ScreenAdded') emitSignal(signals.onScreenAdded, event.screen);
    else if (event.kind === 'ScreenRemoved') emitSignal(signals.onScreenRemoved, event.screen);
    else emitSignal(signals.onScreenMetricsChanged, event);
  });
  _signalSubscriptions.set(signals, unsubscribe);
}

export function createScreenInfo(): ScreenInfo {
  return createEntity({
    id: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    workWidth: 0,
    workHeight: 0,
    scaleFactor: 1,
    isPrimary: false,
    rotation: -1,
    orientation: 'Landscape',
    refreshRate: -1,
    colorDepth: -1,
    pixelDepth: -1,
    physicalWidth: -1,
    physicalHeight: -1,
    isHdr: false,
    colorSpace: 'srgb',
    maxLuminance: -1,
    depthPerComponent: -1,
    dpi: -1,
    label: '',
    internal: false,
    touchSupport: 'unknown',
    monochrome: false,
  });
}

export function createScreenMode(): ScreenMode {
  return createEntity({ width: 0, height: 0, refreshRate: -1, colorDepth: -1, pixelFormat: '' });
}

export function createScreenPermissionChange(): ScreenPermissionChange {
  return createEntity({ onChange: createSignal() });
}

export function createScreenSignals(): ScreenSignals {
  return createEntity({
    onScreenAdded: createSignal(),
    onScreenMetricsChanged: createSignal(),
    onScreenRemoved: createSignal(),
  });
}

export function detachScreenPermissionChange(permissionChange: ScreenPermissionChange): void {
  _permissionSubscriptions.get(permissionChange)?.();
  _permissionSubscriptions.delete(permissionChange);
}

export function detachScreenSignals(signals: ScreenSignals): void {
  _signalSubscriptions.get(signals)?.();
  _signalSubscriptions.delete(signals);
}

export function dipToScreenPoint(
  screen: Readonly<ScreenInfo>,
  point: Readonly<Vector2Like>,
  out: { x: number; y: number },
): { x: number; y: number } {
  out.x = (point.x - screen.x) * screen.scaleFactor;
  out.y = (point.y - screen.y) * screen.scaleFactor;
  return out;
}

export function dipToScreenRect(
  screen: Readonly<ScreenInfo>,
  rect: Readonly<RectangleLike>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  out.x = (rect.x - screen.x) * screen.scaleFactor;
  out.y = (rect.y - screen.y) * screen.scaleFactor;
  out.width = rect.width * screen.scaleFactor;
  out.height = rect.height * screen.scaleFactor;
  return out;
}

export function disposeScreenPermissionChange(permissionChange: ScreenPermissionChange): void {
  detachScreenPermissionChange(permissionChange);
  clearSignal(permissionChange.onChange);
}

export function disposeScreenSignals(signals: ScreenSignals): void {
  detachScreenSignals(signals);
  clearSignal(signals.onScreenAdded);
  clearSignal(signals.onScreenMetricsChanged);
  clearSignal(signals.onScreenRemoved);
}

export function getPrimaryScreen(host: HasScreenQuery, out: ScreenInfo): ScreenInfo {
  return host.screen.query.getPrimaryScreen(out);
}

export function getScreenBounds(
  screen: Readonly<ScreenInfo>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  out.x = screen.x;
  out.y = screen.y;
  out.width = screen.width;
  out.height = screen.height;
  return out;
}

export function getScreenById(host: HasScreenQuery, id: number, out: ScreenInfo): ScreenInfo | null {
  const screens: ScreenInfo[] = [];
  getScreens(host, screens);
  const found = screens.find((screen) => screen.id === id);
  if (found === undefined) return null;
  copyScreenInfo(found, out);
  return out;
}

export function getScreenContainingRect(
  host: HasScreenQuery,
  rect: Readonly<RectangleLike>,
  out: ScreenInfo,
): ScreenInfo {
  const screens: ScreenInfo[] = [];
  getScreens(host, screens);
  if (screens.length === 0) return fillDefaultScreenInfo(out);
  let best = screens[0];
  let bestOverlap = -1;
  for (const screen of screens) {
    const overlapX = Math.max(0, Math.min(rect.x + rect.width, screen.x + screen.width) - Math.max(rect.x, screen.x));
    const overlapY = Math.max(0, Math.min(rect.y + rect.height, screen.y + screen.height) - Math.max(rect.y, screen.y));
    const overlap = overlapX * overlapY;
    if (overlap > bestOverlap) {
      best = screen;
      bestOverlap = overlap;
    }
  }
  if (bestOverlap <= 0) return getScreenNearestPoint(host, rectCenter(rect), out);
  copyScreenInfo(best, out);
  return out;
}

export function getScreenCurrentMode(screen: Readonly<ScreenInfo>, out: ScreenMode): ScreenMode {
  out.width = screen.width;
  out.height = screen.height;
  out.refreshRate = screen.refreshRate;
  out.colorDepth = screen.colorDepth;
  out.pixelFormat = '';
  return out;
}

export function getScreenCursorPosition(host: HasScreenQuery, out: { x: number; y: number }): { x: number; y: number } {
  return host.screen.query.getCursorPosition(out);
}

export function getScreenCursorScreen(host: HasScreenQuery, out: ScreenInfo): ScreenInfo {
  getScreenCursorPosition(host, _scratchPoint);
  return getScreenNearestPoint(host, _scratchPoint, out);
}

export function getScreenDetailPermission(host: HasScreenDetails): Promise<ScreenPermissionState> {
  return host.screen.details.queryPermission();
}

export function getScreenNearestPoint(host: HasScreenQuery, point: Readonly<Vector2Like>, out: ScreenInfo): ScreenInfo {
  const screens: ScreenInfo[] = [];
  getScreens(host, screens);
  if (screens.length === 0) return fillDefaultScreenInfo(out);
  for (const screen of screens) {
    if (
      point.x >= screen.x &&
      point.x < screen.x + screen.width &&
      point.y >= screen.y &&
      point.y < screen.y + screen.height
    ) {
      copyScreenInfo(screen, out);
      return out;
    }
  }
  let best = screens[0];
  let bestDistance = Infinity;
  for (const screen of screens) {
    const dx = point.x - (screen.x + screen.width / 2);
    const dy = point.y - (screen.y + screen.height / 2);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = screen;
      bestDistance = distance;
    }
  }
  copyScreenInfo(best, out);
  return out;
}

export function getScreenNearestRect(host: HasScreenQuery, rect: Readonly<RectangleLike>, out: ScreenInfo): ScreenInfo {
  const screens: ScreenInfo[] = [];
  getScreens(host, screens);
  const containing = screens.find(
    (screen) =>
      rect.x >= screen.x &&
      rect.y >= screen.y &&
      rect.x + rect.width <= screen.x + screen.width &&
      rect.y + rect.height <= screen.y + screen.height,
  );
  if (containing !== undefined) {
    copyScreenInfo(containing, out);
    return out;
  }
  return getScreenNearestPoint(host, rectCenter(rect), out);
}

export function getScreens(host: HasScreenQuery, out: ScreenInfo[]): ScreenInfo[] {
  return host.screen.query.getScreens(out);
}

export function getScreenWorkArea(
  screen: Readonly<ScreenInfo>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  out.x = screen.x;
  out.y = screen.y;
  out.width = screen.workWidth;
  out.height = screen.workHeight;
  return out;
}

export function requestScreenDetails(host: HasScreenDetails): Promise<boolean> {
  return host.screen.details.request();
}

export function screenToDipPoint(
  screen: Readonly<ScreenInfo>,
  point: Readonly<Vector2Like>,
  out: { x: number; y: number },
): { x: number; y: number } {
  out.x = point.x / screen.scaleFactor + screen.x;
  out.y = point.y / screen.scaleFactor + screen.y;
  return out;
}

export function screenToDipRect(
  screen: Readonly<ScreenInfo>,
  rect: Readonly<RectangleLike>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  out.x = rect.x / screen.scaleFactor + screen.x;
  out.y = rect.y / screen.scaleFactor + screen.y;
  out.width = rect.width / screen.scaleFactor;
  out.height = rect.height / screen.scaleFactor;
  return out;
}

const _permissionSubscriptions = new WeakMap<ScreenPermissionChange, () => void>();
const _signalSubscriptions = new WeakMap<ScreenSignals, () => void>();
const _scratchPoint = { x: 0, y: 0 };

function copyScreenInfo(src: Readonly<ScreenInfo>, dst: ScreenInfo): void {
  Object.assign(dst, stripEntityRuntime(src));
}

function fillDefaultScreenInfo(out: ScreenInfo): ScreenInfo {
  copyScreenInfo(createScreenInfo(), out);
  return out;
}

function rectCenter(rect: Readonly<RectangleLike>): Vector2Like {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
