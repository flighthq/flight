# flight-net

Portable HTTP capability facade for the pinned `net` package. The crate forwards to a caller-supplied host capability and performs no transport or provider setup.

Requests, options, progress payloads, responses, canonical abort state, and provider identity retain their source identity. Request fields stay optional: the provider applies omitted response-type, timeout, credentials, and redirect defaults. Bodies use the shared `flight-buffer` ArrayBuffer, offset/length/kind view, and immutable opaque Blob records. An absent request body remains distinct from explicit null. Parsed unknown bodies retain opaque values without JSON conversion.

`NetState` replaces the source module's guard and enabled flag. Enabling guards captures the supplied log state and live clock callback; warnings sample that clock when the operation occurs. Each send retains its initial guard across asynchronous completion. Its progress wrapper shares signal data, owns its callback cell, and forwards through the original signal's current emitter. Source programmer rejections remain `FlightError`; expected transport, abort, timeout, and decode failures remain response sentinels.

Headers and form fields use the canonical ordered `Record<String>`. Form encoding preserves source integer-key ordering and the encodeURIComponent character set, then converts spaces to `+`. Method names remain open strings. Closed source unions have exact contract-only string conversion tables. `set_net_guard` is also contract-only; deleted ambient backend installation exports remain absent.

Five method delegates have inline free-function comparisons. The form formatter remains a free function on the foreign-owned Record type. Every source test assertion is represented. One approved diagnostic projection omits the `timeoutMs` log-data key when the optional value is absent, because the canonical logger has no undefined value.

## Precision and lint inventory

Timeout values use `f32`; status and byte counts use unsigned integers. The injected clock and logger timestamp conversion retain the existing `f64` millisecond contract. Fourteen exact string-table helpers declare D9 conformance extras; five functions declare their explicit D5 context parameters. The asynchronous programmer-rejection result has a D15/D10 vocabulary marker. The canonical `Arc<Blob>` response arm has a named-payload marker to preserve the approved Blob identity without a wrapper. No numeric-array conformance mapping changes are introduced.
