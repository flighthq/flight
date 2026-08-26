# Changelog

Flight uses one release note for its locked-version package graph. Stable release notes are generated from conventional commits by the publish workflow rather than committed to this repository; published notes remain available on [GitHub Releases](https://github.com/flighthq/flight/releases).

The generator accepts an optional Markdown description for context that does not fit naturally in commit subjects. See the [release-note procedure](releases/README.md).

The `next` and `edge` npm pipelines preview cumulative notes from the last stable release in their GitHub Actions job summaries, exercising the stable note path on every snapshot publication.
