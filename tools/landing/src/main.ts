import { startParticleBackground } from './background-particles';

// Rewrite the tool links to base-absolute URLs (`/flight/explorer/` in production, `/explorer/`
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
// try/catch: if WebGL is unavailable (old hardware, headless capture) the error surfaces in the
// console and the static background simply remains.
startParticleBackground();
