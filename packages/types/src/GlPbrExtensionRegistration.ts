import type { GlPbrExtensionBindContext } from './GlPbrExtensionBindContext.ts';
import type { GlPbrExtensionShaderContext } from './GlPbrExtensionShaderContext.ts';
import type { GlPbrExtensionShaderContribution } from './GlPbrExtensionShaderContribution.ts';
import type { PbrExtension } from './PbrExtension.ts';

// GL realization for one open PbrExtension kind. Registrations are installed explicitly per render
// state; replacing one advances the registry version so compiled program identities cannot go stale.
export interface GlPbrExtensionRegistration {
  bind(context: GlPbrExtensionBindContext, extension: Readonly<PbrExtension>): void;
  createShaderContribution(
    context: Readonly<GlPbrExtensionShaderContext>,
    extension: Readonly<PbrExtension>,
  ): GlPbrExtensionShaderContribution;
  isSupported(extension: Readonly<PbrExtension>): boolean;
}
