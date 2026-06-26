// Barrel so TypeScript resolves the `./render` import in app.ts. The functional vite harness overrides
// this at runtime, routing `./render` to the active renderer's render.<renderer>.ts. This test is
// webgl-only (the environment recipe is a Gl recipe today), so the stub points at the Gl render.
export * from './render.webgl';
