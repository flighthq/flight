// The four render backends, spelled exactly as the token that identifies them inside a registrar name.
// The value IS the prefix: `register` + backend + type name is the real exported registrar, so
// `Gl` + `ShadedMaterial` gives `registerGlShadedMaterial`. That is the rule scripts/backendPrefix.ts
// enforces across every `register*` in the repo, which is what makes deriving a call name from this
// token safe — a derived name cannot drift out of sync with the registrars the way a hand-maintained
// table of call names would.
//
// A token, not a capability claim: a backend appearing here says nothing about whether it implements a
// given feature. That question is the generated support matrix's, not this type's.
export const RenderBackend = {
  Canvas: 'Canvas',
  Dom: 'Dom',
  Gl: 'Gl',
  Wgpu: 'Wgpu',
} as const;

export type RenderBackend = (typeof RenderBackend)[keyof typeof RenderBackend];
