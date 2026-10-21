# flight-media

Portable audio and video playback channels, mixer routing, opt-in lifecycle signals, and
development guards. Playback and scheduling are delegated to host capability records; this crate
opens no device and owns no executor.

## Precision

- Host audio device time and source offsets use `f64` seconds so long-running playback follows the
  host media clock without losing JavaScript-number precision.
- Mixer guard clocks use `f64` millisecond timestamps required by `flight-log`.
