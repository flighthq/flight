# flight-host-audio-codecs

`flight-host-audio-codecs` is Flight's opt-in, Rust-only WAV and Ogg Vorbis decode service. It is a
workspace member outside `default-members`, so a root default build does not resolve or compile its
codec backings. It is outside `flight-sdk` and has no FFI or aggregate-native feature.

## Capability fit

`flight-audio` defines three records this host can fill:

| Record | Shape | Fit |
| --- | --- | --- |
| `HostAudioDecodeFormatCapability` | `decode(bytes, signal)` returns a future of `Option<AudioBuffer>`; `None` is the expected miss | Direct. Each backing decodes owned encoded bytes to planar `f32` channels, which become a new `AudioBuffer`. Every failure resolves to `None`. |
| `HostAudioDecodeCapabilities` | Seven closed container slots | `wav` and `ogg` are filled under their features; the other five stay empty. |
| `HostAudioCodecCapability` | `can_play_type(mime)` | Filled. A type is playable exactly when this host decodes it: a native host plays decoded PCM through the mixer. |

Every capability carries the host's one provider identity (`get_audio_codecs_host_provider`).
The direct functions return the same `None` sentinel as the slots, and
`explain_audio_codecs_host_decode` re-runs the bounded decode to say why: disposed, aborted,
unknown or unavailable format, empty, oversized, malformed or truncated input, an unsupported
encoding, channel count or sample rate, zero frames, or an exceeded limit. No error is stored on
the host. `create_audio_codecs_host` returns `None` for out-of-range options, and
`explain_audio_codecs_host_options` names the rejected field.

| Slot | Filled | Backing and behavior |
| --- | --- | --- |
| `wav` | `wav` feature | `hound` 3.5. RIFF/WAVE with integer PCM (8, 16, 24 or 32 bits, plain or extensible header) or 32-bit IEEE float. Integer samples scale by 2^(bits − 1), so the full negative code is exactly −1.0. Float samples pass through unclamped. A-law, µ-law, ADPCM, 64-bit float and non-byte-aligned depths are unsupported encodings. |
| `ogg` | `ogg` feature | `lewton` 0.10 over the `ogg` 0.8 container reader. Vorbis I only. Only the first logical stream is decoded; other streams are skipped. The final packet is trimmed to the last page's granule position. Ogg streams carrying another codec are unsupported encodings. |
| `aac`, `flac`, `mp3`, `mp4`, `webm` | no | no backing in this crate |

`can_play_type` answers `true` for a MIME type that routes to an enabled slot. The routing uses
the same essence aliases as `flight-audio`'s `get_audio_decode_slot`. A `codecs` parameter, when
present, may name only `1` (PCM) or `3` (float) for WAV, and only `vorbis` for Ogg.

Each replaceable library is named only in its format module and `Cargo.toml`: `hound` in
`wav_decoder.rs`, and `lewton` with `ogg` in `ogg_vorbis_decoder.rs`. Both formats are default
features. The `--no-default-features`, `wav`-only and `ogg`-only builds are each valid on their
own.

## Ownership, limits and threads

The host owns its capability records, its provider identity and a shared liveness token. The
getters borrow those records. A decode callback receives the caller's shared byte handle, holds
its read lock only for the duration of the decode, and returns a newly allocated `AudioBuffer`
that the caller owns.

`dispose_audio_codecs_host` is the teardown verb, since the host holds no native resource.
Disposal works as follows:
- Later direct calls and every retained callback fail closed.
- A future created before disposal resolves to `None` when polled.
- A decode in progress stops at its next Vorbis packet or 65,536-sample WAV block.
- `can_play_type` answers `false`.
- Disposing twice is a no-op, and dropping the host disposes it.

The same checkpoints honor the caller's abort signal.

Every limit is checked before the storage it bounds is allocated or grown:

| Limit | Default | Notes |
| --- | --- | --- |
| `max_channels` | 32 | Valid range 1 to 32 |
| `max_decoded_samples` | 64 Mi (256 MiB of `f32`) | Frames times channels |
| `max_encoded_bytes` | 256 MiB | |

Streams must also fit an `AudioBuffer`: 1 to 32 channels, 3,000 to 768,000 Hz, and at least one
frame.

Untrusted header sizes are settled before any backing parser sees the input:
- **WAV.** A preflight walks the RIFF chunks to the data chunk header. It checks the encoding and
  layout, then the declared frames, using checked arithmetic. A declaration whose samples exceed
  `max_decoded_samples` fails as an exceeded limit, even when the input is tiny. A declaration
  longer than the bytes actually supplied fails as truncated input. Only then is `hound` opened,
  and sample storage is reserved for exactly the preflighted frames. A data chunk that is not a
  whole number of frames is malformed.
- **Vorbis.** Codebook tables are bounded at 2^22 entries plus lookup values per stream. This is
  checked before the setup header reaches `lewton`.

A panic inside a backing library is caught, and the decode fails as malformed input.

Decoding is CPU-only and has no thread affinity. Capability closures are `Send + Sync`, and the
host is `Send + Sync`. The work runs synchronously on whichever thread polls the returned future,
and concurrent decodes share nothing mutable. No worker, executor, process singleton or
module-level mutable state is created.

Playback is out of scope: decoded buffers reach a device through a host's `HostAudioMixer`
capability, which this crate does not provide.
