// Generated from crates/flight-requirement/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * The exact requirement facet string union from pinned TypeScript.
 */
export const RequirementFacet = {
  CompressionKind: 'compression.kind',
  DocumentFormat: 'document.format',
  Physics2DJointKind: 'physics2d.joint-kind',
  SceneBlendMode: 'scene.blend-mode',
  SceneMaterialKind: 'scene.material-kind',
  SceneModifierKind: 'scene.modifier-kind',
  SceneNodeKind: 'scene.node-kind',
  SceneResourceMimeType: 'scene.resource-mime-type',
  SceneShapeCommand: 'scene.shape-command',
  SceneTextureSourceKind: 'scene.texture-source-kind',
} as const;
export type RequirementFacet = (typeof RequirementFacet)[keyof typeof RequirementFacet];

/**
 * One producer fact. It carries content vocabulary only, never backend or registry identity.
 */
export interface Requirement {
  readonly facet: RequirementFacet;
  readonly key: string;
}

export function getRequirementFacetString(value: RequirementFacet): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'compression.kind':
        return 'compression.kind';
      case 'document.format':
        return 'document.format';
      case 'physics2d.joint-kind':
        return 'physics2d.joint-kind';
      case 'scene.blend-mode':
        return 'scene.blend-mode';
      case 'scene.material-kind':
        return 'scene.material-kind';
      case 'scene.modifier-kind':
        return 'scene.modifier-kind';
      case 'scene.node-kind':
        return 'scene.node-kind';
      case 'scene.resource-mime-type':
        return 'scene.resource-mime-type';
      case 'scene.shape-command':
        return 'scene.shape-command';
      case 'scene.texture-source-kind':
        return 'scene.texture-source-kind';
    }
  })();
}

export function parseRequirementFacet(value: string): RequirementFacet | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'compression.kind':
        return 'compression.kind';
      case 'document.format':
        return 'document.format';
      case 'physics2d.joint-kind':
        return 'physics2d.joint-kind';
      case 'scene.blend-mode':
        return 'scene.blend-mode';
      case 'scene.material-kind':
        return 'scene.material-kind';
      case 'scene.modifier-kind':
        return 'scene.modifier-kind';
      case 'scene.node-kind':
        return 'scene.node-kind';
      case 'scene.resource-mime-type':
        return 'scene.resource-mime-type';
      case 'scene.shape-command':
        return 'scene.shape-command';
      case 'scene.texture-source-kind':
        return 'scene.texture-source-kind';
      default:
        return undefined;
    }
  })();
}
