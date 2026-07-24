import type { Modifier } from './Modifier';
import type { ModifierDefinition } from './ModifierDefinition';
import type { Texture } from './Texture';

export interface WgpuModifierCompileContext {
  acquireTexture(texture: Readonly<Texture>): number;
  uniformBase: number;
}

export interface WgpuModifierContribution {
  declarations?: string;
  source: string;
}

// Backend-side WGSL compiler for one open ModifierKind. The slot and define signature come from the
// substrate-neutral ModifierDefinition; contribution emits WGSL for that slot and bind writes the
// descriptor's scalar data into its reserved three-vec4 uniform record.
export interface WgpuModifierSnippet extends ModifierDefinition {
  bind?(modifier: Readonly<Modifier>, out: Float32Array, offset: number): void;
  contribution(
    modifier: Readonly<Modifier>,
    index: number,
    context: Readonly<WgpuModifierCompileContext>,
  ): WgpuModifierContribution;
}
