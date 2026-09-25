import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

// Clipboard change event entity. Allocate with createClipboardWatch; start delivery with
// attachClipboardWatch (which wires the supplied host's change subscription to onChange) and
// release with detachClipboardWatch / disposeClipboardWatch. The signal stays inert until attached.
export interface ClipboardWatch extends Entity {
  onChange: Signal<() => void>;
}
