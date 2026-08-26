# Release notes

The `@flighthq/*` packages use locked versioning, so the publish workflow generates one GitHub release note for the complete package graph. Per-version notes are ephemeral publish artifacts and are not committed to this directory.

## Preview locally

Generate a note from the previous numeric release through a chosen commit:

```sh
npm run release:notes -- 0.4.0 --through HEAD
```

An optional Markdown description is placed directly below the release title and above the generated changes:

```sh
npm run release:notes -- 0.4.0 --through HEAD --description 'A focused release for 3D applications.'
```

Use `--output <path>` to write the note instead of printing it to standard output.

## Snapshot notes

Every `next` and `edge` npm publish generates a cumulative note from the last stable numeric tag through the snapshot commit before it publishes any package. The note is appended to the GitHub Actions job summary, where the generated stable-release content can be inspected throughout development without creating a GitHub Release for every snapshot.

Snapshot notes are not incremental from the preceding snapshot: each describes everything a consumer of the last stable release would gain by installing that particular build. A generation failure blocks the snapshot publish, exercising the same generator and commit-range assumptions used by the eventual stable release.

## Publish

1. Exercise the intended `@next` package version in clean consumer applications.
2. Run `npm run version:packages <version>`, commit the locked manifests and lockfile, push to `develop`, and wait for that exact commit's CI run to pass.
3. Push a bare numeric tag such as `0.4.0`. The release workflow generates its note in the runner's temporary directory from the previous numeric tag through the tagged commit, publishes the packages, and passes the temporary note directly to GitHub Releases.

By default, a lightweight tag produces a fully generated note with no introduction. For a short human introduction without committing a release-note file, use an annotated tag; its subject and body become the description:

```sh
git tag -a 0.4.0 -m 'A focused release for 3D applications.'
git push origin 0.4.0
```

A manual `workflow_dispatch` on a numeric tag can instead supply its optional `description` input. That input takes precedence over an annotated tag message. On a retry, the workflow updates the existing GitHub release body with the freshly generated note before replacing its examples asset.
