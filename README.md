# Emilio Rodea — Engineering Portfolio

Static site. Plain HTML + CSS + JS. No build step, no framework, nothing to install.

The whole background is one WebGL2 fragment shader (`js/metal.js`): a raymarched liquid-metal field
that morphs into each build as you scroll (carabiner → 6-DOF arm → mini CNC → split-shell enclosure)
and back to liquid. Design language after AURUM Labs (fable-25.netlify.app/ferrofluid).

## How it's put together

| File | What it does |
|---|---|
| `js/metal.js` | The engine. Shader with one signed-distance function per build, liquid↔shape morph, per-shape interaction (gate spring, arm IK toward the cursor, CNC jog + G-code readout, shell opening), adaptive resolution, CSS fallback if WebGL2 is unavailable. |
| `js/site.js` | Page controller. Any element with `data-form` tells the metal what to become while it's in the middle of the screen: `data-form` 0 liquid · 1 carabiner · 2 arm · 3 CNC · 4 enclosure; `data-mat` 0 gold · 1 chrome · 2 obsidian · 3 anodized oil; `data-align` hero/right/center; `data-morph="progress"` forms the shape across the section's scroll; `data-dim="1"` dims the metal behind reading sections; `data-fig`/`data-name`/`data-note` label the CAD viewfinder. |
| `css/style.css` | Everything visual. Palette tokens at the top are swapped live by `site.js` when the material changes. |
| `index.html` | Home. |
| `projects/*.html` | One page per build. Each hero shows that build live; the bottom section morphs into the next build. |

Interactions on a formed object: move to steer, click (tap on phones) for its action, press-and-hold to melt it back
to liquid ("forget"), release to re-form ("remember"). Keys 1–4 switch material.
Hosted free on GitHub Pages. Link it from your resume as `https://<username>.github.io/`.

## Run it locally

```powershell
python -m http.server 8000
```

Then open http://localhost:8000 in a browser. (Opening `index.html` directly also works.)

## Deploy to GitHub Pages (one time)

1. Create a GitHub account if you don't have one. Pick a username you're happy putting on a resume.
2. Create a **new public repository** named exactly `<username>.github.io`. Don't add a README or .gitignore.
3. In this folder:

   ```powershell
   git add .
   git commit -m "Initial portfolio"
   git remote add origin https://github.com/<username>/<username>.github.io.git
   git push -u origin main
   ```

4. On GitHub: repo → Settings → Pages → Source: "Deploy from a branch", Branch: `main` / `(root)`. Save.
5. Wait a minute. Your site is live at `https://<username>.github.io/`. HTTPS is automatic.

After that, every update is just `git add . ; git commit -m "..." ; git push`.

Optional: buy a domain (e.g. emiliorodea.com, ~$10/yr on Namecheap or Cloudflare), add it in
Settings → Pages → Custom domain, and add a CNAME record at your registrar pointing to `<username>.github.io`.

## Adding photos and renders

Every image on the project pages points to a fixed filename. If the file is missing, the page shows a
"plate pending" drawing-sheet frame naming exactly which file to add. Drop the file in with that name
and it appears. No HTML edits needed. (The home page uses the live 3D figures instead of photos.)

| Page | File | What to put there |
|---|---|---|
| Home | `assets/img/robotic-arm/thumb.jpg` | Arm full-assembly render (16:10) |
| Home | `assets/img/mini-cnc/thumb.jpg` | Finished CNC photo (16:10) |
| Home | `assets/img/zmicro/thumb.jpg` | Approved enclosure render or your sketch (16:10) |
| Home | `assets/img/carabiner/thumb.jpg` | Carabiner product photo (16:10) |
| Robotic arm | `assets/img/robotic-arm/hero.jpg` | Full assembly render, white + blue (16:9) |
| Robotic arm | `assets/img/robotic-arm/teleop-diagram.png` | Leader → follower → data → policy diagram |
| Robotic arm | `assets/img/robotic-arm/servo.jpg` | STS3215 servo + driver board photo |
| Robotic arm | `assets/img/robotic-arm/joint-housing.png` | Joint housing section view (CAD) |
| Robotic arm | `assets/img/robotic-arm/link-detail.png` | Capsule link with insert holes (CAD) |
| Robotic arm | `assets/img/robotic-arm/base.png` | Base + flange (CAD) |
| Robotic arm | `assets/img/robotic-arm/print-test.jpg` | First printed part / fit test |
| Mini CNC | `assets/img/mini-cnc/hero.jpg` | Finished machine, well lit (16:9) |
| Mini CNC | `assets/img/mini-cnc/spindle-mount.jpg` | Spindle mount close-up |
| Mini CNC | `assets/img/mini-cnc/wiring.jpg` | Arduino + driver wiring |
| Mini CNC | `assets/img/mini-cnc/build-1.jpg` | Frame / axis assembly in progress |
| Mini CNC | `assets/img/mini-cnc/build-2.jpg` | Lead screw + bearing detail |
| Mini CNC | `assets/img/mini-cnc/running.jpg` | Machine running a job |
| Enclosure | `assets/img/zmicro/hero.jpg` | Approved render or simplified sketch (16:9) |
| Enclosure | `assets/img/zmicro/joint-concepts.png` | Your sketch of the joint concepts |
| Enclosure | `assets/img/zmicro/fit-check-print.jpg` | 3D-printed fastener coupon (optional) |
| Carabiner | `assets/img/carabiner/hero.jpg` | Clean product photo (16:9) |
| Carabiner | `assets/img/carabiner/cad.png` | SolidWorks model |
| Carabiner | `assets/img/carabiner/samples.jpg` | First-article samples |
| Carabiner | `assets/img/carabiner/lineup.jpg` | Carabiner with keychains / charms |
| Carabiner | `assets/img/carabiner/listing.jpg` | Etsy listing screenshot |

Keep images under ~500 KB each (export JPG at ~80% quality, max 1600 px wide). `.jpg` vs `.png`
matters: the filename must match exactly. If you'd rather use a different extension, edit the `src`
in the HTML.

Photo tips (from MIT's MechE portfolio guide): plain background, good light, in focus. Show
process shots, not just the finished thing. Annotate CAD screenshots if it helps explain a feature.

## Other things to fill in

- `assets/resume/Emilio_Rodea_Resume.pdf` — drop your resume PDF here (the nav "Resume" button links to it).
- `index.html` → Contact section: replace `YOUR_EMAIL@example.com`, the LinkedIn URL, and the GitHub URL.
- ZMicro page (`projects/tp1-enclosure.html`): confirm with your manager what you're allowed to show. The text is written at the level of your resume bullets; don't post production CAD or drawings without approval.

## Editing

- Colors: the four material palettes live in `PALETTES` at the top of `js/site.js` (and the default in `css/style.css` `:root`).
- Fonts: Space Grotesk, Space Mono, Instrument Serif (Google Fonts link in each page's `<head>`).
- Copy for each build: the `<section class="chapter">` blocks in `index.html` and the matching `projects/*.html`.
- The old plain design is backed up in `.tmp/v1-plain/` (git-ignored). `liquid/` and `workshop/` are earlier experiments and aren't linked from the site.
