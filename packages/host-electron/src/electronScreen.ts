import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { NonEntityCreateResult } from '@flighthq/types/contract';
import type {
  ElectronApi,
  ElectronDisplay,
  EntityConstruction,
  HostScreenCapabilities,
  ScreenChangeBackend,
  ScreenChangeEvent,
  ScreenChangeKind,
  ScreenColorSpace,
  ScreenInfo,
  ScreenOrientation,
  ScreenQueryBackend,
} from '@flighthq/types/contract';

export function createElectronScreenCapabilities(
  electron: ElectronApi,
): NonEntityCreateResult<Required<Pick<HostScreenCapabilities, 'change' | 'query'>>, 'type-only'> {
  const screen = electron.screen;
  const query = allocateEntity<ScreenQueryBackend>();
  initializeScreenQueryBackend(query, screen);
  finishEntity(query);
  const change = allocateEntity<ScreenChangeBackend>();
  initializeScreenChangeBackend(change, screen);
  finishEntity(change);
  return { change, query };
}

export function initializeEmptyScreenInfo(out: EntityConstruction<ScreenInfo>): void {
  out.colorDepth = -1;
  out.colorSpace = 'srgb' as ScreenColorSpace;
  out.depthPerComponent = -1;
  out.dpi = -1;
  out.height = 0;
  out.id = 0;
  out.internal = false;
  out.isHdr = false;
  out.isPrimary = false;
  out.label = '';
  out.maxLuminance = -1;
  out.monochrome = false;
  out.orientation = 'Landscape' as ScreenOrientation;
  out.physicalHeight = -1;
  out.physicalWidth = -1;
  out.pixelDepth = -1;
  out.refreshRate = -1;
  out.rotation = -1;
  out.scaleFactor = 1;
  out.touchSupport = 'unknown';
  out.width = 0;
  out.workHeight = 0;
  out.workWidth = 0;
  out.x = 0;
  out.y = 0;
}

export function initializeScreenChangeBackend(
  out: EntityConstruction<ScreenChangeBackend>,
  screen: ElectronApi['screen'],
): void {
  out.subscribe = (listener: (event: Readonly<ScreenChangeEvent>) => void) => {
    const makeHandler =
      (kind: ScreenChangeKind) =>
      (...args: unknown[]): void => {
        const display = args[1] as ElectronDisplay | undefined;
        listener({
          kind,
          screen:
            display === undefined
              ? emptyScreenInfo()
              : fillScreenInfo(emptyScreenInfo(), display, display.id === screen.getPrimaryDisplay().id),
          changedMetrics:
            kind === 'ScreenMetricsChanged'
              ? { bounds: true, workArea: true, scaleFactor: true, orientation: true }
              : null,
        });
      };
    const added = makeHandler('ScreenAdded');
    const removed = makeHandler('ScreenRemoved');
    const metrics = makeHandler('ScreenMetricsChanged');
    screen.on('display-added', added);
    screen.on('display-removed', removed);
    screen.on('display-metrics-changed', metrics);
    return () => {
      screen.removeListener('display-added', added);
      screen.removeListener('display-removed', removed);
      screen.removeListener('display-metrics-changed', metrics);
    };
  };
}

export function initializeScreenQueryBackend(
  out: EntityConstruction<ScreenQueryBackend>,
  screen: ElectronApi['screen'],
): void {
  out.getCursorPosition = (target: { x: number; y: number }) => {
    Object.assign(target, screen.getCursorScreenPoint());
    return target;
  };
  out.getPrimaryScreen = (target: ScreenInfo) => {
    return fillScreenInfo(target, screen.getPrimaryDisplay(), true);
  };
  out.getScreens = (target: ScreenInfo[]) => {
    const displays = screen.getAllDisplays();
    const primaryId = screen.getPrimaryDisplay().id;
    target.length = displays.length;
    displays.forEach((display, index) => {
      target[index] ??= emptyScreenInfo();
      fillScreenInfo(target[index], display, display.id === primaryId);
    });
    return target;
  };
}

function emptyScreenInfo(): ScreenInfo {
  const out = allocateEntity<ScreenInfo>();
  initializeEmptyScreenInfo(out);
  return finishEntity(out);
}

function fillScreenInfo(out: ScreenInfo, display: Readonly<ElectronDisplay>, isPrimary: boolean): ScreenInfo {
  const rotation = display.rotation ?? -1;
  const colorDepth = display.colorDepth ?? -1;
  Object.assign(out, {
    id: display.id,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    workWidth: display.workArea.width,
    workHeight: display.workArea.height,
    scaleFactor: display.scaleFactor,
    isPrimary,
    rotation,
    orientation: orientationFor(display, rotation),
    refreshRate: display.displayFrequency ?? -1,
    colorDepth,
    pixelDepth: colorDepth,
    physicalWidth: Math.round(display.bounds.width * display.scaleFactor),
    physicalHeight: Math.round(display.bounds.height * display.scaleFactor),
    isHdr: false,
    colorSpace: normalizeColorSpace(display.colorSpace),
    maxLuminance: -1,
    depthPerComponent: colorDepth > 0 ? Math.floor(colorDepth / 3) : -1,
    dpi: display.scaleFactor > 0 ? Math.round(display.scaleFactor * 96) : -1,
    label: display.label ?? '',
    internal: display.internal ?? false,
    touchSupport: display.touchSupport ?? 'unknown',
    monochrome: display.monochrome ?? false,
  });
  return out;
}

function normalizeColorSpace(value: string | undefined): ScreenColorSpace {
  if (value === 'display-p3' || value === 'rec2020' || value === 'srgb') return value;
  return 'srgb';
}

function orientationFor(display: Readonly<ElectronDisplay>, rotation: number): ScreenOrientation {
  if (rotation === 90) return 'Portrait';
  if (rotation === 180) return 'LandscapeFlipped';
  if (rotation === 270) return 'PortraitFlipped';
  return display.bounds.height > display.bounds.width ? 'Portrait' : 'Landscape';
}
