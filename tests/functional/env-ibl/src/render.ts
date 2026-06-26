// Barrel so TypeScript resolves the `./render` import in app.ts. The functional vite harness overrides
// this at runtime. This test is webgl-only (the IBL recipe is a Gl recipe today).
export * from './render.webgl';
