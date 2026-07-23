import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  SoftKeyboardBackend,
  SoftKeyboardInfo,
  SoftKeyboardResizeMode,
  SoftKeyboardStyleKind,
} from '@flighthq/types';
import { SoftKeyboardResizeBodyKind, SoftKeyboardResizeNoneKind, SoftKeyboardStyleDarkKind } from '@flighthq/types';

// Maps Flight's SoftKeyboardBackend onto Capacitor's `@capacitor/keyboard`. show/hide and the setters are
// async fire-and-forget. Capacitor has no getInfo call, so the sync SoftKeyboardBackend.getInfo reads a
// local mirror that internal will-show/will-hide listeners (registered at construction) keep current — it
// reports height 0 / not-visible until the first keyboard event fires. `subscribe` wires the caller's
// listener behind the will-show/will-hide events, mapping them to Flight's 'will' phase + transition.
// setResizeMode/setStyle/setAccessoryBarVisible/setScrollAssistEnabled map to their Capacitor setters;
// the corresponding getters have no Capacitor call and are omitted (they are optional on the seam).
export function createCapacitorKeyboardBackend(capacitor: CapacitorApi): SoftKeyboardBackend {
  const keyboard = capacitor.keyboard;
  // Local mirror kept current by internal listeners, filled into the caller's `out` on getInfo.
  let mirrorVisible = false;
  let mirrorHeight = 0;
  keyboard
    .addListener('keyboardWillShow', (info) => {
      mirrorVisible = true;
      mirrorHeight = info.keyboardHeight;
    })
    .catch(() => {});
  keyboard
    .addListener('keyboardWillHide', () => {
      mirrorVisible = false;
      mirrorHeight = 0;
    })
    .catch(() => {});
  return {
    getInfo(out: SoftKeyboardInfo): SoftKeyboardInfo {
      out.visible = mirrorVisible;
      out.height = mirrorHeight;
      out.x = 0;
      out.y = 0;
      out.width = 0;
      return out;
    },
    hide() {
      keyboard.hide().catch(() => {});
    },
    setAccessoryBarVisible(visible: boolean) {
      keyboard.setAccessoryBarVisible({ isVisible: visible }).catch(() => {});
    },
    setResizeMode(mode: SoftKeyboardResizeMode) {
      keyboard.setResizeMode({ mode: toCapacitorResizeMode(mode) }).catch(() => {});
    },
    setScrollAssistEnabled(enabled: boolean) {
      keyboard.setScroll({ isDisabled: !enabled }).catch(() => {});
    },
    setStyle(style: SoftKeyboardStyleKind) {
      keyboard.setStyle({ style: style === SoftKeyboardStyleDarkKind ? 'DARK' : 'DEFAULT' }).catch(() => {});
    },
    show() {
      keyboard.show().catch(() => {});
    },
    subscribe(listener) {
      const unsubShow = toUnsubscribe(
        keyboard.addListener('keyboardWillShow', (info) =>
          listener('will', { durationSeconds: 0, height: info.keyboardHeight }),
        ),
      );
      const unsubHide = toUnsubscribe(
        keyboard.addListener('keyboardWillHide', () => listener('will', { durationSeconds: 0, height: 0 })),
      );
      return () => {
        unsubShow();
        unsubHide();
      };
    },
  };
}

// Flight resize mode ('None' | 'Body') → Capacitor KeyboardResize ('none' | 'body').
function toCapacitorResizeMode(mode: SoftKeyboardResizeMode): string {
  if (mode === SoftKeyboardResizeNoneKind) return 'none';
  if (mode === SoftKeyboardResizeBodyKind) return 'body';
  return mode;
}

// Bridges Capacitor's Promise<PluginListenerHandle> to Flight's synchronous unsubscribe: fire the
// registration, adopt the handle when it resolves, and remove it (immediately if already resolved).
function toUnsubscribe(handlePromise: Promise<CapacitorPluginListenerHandle>): () => void {
  let removed = false;
  let handle: CapacitorPluginListenerHandle | null = null;
  handlePromise
    .then((resolved) => {
      handle = resolved;
      if (removed) handle.remove().catch(() => {});
    })
    .catch(() => {});
  return () => {
    removed = true;
    if (handle !== null) handle.remove().catch(() => {});
  };
}
