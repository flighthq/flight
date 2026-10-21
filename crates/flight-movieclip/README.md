# flight-movieclip

A `MovieClip` is a `Node2D` whose frames are driven by a `Timeline`: the node lives here with the
engine that builds its frames. Playback state (current frame, playing, timing) belongs to the clip's
timeline; the `TimelineSource` can be shared by any number of clips.

- `create_movie_clip` composes the 2D family fields with typed `MovieClipData { timeline }`.
  Playback, frame scripts, labels, signals and `update` delegate to the canonical timeline API, with
  the source's null-timeline no-ops.
- `create_spritesheet_timeline_source` exposes a spritesheet animation as a `TimelineSource`. Each
  direction is materialized into an ordinary forward frame list (endpoints are not duplicated), and
  each target lazily gets one reused sprite child whose region texture, offsets, normalized pivot
  and transform invalidation are refreshed per frame. The per-target cache is the frame-realization
  closure's own weak map — a source is shareable and never retains dead targets.
- `explain_spritesheet_timeline_source` reports the authored fields a timeline source cannot carry
  (`frameDurations`, `repeatCount`); `enable_movie_clip_guards` installs the opt-in warning, with a
  caller-owned guard state, log state and injected clock (D5). Cues and audio playback are not
  dispatched by this package — the pinned source carries them as data only.

Non-representable/adapted: a sprite's texture field holds the canonical `Ref<Texture>` union, so each
frame wraps the atlas region's `Texture2D` view fields (deep field equality is asserted; the atlas
view itself remains the shared source of those fields). TS computes frame order from live sheet
frames exactly as this port does.
