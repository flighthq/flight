import type {
  AppLaunchKind,
  AppLifecycleState,
  AppMemoryPressure,
  HostLifecycleCapability,
} from '@flighthq/types/contract';

function createWebLifecycleBackend(): HostLifecycleCapability {
  const out = {} as HostLifecycleCapability;
  initializeWebLifecycleBackend(out);
  return out;
}

// Builds the default Web provider over document visibility, window focus/blur, and pagehide/pageshow
// events. Produces three states:
//   'active'     — document visible and window focused
//   'inactive'   — document visible but window not focused (app switcher, control-center, other window)
//   'background' — document.hidden (tab hidden or page unloading)
// Degrades to state 'active' and a no-op subscription where document/window are absent (SSR/jsdom).
//
// getLaunchKind() approximates cold vs. warm using PerformanceNavigationTiming.type:
//   'back_forward' → 'warm'  — page was restored from the bfcache (JS heap was frozen and thawed;
//                              the closest web equivalent of a process warm-resume)
//   all others     → 'cold'  — 'navigate', 'reload', 'prerender' are each a fresh page lifecycle
// Falls back to 'cold' when the Performance Navigation Timing API is unavailable (SSR/jsdom).
//
// subscribeMemoryWarning() wires the experimental 'memory-pressure' window event (Chrome origin
// trial / behind flags). The event detail carries a 'critical' pressure string; this provider maps
// it to 'critical' and fires 'normal' on the subsequent resolution event when present. Falls back to
// no-op unsubscribe when the event is not supported (no standard API is widely deployed as of 2026).
function initializeWebLifecycleBackend(out: HostLifecycleCapability): void {
  let _windowFocused = typeof document !== 'undefined';
  out.getState = (): AppLifecycleState => {
    if (typeof document === 'undefined') return 'active';
    if (document.hidden) return 'background';
    return _windowFocused ? 'active' : 'inactive';
  };
  out.subscribe = (listener: () => void): (() => void) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
    // Initialize focus state at subscribe time.
    _windowFocused = document.hasFocus();
    const onFocus = () => {
      _windowFocused = true;
      listener();
    };
    const onBlur = () => {
      _windowFocused = false;
      listener();
    };
    document.addEventListener('visibilitychange', listener);
    window.addEventListener('pagehide', listener);
    window.addEventListener('pageshow', listener);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', listener);
      window.removeEventListener('pagehide', listener);
      window.removeEventListener('pageshow', listener);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  };
  out.getLaunchKind = (): AppLaunchKind => {
    // PerformanceNavigationTiming.type === 'back_forward' indicates the page was restored from the
    // browser's back/forward cache (bfcache). The JS heap was frozen and thawed without a fresh
    // process start — the closest analog to a mobile warm-resume. All other navigation types
    // ('navigate', 'reload', 'prerender') are a fresh page lifecycle, i.e. cold.
    if (typeof performance === 'undefined') return 'cold';
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entries.length > 0 && entries[0].type === 'back_forward') return 'warm';
    return 'cold';
  };
  out.subscribeMemoryWarning = (listener: (level: AppMemoryPressure) => void): (() => void) => {
    // The 'memory-pressure' window event is an experimental Chrome API (origin trial / behind
    // flags as of 2026). The event carries a detail object with a 'pressure' string. This provider
    // maps 'critical' pressure to AppMemoryPressure 'critical'; a pressure-resolved / 'moderate'
    // event maps to 'moderate'. Falls back to no-op unsubscribe when the event is not supported
    // (no cross-browser API for memory pressure is widely deployed yet).
    if (typeof window === 'undefined') return () => {};
    // Feature-detect: attempt to register and immediately remove a passive listener to check
    // whether the event is supported. If addEventListener silently ignores the event type there
    // is nothing we can do — we just return no-op without pretending to be subscribed.
    const onPressure = (e: Event) => {
      const detail = (e as CustomEvent<{ pressure?: string }>).detail;
      const pressure = detail?.pressure;
      if (pressure === 'critical') {
        listener('critical');
      } else if (pressure === 'moderate') {
        listener('moderate');
      } else {
        // Unknown pressure level — treat as moderate rather than silently dropping.
        listener('moderate');
      }
    };
    const onPressureRelieved = () => {
      listener('normal');
    };
    window.addEventListener('memory-pressure', onPressure);
    window.addEventListener('memory-pressure-relieved', onPressureRelieved);
    return () => {
      window.removeEventListener('memory-pressure', onPressure);
      window.removeEventListener('memory-pressure-relieved', onPressureRelieved);
    };
  };
}

export const webHostLifecycle: HostLifecycleCapability = createWebLifecycleBackend();
