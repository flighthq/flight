import type { NodeAny } from './Node';
import type { Path } from './Path';
import type { Rectangle } from './Rectangle';
/**
 * The hit region a node presents in place of descending into its own geometry. Setting a `hitArea`
 * (via `setNodeHitArea`) makes the node an atomic hit unit: the hit-test walk stops recursing into its
 * children and the hit resolves to this node. The value is one of:
 *
 * - `Rectangle` — a snapshot region in the node's **local** space (the only form that can drift, since
 *   nothing keeps it in step with live geometry).
 * - `Path` — a vector region in the node's local space, tested by winding. Share the same `Path` object
 *   a Shape draws with and the hit region stays linked to the real geometry for free.
 * - `'bounds'` — the node's own local bounds (the union of its subtree), read live and auto-invalidated.
 *   The one-line approximation for "treat this whole subtree as one hit" without per-child registration.
 * - `NodeAny` — a proxy node whose geometry and transform are used; tested in that node's **world** space.
 *
 * Coordinate rule: local-space forms (`Rectangle`, `Path`, `'bounds'`) are resolved by inverse-mapping
 * the world hit-point through this node's world matrix (so the region tracks position, rotation, and
 * scale); a `NodeAny` proxy is resolved in the proxy's own world space.
 */
export type HitArea = Readonly<Rectangle> | Readonly<Path> | Readonly<NodeAny> | 'bounds';
