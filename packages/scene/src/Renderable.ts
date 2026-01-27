import type { DirtyFlags } from "./DirtyFlags";

export interface Renderable
{
    readonly __dirtyFlags: DirtyFlags;
}
