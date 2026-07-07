import { startParticleBackground } from './background-particles';
import { startHeroDemo } from './hero-demo';
import { fillSizeFigures } from './size-figures';

// Rewrite the tool links to base-absolute URLs (`/flight/examples/` in production, `/examples/`
// in dev) so they resolve from the site root rather than the current path. Relative hrefs compound
// when the dev server falls back to serving this page for an unknown `/functional/` path — each
// click would append another segment. Base-absolute links never stack and stay correct under the
// deployed `/flight/` base.
const base = import.meta.env.BASE_URL;
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-tool]')) {
  link.href = `${base}${link.dataset.tool}/`;
}

// A single Flight-rendered background: a drifting particle field fills the screen, so the page
// dogfoods the SDK instead of faking motion with CSS. It is progressive enhancement — the page is
// fully readable over the static dark background without it, so this is deliberately not wrapped in
// try/catch: if Gl is unavailable (old hardware, headless capture) the error surfaces in the
// console and the static background simply remains.
startParticleBackground();

// The hero "live code" panel renders small scenes with the Canvas renderer (no extra Gl context),
// dogfooding the same explicit API printed beside it. Tabs swap both the scene and the snippet. It
// returns early if its mount elements are absent, so it never blocks the rest of the page.
startHeroDemo();

// Fill the bundle-size figures from the committed size baseline (real gzip numbers, build-time).
fillSizeFigures();
