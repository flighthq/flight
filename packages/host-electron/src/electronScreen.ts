import type { ScreenBackend, ScreenChangeEvent, ScreenChangeKind, ScreenInfo } from '@flighthq/types';

import type { ElectronApi, ElectronDisplay } from './electronModule';

// Maps Flight's ScreenBackend onto Electron's `screen` module. Enumeration writes into caller-owned
// `out` values so hot paths allocate nothing. subscribe wires all three of Electron's display change
// events to one listener and returns an unsubscribe that removes all three.
export function createElectronScreenBackend(electron: ElectronApi): ScreenBackend {
  const screen = electron.screen;
  return {
    getScreens(out) {
      const displays = screen.getAllDisplays();
      const primaryId = screen.getPrimaryDisplay().id;
      out.length = displays.length;
      for (let i = 0; i < displays.length; i++) {
        const display = displays[i];
        out[i] = fillScreenInfo({} as ScreenInfo, display, display.id === primaryId);
      }
      return out;
    },
    getPrimaryScreen(out) {
      return fillScreenInfo(out, screen.getPrimaryDisplay(), true);
    },
    getCursorPosition(out) {
      const point = screen.getCursorScreenPoint();
      out.x = point.x;
      out.y = point.y;
      return out;
    },
    subscribe(listener) {
      const primaryId = () => screen.getPrimaryDisplay().id;
      // Electron passes (event, display) for each display change; adapt that into a ScreenChangeEvent.
      const makeHandler =
        (kind: ScreenChangeKind) =>
        (...args: unknown[]): void => {
          const display = args[1] as ElectronDisplay | undefined;
          const event: ScreenChangeEvent = {
            kind,
            screen: display
              ? fillScreenInfo({} as ScreenInfo, display, display.id === primaryId())
              : ({} as ScreenInfo),
            changedMetrics:
              kind === 'ScreenMetricsChanged'
                ? { bounds: true, workArea: true, scaleFactor: true, orientation: true }
                : null,
          };
          listener(event);
        };
      const onAdded = makeHandler('ScreenAdded');
      const onRemoved = makeHandler('ScreenRemoved');
      const onMetrics = makeHandler('ScreenMetricsChanged');
      screen.on('display-added', onAdded);
      screen.on('display-removed', onRemoved);
      screen.on('display-metrics-changed', onMetrics);
      return () => {
        screen.removeListener('display-added', onAdded);
        screen.removeListener('display-removed', onRemoved);
        screen.removeListener('display-metrics-changed', onMetrics);
      };
    },
  };
}

function fillScreenInfo(out: ScreenInfo, display: Readonly<ElectronDisplay>, isPrimary: boolean): ScreenInfo {
  out.id = display.id;
  out.x = display.bounds.x;
  out.y = display.bounds.y;
  out.width = display.bounds.width;
  out.height = display.bounds.height;
  out.workWidth = display.workArea.width;
  out.workHeight = display.workArea.height;
  out.scaleFactor = display.scaleFactor;
  out.isPrimary = isPrimary;
  return out;
}
