// Controls how a composite effect result relates to the source image that generated it.
// 'draw' composites the generated effect and then the source. 'hide' composites only the generated
// effect. 'knockout' composites only the generated effect, then erases the un-offset source alpha from
// that effect layer so the eventual backdrop shows through the source silhouette.
export type EffectSourceMode = 'draw' | 'hide' | 'knockout';

// Inner effects are already clipped to source alpha, so cutting that source alpha back out would erase
// the effect. They only support drawing the source with the effect or hiding the source.
export type InnerEffectSourceMode = 'draw' | 'hide';
