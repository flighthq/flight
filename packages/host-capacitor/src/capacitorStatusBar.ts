import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorStatusBarInfoResult,
  Entity,
  StatusBarColorBackend,
  StatusBarInfo,
  StatusBarInfoBackend,
  StatusBarOverlaysBackend,
  StatusBarStyle,
  StatusBarStyleBackend,
  StatusBarVisibilityBackend,
  EntityConstruction,
} from '@flighthq/types/contract';

type CapacitorStatusBarBackend = Entity &
  StatusBarColorBackend &
  StatusBarInfoBackend &
  StatusBarOverlaysBackend &
  StatusBarStyleBackend &
  StatusBarVisibilityBackend;

export function createCapacitorStatusBarBackend(
  capacitor: CapacitorApi,
): Entity &
  StatusBarColorBackend &
  StatusBarInfoBackend &
  StatusBarOverlaysBackend &
  StatusBarStyleBackend &
  StatusBarVisibilityBackend {
  const out = allocateEntity<CapacitorStatusBarBackend>();
  initializeCapacitorStatusBarBackend(out, capacitor);
  return finishEntity(out);
}

// Maps Flight's narrow status-bar capabilities onto Capacitor's `@capacitor/status-bar`. Setters are async and fire
// fire-and-forget: setStyle, setBackgroundColor (a packed RGBA int → a `#RRGGBB` hex string, dropping
// alpha the plugin ignores), setVisible (→ show/hide), and setOverlaysContent (→ setOverlaysWebView).
// getInfo is a synchronous snapshot while Capacitor's getInfo is async, so it is served from a value
// prefetched once at construction (default until it resolves). Capacitor emits no status-bar change
// event, so this provider deliberately has no change-subscription member.
export function initializeCapacitorStatusBarBackend(
  out: EntityConstruction<CapacitorStatusBarBackend>,
  capacitor: CapacitorApi,
): void {
  const statusBar = capacitor.statusBar;
  // Sync getInfo over async Capacitor: prefetch the snapshot once and cache it.
  let cachedInfo: CapacitorStatusBarInfoResult | null = null;
  statusBar
    .getInfo()
    .then((info) => {
      cachedInfo = info;
    })
    .catch(() => {
      /* leave null → defaults */
    });
  out.getInfo = (out: StatusBarInfo): StatusBarInfo => {
    const info = cachedInfo;
    out.color = info?.color !== undefined ? hexToRgba(info.color) : 0;
    // Capacitor does not report a status-bar height; -1 sentinel per the contract.
    out.height = -1;
    out.overlaysContent = info?.overlays ?? false;
    out.style = info !== null ? toStatusBarStyle(info.style) : 'default';
    out.visible = info?.visible ?? true;
    return out;
  };
  out.setBackgroundColor = (color: number) => {
    statusBar.setBackgroundColor({ color: rgbaToHex(color) }).catch(() => {});
  };
  out.setOverlaysContent = (overlay: boolean) => {
    statusBar.setOverlaysWebView({ overlay }).catch(() => {});
  };
  out.setStyle = (style: StatusBarStyle) => {
    statusBar.setStyle({ style: toCapacitorStyle(style) }).catch(() => {});
  };
  out.setVisible = (visible: boolean) => {
    if (visible) statusBar.show().catch(() => {});
    else statusBar.hide().catch(() => {});
  };
}

// Flight status-bar style ('light' | 'dark' | 'default') → Capacitor Style ('Light' | 'Dark' | 'Default').
function toCapacitorStyle(style: StatusBarStyle): string {
  if (style === 'light') return 'Light';
  if (style === 'dark') return 'Dark';
  return 'Default';
}

function toStatusBarStyle(style: string): StatusBarStyle {
  if (style === 'Light') return 'light';
  if (style === 'Dark') return 'dark';
  return 'default';
}

// A packed RGBA integer (0xRRGGBBAA) → a `#RRGGBB` hex string; Capacitor's color takes no alpha channel.
function rgbaToHex(color: number): string {
  const rgb = (color >>> 8) & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

// A `#RRGGBB` (or `#RRGGBBAA`) hex string → a packed RGBA integer (0xRRGGBBAA), opaque when no alpha.
function hexToRgba(hex: string): number {
  const digits = hex.replace(/^#/, '');
  if (digits.length === 8) return Number.parseInt(digits, 16) >>> 0;
  if (digits.length === 6) return ((Number.parseInt(digits, 16) << 8) | 0xff) >>> 0;
  return 0;
}
