// Graceful-interrupt support for a long capture run. Playwright installs its own SIGINT/SIGTERM
// handlers that close the browser, after which in-flight page operations reject; these helpers let the
// capture loop distinguish that torn-down state from a real render failure.

// Graceful interrupt. Playwright installs its own SIGINT/SIGTERM handlers that close the browser, after
// which any in-flight page operation rejects with "Target page, context or browser has been closed". A
// long render run is routinely Ctrl+C'd, so rather than let that reject crash with a raw stack trace —
// and rather than let the loop keep going and report the torn-down page as a spurious failure — callers
// poll this flag: break the entry/renderer loop once it is set, then print a partial summary and exit.
// Returns a getter so the flag stays private. Idempotent across calls.
export function installAbortHandler(): () => boolean {
  if (!abortHandlerInstalled) {
    abortHandlerInstalled = true;
    const onSignal = (): void => {
      runAborted = true;
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  }
  return () => runAborted;
}

// True for the "browser/context/page was closed" rejection Playwright raises once it has torn the
// browser down on signal — expected during a graceful interrupt, not a real test failure.
export function isBrowserClosedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Target (page|closed)|has been closed|Browser has been closed|Target crashed/i.test(message);
}

let runAborted = false;
let abortHandlerInstalled = false;
