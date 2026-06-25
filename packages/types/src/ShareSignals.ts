import type { ShareResult } from './Share';
import type { Signal } from './Signal';

// Share result event entity. Enable delivery with attachShareSignals; the signals stay inert until
// then. onShareResult carries the full ShareResult emitted by shareContentWithResult calls.
export interface ShareSignals {
  onShareResult: Signal<(result: Readonly<ShareResult>) => void>;
}
