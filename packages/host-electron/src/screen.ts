import type { ScreenBackend, ScreenInfo } from '@flighthq/types';

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
    subscribe(listener) {
      screen.on('display-added', listener);
      screen.on('display-removed', listener);
      screen.on('display-metrics-changed', listener);
      return () => {
        screen.removeListener('display-added', listener);
        screen.removeListener('display-removed', listener);
        screen.removeListener('display-metrics-changed', listener);
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
