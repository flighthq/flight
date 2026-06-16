import type { RenderNode } from './RenderNode';
import type { RenderState } from './RenderState';

// Opt-in material resolution, installed on the render state by enableMaterialSupport and called
// during the render walk. Mirrors AppearanceHooks: absent → material stays null (default pipeline),
// so packages that never enable materials pull in none of the material resolution code.
export interface MaterialHooks {
  update(state: RenderState, data: RenderNode, parentData: RenderNode | undefined): void;
}
