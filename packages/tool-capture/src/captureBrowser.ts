// Headless Chromium launch for a capture run, plus the pre-script init that makes every capture
// deterministic: a fixed viewport, capture-mode flag, seeded Math.random, and the optional frame-halt.
//
// Playwright is imported lazily (a dynamic import inside launchBrowser) so that importing this package
// has no top-level Playwright cost and pulls no browser driver into a consumer's module graph until a
// capture is actually run. Only the `chromium` value is loaded this way; the Browser/BrowserContext
// types are erased at compile time.

import type { Browser, BrowserContext } from '@playwright/test';

export async function launchBrowser(
  options: { captureFrames?: number; verify?: boolean; observe?: boolean } = {},
): Promise<{ browser: Browser; context: BrowserContext }> {
  const { chromium } = await import('@playwright/test');

  // Headless Chromium exposes navigator.gpu but withholds a Wgpu adapter on a software-only,
  // "untrusted" config unless --enable-unsafe-webgpu is set; with it, Dawn falls back to the
  // SwiftShader Vulkan ICD bundled inside Playwright's Chromium (no host GPU / driver needed).
  // --use-webgpu-adapter=swiftshader pins that software adapter so output is identical on a dev
  // machine with a real GPU and in CI — required for stable cross-backend baselines.
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });

  // Always signal capture mode before any page script runs. A page whose render advances over time
  // holds a fixed, self-seeded frame in this mode (the landing backgrounds do), so its screenshot —
  // and thus its baseline hash — is byte-identical run to run. Pages that ignore the flag animate.
  //
  // Also seed Math.random with a fixed value so a scene built with random positions/colours renders
  // the same on every load and backend — what makes the render fingerprint stable run-to-run (Tier 5)
  // and lets the cross-backend differential (Tier 3) compare like with like. It does not pin the clock,
  // so time-based animation is not frozen here — the --frames halt handles that. (Pages with their own
  // seeded RNG, like the landing, are unaffected.) The generator is mulberry32 — the same algorithm as
  // the SDK's createRandomSource (@flighthq/math), inlined below; see the note there for why it cannot
  // be imported into this pre-module, bare-page init script.
  //
  // Optionally also install a frame-halt (the --frames=N mode): count the page's animation frames,
  // and on the Nth one stop invoking its callback so the scene halts on a fixed frame, then flag it
  // for the screenshot. N=1 is the robust common case (frame 1 always completes before the screenshot,
  // with no settle-timing race).
  const captureFrames = options.captureFrames ?? 0;
  const verify = options.verify ?? true;
  const observe = options.observe ?? false;
  await context.addInitScript(
    (args: { frames: number; verify: boolean; observe: boolean }) => {
      const flags = window as unknown as {
        __captureFramesReached?: boolean;
        __flightCapture?: boolean;
        __flightCaptureVerify?: boolean;
        __ftRealRequestAnimationFrame?: (cb: FrameRequestCallback) => number;
        __ftTarget?: { kind?: string };
        __ftVerification?: { fingerprint?: string | null };
        __ftWarmupFrames?: number;
      };
      const { frames, verify, observe } = args;
      flags.__flightCapture = true;
      flags.__flightCaptureVerify = verify;

      // Inline mulberry32 — the exact algorithm of the SDK's createRandomSource (@flighthq/math). It is
      // copied (not imported) on purpose: addInitScript is serialized and injected before any module
      // loads, and the SDK function's *built* source references bundler helpers (e.g. __name) that do
      // not exist in this bare page context, so injecting its source breaks. Keep this in sync with that
      // one function — it is the only duplicate, and it is trivial and frozen.
      let seed = 0x9e3779b9 >>> 0;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };

      if (frames < 1) return;
      flags.__captureFramesReached = false;

      // Force preserveDrawingBuffer so the halted Gl frame survives in the buffer for the screenshot
      // (the default clears it once composited, which would shoot blank once the loop stops).
      const realGetContext = HTMLCanvasElement.prototype.getContext as (
        this: HTMLCanvasElement,
        type: string,
        attrs?: Record<string, unknown>,
      ) => RenderingContext | null;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        attrs?: Record<string, unknown>,
      ) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
          return realGetContext.call(this, type, { ...attrs, preserveDrawingBuffer: true });
        }
        return realGetContext.call(this, type, attrs);
      } as typeof HTMLCanvasElement.prototype.getContext;

      // A scene whose first frames render blank while it warms up (async mesh/texture upload, an IBL
      // bake, a float render target) needs more than `frames` frames before its first non-blank frame.
      // Freezing hard on frame N would then shoot black. So for a GPU verifier the halt treats `frames`
      // as a minimum: once past it, keep advancing until the verifier publishes a real (non-blank) frame,
      // up to this ceiling. Scenes already non-blank by frame N halt at exactly N (unchanged), so stable
      // baselines are unaffected; only warm-up-slow scenes render the extra frames. A scene that stays
      // blank to the ceiling still stops, and the verifier guard in captureEntry then fails it — no false
      // green, no unbounded loop (captureEntry's own 15s wait is the outer bound either way).
      const warmupCeiling = frames + 600;
      // Observe-only fallback: a page that registers no verify target takes the canvas-grab path with no
      // warmup, so an app-loop-driven scene (whose first tick establishes time and hasn't drawn yet) is
      // frozen blank at frame N. In observe mode, keep advancing such a page until its canvas actually
      // draws — bounded by this much smaller ceiling (app-loop startup is a few frames, and a genuinely
      // blank scene must not burn the GPU-warmup's ~10s here). The extra frames are recorded so the
      // caller can warn that the capture took longer. Gate/baseline mode is untouched (deterministic
      // freeze at frame N), so this changes no committed hash.
      const observeWarmupCeiling = frames + 120;
      let count = 0;
      const realRequestAnimationFrame = window.requestAnimationFrame.bind(window);
      // Expose the un-hijacked rAF so the render verifier can await a genuine presented frame before it
      // reads the canvas back. The override below stops invoking callbacks past the halt frame, so a
      // verifier awaiting window.requestAnimationFrame could hang; it uses this stashed one instead.
      flags.__ftRealRequestAnimationFrame = realRequestAnimationFrame;
      window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
        realRequestAnimationFrame((time) => {
          if (flags.__captureFramesReached) return; // halted: scene holds its last frame
          if (count >= frames) {
            const targetKind = flags.__ftTarget?.kind;
            const gpuVerifying = verify && (targetKind === 'webgl' || targetKind === 'webgpu');
            let done: boolean;
            if (gpuVerifying) {
              const haveRealFrame =
                (flags.__ftVerification?.fingerprint ?? null) !== null || document.getElementById('ft-error') !== null;
              done = haveRealFrame || count >= warmupCeiling;
            } else if (observe) {
              // Cheap inline "did anything draw" test: downscale the canvas into a 32×32 2D context and
              // look for any pixel differing from the top-left (background). Inlined rather than a named
              // helper on purpose — a named function in an addInitScript body gets esbuild's __name()
              // wrapper, which is undefined in the injected page (same reason mulberry32 is inlined above).
              let drew = false;
              const canvas = document.querySelector('canvas');
              if (canvas !== null && canvas.width > 0 && canvas.height > 0) {
                const off = document.createElement('canvas');
                off.width = 32;
                off.height = 32;
                const ctx = off.getContext('2d');
                if (ctx === null) {
                  drew = true; // can't sample — don't block the halt
                } else {
                  try {
                    ctx.drawImage(canvas, 0, 0, 32, 32);
                    const data = ctx.getImageData(0, 0, 32, 32).data;
                    const r = data[0]!;
                    const g = data[1]!;
                    const b = data[2]!;
                    for (let i = 4; i < data.length; i += 4) {
                      if (
                        Math.abs(data[i]! - r) > 8 ||
                        Math.abs(data[i + 1]! - g) > 8 ||
                        Math.abs(data[i + 2]! - b) > 8
                      ) {
                        drew = true;
                        break;
                      }
                    }
                  } catch {
                    drew = true; // tainted/unreadable — don't block the halt
                  }
                }
              }
              done = drew || count >= observeWarmupCeiling;
            } else {
              done = true; // gate/baseline: deterministic freeze at exactly frame N
            }
            if (done) {
              flags.__ftWarmupFrames = count - frames; // extra frames the warmup cost (0 = none)
              flags.__captureFramesReached = true;
              return; // halt: scene stops advancing
            }
            // else: still warming up — fall through to render another frame
          }
          count++;
          callback(time);
        });
    },
    { frames: captureFrames, verify, observe },
  );

  return { browser, context };
}
