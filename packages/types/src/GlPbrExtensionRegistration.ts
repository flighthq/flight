import type { GlPbrExtensionBindContext } from './GlPbrExtensionBindContext';
import type { GlPbrExtensionShaderContext } from './GlPbrExtensionShaderContext';
import type { GlPbrExtensionShaderContribution } from './GlPbrExtensionShaderContribution';
import type { PbrExtension } from './PbrExtension';

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
