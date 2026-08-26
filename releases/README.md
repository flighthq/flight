# Release notes

The `@flighthq/*` packages use locked versioning, so the repository keeps one note per stable version rather than a changelog in every package.

## Prepare a release

1. Exercise the exact `@next` package version in clean consumer applications. Keep the full version string; the commit suffix is part of the evidence.
2. From that candidate's source commit, draft the note:

   ```sh
   npm run release:notes -- 0.4.0 --candidate 0.4.0-next.1921.abcdef0
   ```

3. Replace the generated placeholders in `releases/0.4.0.md`. Curate `Highlights` for application developers and make `Migration` explicit, including an affirmative “No migration is required” when appropriate. Do not edit the generated Changes appendix.
4. Check the note, then bump the locked graph:

   ```sh
   npm run release:notes:check -- 0.4.0
   npm run version:packages 0.4.0
   ```

5. Commit the note, manifests, and lockfile together with a subject of the form `chore(release): 0.4.0`. Any functional commit after the recorded candidate makes the note check fail: publish and exercise a new `@next` candidate instead of declaring untested code stable.
6. Push the release commit to `develop`, wait for its exact CI run to pass, create the bare numeric tag on that commit, and push the tag. The release workflow checks the note again and uses it as the GitHub release body.

The check is intentionally local and deterministic. It validates candidate/source correspondence, the reachable previous tag, the generated conventional-commit appendix, human curation, and the absence of untested post-candidate changes. It does not contact npm or infer whether a team actually performed consumer testing; recording the exact candidate makes that human release decision auditable.
