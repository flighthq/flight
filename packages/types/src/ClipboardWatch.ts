import type { Signal } from './Signal';

// Clipboard change event entity. Allocate with createClipboardWatch; start delivery with
// attachClipboardWatch (which wires the supplied host's change subscription to onChange) and
// release with detachClipboardWatch / disposeClipboardWatch. The signal stays inert until attached.
export interface ClipboardWatch {
  onChange: Signal<() => void>;
}
