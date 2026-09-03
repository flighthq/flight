import { createEntity } from '@flighthq/entity/contract';
import type { NonEntityCreateResult } from '@flighthq/types/contract';
import type {
  ElectronApi,
  ElectronDisplay,
  HostScreenCapabilities,
  ScreenChangeEvent,
  ScreenChangeKind,
  ScreenColorSpace,
  ScreenInfo,
  ScreenOrientation,
} from '@flighthq/types/contract';

export function createElectronScreenCapabilities(
  electron: ElectronApi,
): NonEntityCreateResult<Required<Pick<HostScreenCapabilities, 'change' | 'query'>>, 'type-only'> {
  const screen = electron.screen;
  const query = createEntity({
    getCursorPosition(out: { x: number; y: number }) {
      Object.assign(out, screen.getCursorScreenPoint());
      return out;
    },
    getPrimaryScreen(out: ScreenInfo) {
      return fillScreenInfo(out, screen.getPrimaryDisplay(), true);
    },
    getScreens(out: ScreenInfo[]) {
      const displays = screen.getAllDisplays();
      const primaryId = screen.getPrimaryDisplay().id;
      out.length = displays.length;
      displays.forEach((display, index) => {
        out[index] ??= emptyScreenInfo();
        fillScreenInfo(out[index], display, display.id === primaryId);
      });
      return out;
    },
  });
  const change = createEntity({
    subscribe(listener: (event: Readonly<ScreenChangeEvent>) => void) {
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
    },
  });
  return { change, query };
}

function emptyScreenInfo(): ScreenInfo {
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
    orientation: 'Landscape' as ScreenOrientation,
    refreshRate: -1,
    colorDepth: -1,
    pixelDepth: -1,
    physicalWidth: -1,
    physicalHeight: -1,
    isHdr: false,
    colorSpace: 'srgb' as ScreenColorSpace,
    maxLuminance: -1,
    depthPerComponent: -1,
    dpi: -1,
    label: '',
    internal: false,
    touchSupport: 'unknown',
    monochrome: false,
  });
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
