import { createEntity } from '@flighthq/entity/contract';
import { createScreenInfo } from '@flighthq/screen/contract';
import type {
  ScreenChangeEvent,
  ScreenInfo,
  WebScreenCapabilities,
  ScreenPermissionState,
} from '@flighthq/types/contract';

interface DetailedScreen {
  availHeight: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  colorDepth: number;
  devicePixelRatio: number;
  height: number;
  isInternal?: boolean;
  isPrimary?: boolean;
  label: string;
  left: number;
  pixelDepth: number;
  refreshRate?: number;
  top: number;
  width: number;
}

interface ScreenDetails {
  currentScreen: DetailedScreen;
  screens: DetailedScreen[];
  addEventListener(type: 'screenschange', listener: () => void): void;
  removeEventListener(type: 'screenschange', listener: () => void): void;
}

interface WebScreenDetailsWindow extends Window {
  getScreenDetails?: () => Promise<ScreenDetails>;
}

interface DisplaySubscription {
  details: ScreenDetails | null;
  handle: () => void;
  orientation: OrientationLike | null;
}

interface OrientationLike {
  angle?: number;
  type?: string;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

export function createWebScreenCapabilities(): WebScreenCapabilities {
  let cached: ScreenInfo[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let details: ScreenDetails | null = null;
  let pointerHandler: ((event: PointerEvent) => void) | null = null;
  const subscriptions = new Set<DisplaySubscription>();

  const snapshot = (info: Readonly<ScreenInfo>): ScreenInfo => Object.assign(createScreenInfo(), info);

  const fillDetailed = (out: ScreenInfo, screen: DetailedScreen, index: number, primary: number): ScreenInfo => {
    Object.assign(out, {
      id: index,
      x: screen.left,
      y: screen.top,
      width: screen.width,
      height: screen.height,
      workWidth: screen.availWidth,
      workHeight: screen.availHeight,
      scaleFactor: screen.devicePixelRatio || 1,
      isPrimary: screen.isPrimary ?? index === primary,
      rotation: orientation()?.angle ?? -1,
      orientation: orientationName(),
      refreshRate: screen.refreshRate && screen.refreshRate > 0 ? screen.refreshRate : -1,
      colorDepth: screen.colorDepth ?? -1,
      pixelDepth: screen.pixelDepth ?? -1,
      physicalWidth: Math.round(screen.width * (screen.devicePixelRatio || 1)),
      physicalHeight: Math.round(screen.height * (screen.devicePixelRatio || 1)),
      isHdr: media('(dynamic-range: high)'),
      colorSpace: media('(color-gamut: rec2020)') ? 'rec2020' : media('(color-gamut: p3)') ? 'display-p3' : 'srgb',
      maxLuminance: -1,
      depthPerComponent: -1,
      dpi: -1,
      label: screen.label ?? '',
      internal: screen.isInternal ?? false,
      touchSupport: 'unknown',
      monochrome: false,
    });
    return out;
  };

  const fillCurrent = (out: ScreenInfo): ScreenInfo => {
    if (details !== null) {
      const index = Math.max(0, details.screens.indexOf(details.currentScreen));
      const primary = Math.max(
        0,
        details.screens.findIndex((screen) => screen.isPrimary),
      );
      return fillDetailed(out, details.currentScreen, index, primary);
    }
    if (typeof window === 'undefined' || window.screen === undefined) return Object.assign(out, createScreenInfo());
    const screen = window.screen;
    Object.assign(out, {
      id: 0,
      x: 0,
      y: 0,
      width: screen.width,
      height: screen.height,
      workWidth: screen.availWidth,
      workHeight: screen.availHeight,
      scaleFactor: window.devicePixelRatio || 1,
      isPrimary: true,
      rotation: orientation()?.angle ?? -1,
      orientation: orientationName(),
      refreshRate: -1,
      colorDepth: screen.colorDepth ?? -1,
      pixelDepth: screen.pixelDepth ?? -1,
      physicalWidth: Math.round(screen.width * (window.devicePixelRatio || 1)),
      physicalHeight: Math.round(screen.height * (window.devicePixelRatio || 1)),
      isHdr: media('(dynamic-range: high)'),
      colorSpace: media('(color-gamut: rec2020)') ? 'rec2020' : media('(color-gamut: p3)') ? 'display-p3' : 'srgb',
      maxLuminance: -1,
      depthPerComponent: -1,
      dpi: -1,
      label: '',
      internal: false,
      touchSupport: 'unknown',
      monochrome: false,
    });
    return out;
  };

  const enumerate = (out: ScreenInfo[]): ScreenInfo[] => {
    if (typeof window === 'undefined' || window.screen === undefined) {
      out.length = 0;
      cached = [];
      return out;
    }
    if (details === null) {
      out.length = 1;
      out[0] ??= createScreenInfo();
      fillCurrent(out[0]);
    } else {
      const primary = Math.max(
        0,
        details.screens.findIndex((screen) => screen.isPrimary),
      );
      out.length = details.screens.length;
      details.screens.forEach((screen, index) => {
        out[index] ??= createScreenInfo();
        fillDetailed(out[index], screen, index, primary);
      });
    }
    cached = out.map(snapshot);
    return out;
  };

  const makeChangeHandler =
    (listener: (event: Readonly<ScreenChangeEvent>) => void): (() => void) =>
    () => {
      const previousCache = cached;
      const next: ScreenInfo[] = [];
      enumerate(next);
      for (const previous of previousCache) {
        if (!next.some((screen) => screen.id === previous.id))
          listener({ kind: 'ScreenRemoved', screen: previous, changedMetrics: null });
      }
      for (const current of next) {
        const previous = previousCache.find((screen) => screen.id === current.id);
        if (previous === undefined) listener({ kind: 'ScreenAdded', screen: current, changedMetrics: null });
        else if (!sameGeometry(previous, current)) {
          listener({
            kind: 'ScreenMetricsChanged',
            screen: current,
            changedMetrics: { bounds: true, workArea: true, scaleFactor: true, orientation: true },
          });
        }
      }
    };

  const query = createEntity({
    destroy() {
      if (typeof window !== 'undefined') {
        for (const subscription of subscriptions) {
          window.removeEventListener('resize', subscription.handle);
          subscription.orientation?.removeEventListener?.('change', subscription.handle);
          subscription.details?.removeEventListener('screenschange', subscription.handle);
        }
      }
      subscriptions.clear();
      if (pointerHandler !== null && typeof window !== 'undefined')
        window.removeEventListener('pointermove', pointerHandler);
      pointerHandler = null;
      cursorX = 0;
      cursorY = 0;
      cached = [];
      details = null;
    },
    getCursorPosition(out: { x: number; y: number }) {
      if (pointerHandler === null && typeof window !== 'undefined') {
        pointerHandler = (event) => {
          cursorX = event.screenX;
          cursorY = event.screenY;
        };
        window.addEventListener('pointermove', pointerHandler);
      }
      out.x = cursorX;
      out.y = cursorY;
      return out;
    },
    getPrimaryScreen(out: ScreenInfo) {
      if (details !== null && details.screens.length > 0) {
        const index = Math.max(
          0,
          details.screens.findIndex((screen) => screen.isPrimary),
        );
        return fillDetailed(out, details.screens[index], index, index);
      }
      return fillCurrent(out);
    },
    getScreens: enumerate,
  });

  const change = createEntity({
    subscribe(listener: (event: Readonly<ScreenChangeEvent>) => void) {
      if (typeof window === 'undefined') return () => {};
      const subscription: DisplaySubscription = {
        details,
        handle: makeChangeHandler(listener),
        orientation: orientation(),
      };
      window.addEventListener('resize', subscription.handle);
      subscription.orientation?.addEventListener?.('change', subscription.handle);
      subscription.details?.addEventListener('screenschange', subscription.handle);
      subscriptions.add(subscription);
      return () => {
        window.removeEventListener('resize', subscription.handle);
        subscription.orientation?.removeEventListener?.('change', subscription.handle);
        subscription.details?.removeEventListener('screenschange', subscription.handle);
        subscriptions.delete(subscription);
      };
    },
  });

  const detailsBackend = createEntity({
    async queryPermission(): Promise<ScreenPermissionState> {
      if (typeof navigator === 'undefined' || navigator.permissions === undefined) return 'prompt';
      try {
        const status = await navigator.permissions.query({ name: 'window-management' as PermissionName });
        return status.state as ScreenPermissionState;
      } catch {
        return 'prompt';
      }
    },
    async request(): Promise<boolean> {
      if (typeof window === 'undefined') return false;
      const request = (window as WebScreenDetailsWindow).getScreenDetails;
      if (request === undefined) return false;
      try {
        const next = await request.call(window);
        for (const subscription of subscriptions) {
          subscription.details?.removeEventListener('screenschange', subscription.handle);
          next.addEventListener('screenschange', subscription.handle);
          subscription.details = next;
        }
        details = next;
        cached = [];
        return true;
      } catch {
        return false;
      }
    },
  });

  const permissionChange = createEntity({
    subscribe(listener: (state: ScreenPermissionState) => void) {
      if (typeof navigator === 'undefined' || navigator.permissions === undefined) return () => {};
      let cancelled = false;
      let status: PermissionStatus | null = null;
      const handle = () => status !== null && listener(status.state as ScreenPermissionState);
      void navigator.permissions
        .query({ name: 'window-management' as PermissionName })
        .then((next) => {
          if (cancelled) return;
          status = next;
          next.addEventListener('change', handle);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        status?.removeEventListener('change', handle);
      };
    },
  });

  return createEntity({ change, details: detailsBackend, permissionChange, query });
}

export const webScreenCapabilities = createWebScreenCapabilities();

function media(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

function orientation(): OrientationLike | null {
  if (typeof window === 'undefined') return null;
  return window.screen.orientation ?? null;
}

function orientationName(): ScreenInfo['orientation'] {
  const type = orientation()?.type ?? '';
  if (type.startsWith('portrait-primary')) return 'Portrait';
  if (type.startsWith('portrait-secondary')) return 'PortraitFlipped';
  if (type.startsWith('landscape-secondary')) return 'LandscapeFlipped';
  return 'Landscape';
}

function sameGeometry(a: Readonly<ScreenInfo>, b: Readonly<ScreenInfo>): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.workWidth === b.workWidth &&
    a.workHeight === b.workHeight &&
    a.scaleFactor === b.scaleFactor &&
    a.orientation === b.orientation &&
    a.rotation === b.rotation
  );
}
