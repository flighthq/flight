import type { Entity } from './Entity';
import type { GlContext, GlContextOptions } from './GlContext';
import type { HostTarget } from './HostTarget';

// GL drawable lifecycle. `create` is the allocating lane: the host makes a drawable of its own and
// returns its identity, which is the only ordering a native host can honor — EGL chooses its config
// before the window surface exists, so the context options belong to creation and not to a later
// attach. `acquire` is the adopting lane, for a target the host already knows about; it returns null
// when that target holds no drawable, the sentinel every target-scoped hook uses for a lookup that
// cannot succeed. `release` drops the host's record for a target; it does not force context loss,
// which the driver owns and `subscribe` reports.
export interface HostGlCapability extends Entity {
  acquire(target: HostTarget, options?: Readonly<GlContextOptions>): GlContext | null;
  create(width: number, height: number, options?: Readonly<GlContextOptions>): HostTarget | null;
  release(target: HostTarget): void;
  subscribe(target: HostTarget, onLost: () => void, onRestored: () => void): () => void;
}
