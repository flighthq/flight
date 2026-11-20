# FFI usability: pass 3 — native services (2026-11-20)

Adds to [pass 2](pass-2.md); it does not replace it. Pass 2's order still holds for the node handle, the render path and the host FFI seam. The Rust half of every crate below depends on none of that and can start now, in parallel.

Design: [`../ffi-usability.md`](../ffi-usability.md) section 5 (hosts produce capabilities; consumers borrow them; nothing is constructed from C).

## Why

Pass 2 gets a C program to a window, input and a rendered scene. A real application also loads images, draws text and plays sound. On the web the browser host supplies those; on native nothing does. The three native hosts fill window, screen, surface, lifecycle, input, app loop and wgpu/GL only. This pass fills the rest of what an application needs first.

## Naming rule

- **Name by implementation when the choice is visible to the application** — it differs in features, behaviour, platform reach or cost. Window systems and audio engines: `flight-host-sdl`, `flight-host-winit`, and later `flight-host-openal` if one is wanted.
- **Name by role when the work has one correct answer** — bytes in, pixels out. Codecs, text and HTTP. The library behind a role-named crate is an internal detail that can be replaced without renaming anything.

## Crates

| Crate | Fills | Notes |
| --- | --- | --- |
| `flight-host-sdl` (extend) | audio device, clipboard, dialogs, timers, filesystem, preferences | SDL core only; no new native dependency |
| `flight-host-image-codecs` (new) | image decode and encode | cargo feature per format |
| `flight-host-audio-codecs` (new) | audio decode | cargo feature per format |
| `flight-host-text` (new) | text shaping, font metrics, glyph rasterising, font loading | builds on `flight-font-formats` where it already parses |
| `flight-host-net` (new) | HTTP | |

The capability structs to fill, by owning crate — verify each against the source before writing, and list filled and unfilled slots in the crate's README:

- `flight-media`: `HostAudioDeviceCapability`, `HostAudioMixerCapability`, `HostAudioCapabilities`
- `flight-audio`: `HostAudioCodecCapability`, `HostAudioDecodeFormatCapability`, `HostAudioDecodeCapabilities`
- `flight-image`, `flight-image-codec`: `HostImageCapability`, `HostImageDecodeFormatCapability`, `HostImageEncodeFormatCapability` and their plural groups
- `flight-textshaper`, `flight-font`: `HostTextShaperCapability`, `HostGlyphRasterizerCapability`, `HostFontLoadingCapability` and their plural groups
- `flight-net`: `HostNetCapability`
- `flight-clipboard`, `flight-dialog`, `flight-filesystem`, `flight-preferences`, `flight-host`: the clipboard, dialog, filesystem, preferences and `HostTimerCapability` structs

## Rules for every crate

1. **Same shape as the existing host crates.** Free functions over a plain value: `create_*`, borrowed capability getters, `destroy_*` or `dispose_*` by what teardown does, `explain_*` for every sentinel. No module state. Outside `flight-sdk`, not in `default-members`.
2. **Fit check first.** Before choosing a backing library, read the capability struct and write down, in the crate README, what each closure must do and whether the candidate library can do it. If no single library fits a capability, say so and fill what fits; do not bend the capability.
3. **Backing libraries.** The owner approved outside dependencies for these crates on 2026-11-20, fetched by cargo, never vendored. Default to Rust libraries, so a plain `cargo build` needs no C toolchain and the crates work beside any window host, including headless in CI. A C library is acceptable where the fit check shows the Rust option cannot fill the capability. The owner has not settled Rust versus C for the long term, so:
4. **Confine the library to one module per crate.** Nothing outside that module names the library's types. Swapping the backing later must be a change to that module and `Cargo.toml` only. State in the README which library is behind each feature.
5. **Formats for the first cut.** Images: PNG and JPEG. Audio: WAV and Ogg Vorbis. More formats are additional features later, not part of acceptance.
6. **Audio output.** Use SDL's own audio device under Flight's mixer. Do not add OpenAL in this pass. Record whether the device capability as written needs anything SDL's device cannot give (positional audio in particular).
7. **Text.** The shaper capability wants shaped glyph runs and the glyph atlas wants glyph bitmaps; a "render this string to a surface" library does not fit. System font discovery is in scope; where a platform has no usable discovery, loading a font from bytes must still work.
8. **Thread contract.** State in each README which calls must stay on the host's thread.

## FFI

- Each crate gets a `flight-ffi` cargo feature named for it, on the same terms as the pass 2 host features: default build byte-identical; with the feature on, the crate is scanned and its capability carriers become producible.
- One aggregate feature, `native`, turns on `host-sdl` and the four role crates and yields one library and one header — the bundled build that C and Haxe consumers link.
- This half waits on the host FFI seam from pass 2. The Rust half does not.

## Scenarios

Each runs in Rust first, then through the C ABI when the FFI half lands. Each must run on the headless host as well as SDL where it needs no window, so CI can execute it.

- **G7 — image.** Decode a PNG and a JPEG from bytes, draw each as a bitmap, read back, compare against the decoded pixels within a stated tolerance.
- **G8 — text.** Load a font from bytes, shape and draw a line containing Latin and one complex-script word, read back, compare against a reference produced through the Rust API in the same test.
- **G9 — sound.** Decode a WAV and an Ogg Vorbis file, play each through the mixer to a device; where no device exists, render to a capture buffer and compare samples. Report skipped, not passed, if neither path can run.
- **G10 — fetch.** HTTP GET against a server started by the test on loopback, body compared byte for byte. No external network.

Test files are generated by the test or fetched outside the repository; nothing third-party is committed (see License Provenance in `AGENTS.md`).

## Acceptance

- G7–G10 execute in Rust; through C once the seam exists.
- Root `cargo build` and default `flight-ffi` are unchanged; show the default dependency tree.
- Each README has the fit check, the filled/unfilled table, the library behind each feature and the thread contract.
- One review against this list is enough to integrate. `cargo fmt`, lint, tests.

## Defaults for anything undecided

Decide by the design record's principle and the rules above, record the decision and its reason, and continue. Do not route questions to the principal.

## Reports

The fleet cannot write under `agents/`, so the reports file moves. Write outcomes for passes 2 and 3 to `crates/flight-ffi/usability-reports.md`: what landed, decisions made under the defaults, tools installed, and which scenarios execute.
