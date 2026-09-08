import type { Cursor } from './Cursor';
import type { Entity } from './Entity';
import type { HitArea } from './NodeInteraction';

/**
 * Per-node interaction settings — the runtime-slot cell that governs how a single node participates
 * in pointer hit testing, what cursor it shows on rollover, and whether it is a keyboard focus stop.
 *
 * Lives on `NodeRuntime.interactionState` (a lazily-created subsystem slot, like `interactionSignals`),
 * never on the `Node` entity: not every app uses interaction, so the entity stays lean and the cost is
 * only paid when the slot is created. An absent slot (`null`) means every field is at its default:
 * NOT a hit candidate (hit testing is opt-in), no cursor, not focusable.
 *
 * Two systems share this one cell without sharing a flag. `hitTestEnabled`/`hitArea` are read by the
 * pointer hit-test walk (`findGraphHitTarget`/`hitTestGraphPoint`), as is `childrenHitTestEnabled`; `cursor` is read by pointer dispatch
 * on rollover; `focusable`/`tabIndex` are read by a keyboard focus/navigation manager and are never
 * consulted on the pointer path.
 */
export interface NodeInteractionState extends Entity {
  // Opt-in eligibility: whether this node participates in hit testing at all. Defaults to `false` — a
  // node is a hit candidate only after it volunteers. Also the on/off toggle for a volunteered node.
  hitTestEnabled: boolean;
  // Whether the hit-test walk descends into this node's children. Defaults to `true` — the opposite
  // default from `hitTestEnabled`, because gating children is a deliberate act of hiding a subtree,
  // not an opt-in capability. Setting it `false` makes the node's own geometry the only thing under it
  // that can be hit, which is how a composed control (a button with a label and an icon inside) reports
  // itself rather than its parts. Independent of `hitTestEnabled`: a node may present its own region,
  // its children's, both, or neither. Reproduces the OpenFL `mouseChildren` gate.
  childrenHitTestEnabled: boolean;
  // The region this node presents when hit-tested; `null` uses its own kind geometry. Setting a hitArea
  // makes the node an atomic unit — the walk stops recursing into children and the hit resolves here.
  hitArea: HitArea | null;
  // Cursor applied while the pointer rolls over this node; `null` inherits the nearest ancestor with a
  // cursor set, or the backend default when none. `'pointer'` reproduces the OpenFL `buttonMode` hand.
  cursor: Cursor | null;
  // Whether this node is a keyboard focus target (a tab stop). Default `false` — focus is opt-in.
  focusable: boolean;
  // Whether two qualifying pointer clicks dispatch `onPointerDoubleClick`. Default `false` — the
  // higher-level gesture is opt-in independently of ordinary hit testing and click dispatch.
  pointerDoubleClickEnabled: boolean;
  // Ordering key a focus/navigation manager uses to sequence tab stops; `-1` means natural order.
  tabIndex: number;
}
