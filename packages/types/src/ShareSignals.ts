import type { Entity } from './Entity.ts';
import type { ShareResult } from './Share.ts';
import type { Signal } from './Signal.ts';

// Share result event entity. Enable delivery with attachShareSignals; the signals stay inert until
// then. onShareResult carries the full ShareResult emitted by shareContentWithResult calls.
export interface ShareSignals extends Entity {
  onShareResult: Signal<(result: Readonly<ShareResult>) => void>;
}
