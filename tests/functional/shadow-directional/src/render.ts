// Barrel so TypeScript resolves the `./render` import in app.ts. The functional vite harness overrides
// this at runtime, routing `./render` to the per-backend render.<renderer>.ts of the active renderer.
// This test is webgl-only (shadows are a Gl recipe today), so the stub points straight at the Gl render.
export * from './render.webgl';
