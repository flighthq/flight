# flight-host-net

Native HTTP host. It fills the `flight-net` capability group, so `send_net_request`, `flight-loader` and every other net consumer work outside a browser. It is not part of `flight-sdk` and not a workspace default member. Build it with `-p flight-host-net`.

```rust
let mut host = create_net_host(None);
let http = get_net_host_capability(&host);
let response = send_net_request(http, &request, None, &net_state).await?;
destroy_net_host(&mut host);
```

## Capabilities

| Group (`flight-net`) | Slot | Filled | Getter |
| --- | --- | --- | --- |
| `HostNetCapabilities` | `http: HostNetCapability` | yes | `get_net_host_capability`, `get_net_host_capabilities` |

`HostNetCapability` is the only capability struct `flight-net` defines, and this crate fills it.

## Fit check

`HostNetCapability.send_net_request` takes a request and optional options and returns a `Send` future. That future resolves to a `NetResponse` for every expected failure.

| The capability requires | Backing support | Result |
| --- | --- | --- |
| Any method, including extension methods sent with their case kept | Non-standard methods allowed | Filled. DELETE, GET, HEAD, OPTIONS, POST and PUT are upper-cased, as in the Fetch standard. |
| Request headers from `headers` | Arbitrary header map | Filled. A malformed name or value is an `invalid request`. As in a browser, the host owns `accept-encoding` and always sends `gzip`, replacing any caller value. It sends `user-agent: flight-host-net`. |
| Text, `ArrayBuffer` and view bodies; explicit null means no body | Byte bodies | Filled. A text body without a caller `content-type` gets `text/plain;charset=UTF-8`. A body on GET or HEAD is an `invalid request`, as in the Fetch standard. |
| `status`, `ok` (2xx), headers and final `url` | Status, header map, final URI | Filled. Header names are lowercase, and repeated names are joined with `, `. |
| `status_text` | The server's reason phrase is not kept | Partly filled. The standard phrase for the status stands in for it, so 404 gives `Not Found` whatever the server sent. HTTP/2 has no reason phrase either. |
| `response_type` `text`, `json`, `arraybuffer`, `blob` | Raw body bytes | Filled. See *Response bodies*. |
| `timeout_ms` | Whole-operation timeout | Filled. The timeout covers connecting, redirects and the body. 0 times out at once. A negative, NaN or infinite value means no timeout, and the web backend ignores negative values too. Finite values above 10^12 ms (about 31 years) are clamped to 10^12 ms, so every finite value resolves without panicking. |
| `redirect` `follow`, `error`, `manual` | Redirect limit, and returning the redirect response | Filled. `follow` fails as `too many redirects` once a response would take it past `NetHostOptions.redirect_limit` redirects (default 20). With a limit of 0, the first redirect fails. `error` fails on a 301, 302, 303, 307 or 308. `manual` returns the 3xx response itself, with its `location` header. |
| `credentials` | No cookie store | Accepted with no effect. A native client has no origin and no ambient cookies or credentials, so `omit`, `same-origin` and `include` all send exactly the caller's headers. |
| `NetRequestOptions.signal` abort | Blocking I/O, stopped between body chunks | Filled. An already-aborted signal resolves as `aborted` without opening a connection. An abort in flight resolves the future at once as `aborted`, and the worker stops reading at the next body chunk and closes its connection. Dropping the future stops the worker the same way. |
| `NetRequestOptions.progress` | Streaming body reader | `download` progress is filled: `loaded` counts decoded body bytes per chunk, and `total` is the response's `content-length`, the encoded length for a gzip body, or 0 when absent. This matches the web backend. `upload` progress is not emitted, as with the web backend. |

## Response bodies

| `response_type` | `NetResponseBody` |
| --- | --- |
| `text` (default) | `Text`, decoded as UTF-8. Invalid sequences become U+FFFD and a leading BOM is dropped. |
| `json` | `Unknown(Some(serde_json::Value))`. A body that does not parse gives `Unknown(None)`, the decode-failure sentinel. |
| `arraybuffer` | `Buffer` holding the exact body bytes. |
| `blob` | `Blob` with `mime_type` set to the lowercased `content-type`, `size` set to the byte count, and `payload` set to the `ArrayBuffer`. Its `array_buffer_reader` returns that same buffer. |

A body with `content-encoding: gzip` arrives decoded. Its `content-encoding` and `content-length` headers stay in the response as the server sent them. A gzip body that fails to decode is a `protocol error`. An empty body labelled gzip, such as a HEAD response, is an empty body.

## Failures and their explanations

Every transport failure resolves to `status: 0`, `ok: false`, empty headers and `body: None`, with a canonical `status_text`.

`explain_net_host_response` maps that text to a `NetHostResponseExplanationReason`, and `get_net_host_response_status_text` gives the text for a reason. `aborted` and `timeout` are also recognized by `flight_net::explain_net_response`. The other texts read there as `TransportFailure`.

| Reason | `status_text` |
| --- | --- |
| `Aborted` | `aborted` |
| `Timeout` | `timeout` |
| `HostDestroyed` | `host destroyed` |
| `InvalidRequest` | `invalid request` |
| `UnsupportedScheme` | `unsupported scheme` |
| `HostNotFound` | `host not found` |
| `ConnectionFailed` | `connection failed` |
| `RedirectRejected` | `redirect rejected` |
| `TooManyRedirects` | `too many redirects` |
| `TlsFailure` | `tls failure` |
| `ProtocolError` | `protocol error` |
| `NetworkError` | `network error` |

HTTP error statuses such as 404 and 500 are ordinary responses, not failures. The future's `Err` arm is never used. If the transfer panics on its worker, the request still resolves, as `network error`.

## Backing library

| Feature | Library | Provides |
| --- | --- | --- |
| always | `ureq` 3, without default features | HTTP/1.1 client, connection pool, redirects, timeouts |
| always | `flate2` with its Rust backend | gzip decoding of response bodies |
| `https` (default) | `ureq`'s `rustls` feature: rustls with the ring provider and bundled web PKI roots | HTTPS. ring compiles bundled C and assembly through `cc`. Turn the feature off for a build with no C step; `https` URLs then fail as `unsupported scheme`. |
| always | `serde_json` | `json` response bodies, as the workspace's JSON value type |

`ureq` and `flate2` are named only in `src/net_transport.rs`. Replacing either changes that module and `Cargo.toml`.

## Lifetime

- `create_net_host` builds one connection pool. It opens no connection and cannot fail.
- `NetHostOptions` sets `redirect_limit` (default 20) and `max_idle_connections` (default 10).
- `destroy_net_host` closes every pooled connection now, idle or in use:
  - idle connections close at once;
  - a request in flight is interrupted and resolves promptly as `host destroyed`;
  - later sends, including through cloned capabilities, resolve as `host destroyed` without touching the network.

  A repeat call is a no-op.
- `is_net_host_destroyed` reports whether the host has been destroyed.

## Thread contract

- No call must stay on a particular thread.
- `NetHost` is plain data and may move between threads. The capability is `Send + Sync` and may be called from any thread.
- `send_net_request` reads the request when it is called, so later edits to the request do not affect a request already sent. Each request then runs on its own worker thread, named `flight-net-request`.
- The returned future needs no async runtime: it is woken by the worker and works under any executor or a simple `block_on`.
- Progress is emitted, and the response is built, on the thread that polls the future, never on the worker. An abort listener only records the abort and wakes the future.
