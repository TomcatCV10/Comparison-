# The Comparison Society – handoff notes (for Claude Code)

Built as a single self-contained HTML page, published as a Claude artifact. This note is so the site can be rebuilt and moved (next stage: Claude Code + Railway).

## Files
- `comparison-society-TEMPLATE-no-images.html` – the whole site, structure and settings intact, but with every image, logo, thumbnail title, holder title and caption removed (about 230 KB). The home page shows six empty holders and each of the six sub-pages has 12 empty thumbnail slots.
- The full copy with all pictures (about 15.7 MB) is NOT included because it is too big to send. The owner keeps it and will re-upload and rework the pictures later, either through the Admin panel or once the image storage on Railway is built. Do not expect any pictures in the template.

## What the site is
A neon-styled "price and spec comparison" site. Yachts, cars, motorbikes and so on are shown as side-by-side comparison pictures ("A v B"). The owner makes the comparison pictures by hand and uploads them. The page has a built-in Admin ("Back page"), opened with the gear button, to edit everything in the browser.

## File anatomy (top to bottom)
1. `<style>` – all CSS. Theme tokens are on `:root` (`--g` glow, `--gi` glow intensity, `--fbm`/`--fbp` frame brightness, `--c` current neon colour, `--f` font Exo 2 italic).
2. `#boot` loader div, replaced when the site starts. On a script error it shows "Something stopped the site from starting" plus an "Open without saved data" button.
3. `<script id="seed" type="application/json">` – the saved site data (see Data model).
4. Markup between `<!--CS-START-->` and `<!--CS-END-->`: header with logo (`#lgh`, the original logo), nav, `#hero`, `#grid` (six holders), `#pgrid` (sub-page thumbnails), `#lb` (lightbox), footer, `#gear`, `#adm` (admin panel).
5. `<script>` boot – reads saved state from IndexedDB, then evaluates the main script.
6. `<script id="main" type="text/plain">` – all the app code, run by the boot script. Global state is `S`. Key functions: `build()` (admin UI), `secHTML()`, `render()` (public page), `save()`/`persist()`, `lbShow(pg,i)`, `capShow(t)`, `itHTML(t,n)` (thumbnail text box), `tglHTML`/`seg()` (On/Off switches).

## Data model (the seed JSON, state `S`)
- `tiles[6]` – home-page holders: `img, text (title), link, zm/ox/oy/br (size, move X/Y, brightness), fit, ex[] (extra slideshow pictures)`.
- `pages[6].th[12]` – sub-page thumbnails: `img, title ("A v B"), link, fit, ta, cap, cap2, capm (separate paragraphs), capa (left/center/justify), capo (false hides this picture's text), us1/us2 (unused leftovers)`.
- `lg1` (header logo), `lg2` (footer logo): `img, fit, zm, ox, oy, br, fw, fh`.
- `hero` plus `hh/hp` (headline/sub-text), `hzm/hox/hoy/hbr/hbl` etc. for the hero image.
- `adv[]`, `advh`, `ban` – advert and banner holders. `info{about,contact,terms,corporate,links}` – information pages. `cols`, `nav`, `fl/fr` – footer columns and text.
- Global switches: `capon` (all picture text on/off), `capj` (text box joined to picture), `tj` (title joined to picture), `ttl/httl` (title position), `tcols` (thumbnail columns), `tsl` (slideshow: on, sec, mix, dis).
- Look settings: `gl` desktop glow %, `glp` phone glow %, `nfr` desktop frame brightness %, `fbrp` phone frame brightness %, `hcl` holder colour pattern.
- `_t` – timestamp of the last save. **Newest `_t` wins** when the seed and browser storage disagree.

Current defaults chosen by the owner: glow 90 % (coded default), frame brightness 90 %, phone glow 50, phone frame brightness 80. The saved seed may show glow 85 because an open browser tab saved 85 over it. Set it again in Admin if wanted.

## Persistence (artifact version)
- Saves go to IndexedDB (`cs_site` / store `kv` / key `state`), localStorage `cs_site_v11`, and 12 rolling recovery snapshots. Traffic counts use localStorage `cs_traffic_v1`.
- On a published artifact the page also republishes its whole document through the `artifact` capability (`claude.use('artifact').publish`). This is why outside publishes get refused with "a newer version saved from inside the page". Fix: copy the live seed into the new file, then publish again.
- Artifact capabilities used: `artifact`, `downloads` (backup downloads), `sample` (now unused).

## Routes (hash based)
`#/` home, `#/p1`–`#/p6` sub-pages, `#/about #/contact #/terms #/corporate #/links #/c<N>` info pages. A picture opens in a lightbox with the title bar above and the text box below.

## Admin (gear button) – main sections
Homepage: Images (six holders, each with picture 1–4 for slideshow), Update text 1–6, Hero, Footer, Top menu & search, Logos, Holder colours. Sub-page holders edit (grid of 12 thumbnails per page; "Edit picture N" has two tabs: Image & title / Text). Info pages, Traffic, Settings (glow, frame brightness, thumbnail columns, image text, title join).
Many controls are On/Off switches. "Extra settings" switches (size, move X/Y, brightness) hide the sliders by default on Hero, Logos and the six holders.

## Rules the owner insisted on
- Look and feel: blue titled boxes (`#4a8dff` border, `#7db0ff` title), compact admin, light fonts, never break email addresses across lines.
- Be unbiased between the two compared products; use different text for each boat.
- Captions are written by hand in a plain text box. The "write text from my points" automatic writer was tried and removed on request. Do not re-add it.
- Do not make the neon glow spill onto neighbouring boxes more than it does now: a tighter glow and a clipped seam were both tried and rejected, and the original look was restored.
- Prices must always be shown in spec panels, labelled with their basis (see "Open items").

## Moving to Claude Code + Railway (suggested plan)
1. Serve the template as a static file (Node/Express or similar) on Railway.
2. Replace the artifact autosave (the `claude.use('artifact').publish` path in the main script) with an API: `GET /api/state` and `PUT /api/state`, storing the seed JSON on a Railway Postgres or volume, with the same newest-`_t`-wins rule.
3. Store images as files (upload endpoint, URLs in the JSON) instead of base64. This removes the 16 MB page limit.
4. Use the existing `TRACK_ENDPOINT` hook (a constant in the main script) to send click tracking to the server.
5. Keep the hash routing (or move to real URLs later). Protect the admin (the gear button) with a login before going public; do not rely on the artifact's sharing settings.

## Testing notes (Playwright)
Open the file, click `#gear`, then `.bn a[data-s=home]` (group), then `.bn a[data-s=images|logos|hero|...]`; sub-pages are `.bn a[data-s=links]` then `.bn a[data-s=pg2]`; thumbnails are `.tc`; exit is `button.exit`. The Google Fonts request is blocked in sandboxes; that is harmless. Always check there are no `pageerror`s after editing the main script. A quote mark inside a single-quoted JS string once stopped the whole site from loading.

## Open items
- Duplicate or empty Yachts picture 9 left as is.
- Figures on some comparison images are disputed (the owner says two boats have the same range; image says 350 / 440).
- Spec-panel automation (blank panel then filled from web search) was demoed; the owner is still deciding. Prices must always be included.
- Phone view: two boat pictures stack with the joined title/text; works but has had little testing.

## Status (17 Oct 2026)
- Live on Railway: https://scintillating-cat-production-5a5a.up.railway.app (service "scintillating-cat", deploys from `main`, volume at `/data`, variables `ADMIN_PASSWORD` and `SESSION_SECRET` set). The old failed "Comparison-" service can be deleted.
- Work branch `claude/railway-server`; `main` matches it. Every change goes to both, and pushing `main` redeploys the site.
- Claude test copy (browser storage only): https://claude.ai/artifact/Dzc1eyKptDCtjYJMYjawDB
- Done today: Admin login, server saving and picture uploads, logo boxes fit and say "Drop or click here to add logo", Title joined also on the home holders, corner rounding, joined-title glow evened out, empty title frames at full brightness, separate title sizes for thumbnails and the enlarged picture (Small to Extra large), PNG/WebP/GIF logos stay transparent.
- Owner types thumbnail titles by hand; the "read title from image" feature can go.
- Next: clear out Back page options the owner finds over the top. Suggested candidates: page size meter, browser recovery copies and backups (server keeps 30 versions), the 7 traffic report pages (make one server-backed page), read title from image, the "Drop files here" tip, Back page appearance, headline styling and typing effect, the per-picture "Extra settings" switches, holder colour patterns, 3 custom backgrounds, extra corporate pages, "Example" watermarks, per-banner slideshow switches. Removing a switch must keep the current look.

## Status (18 Oct 2026)
- Saving: on the server every change is saved within 3 s (and when leaving the page). Save errors show a message. `/api/status` shows login, storage and saved-data state.
- The old "Comparison-" Railway service is deleted; only "scintillating-cat" (with volume) remains.
- The Claude test copy is NOT connected to Railway. Real content goes on the live site only.
- Done today: missing pictures are hidden (no "?" icon); Back page text and marker colour switches removed; Advertise example banner has no expand or link; "Together" renamed "Unison"; "Title frames" renamed "Show title"; Extra large headline 2pt smaller; "read title from image" removed; solid enlarged title bar; calmer V that follows the Frame brightness and Glow sliders; enlarged title bar grows for long names; title switch is Off/On (On also shows on the enlarged picture); thumbnail sizes Small/Medium/Large, enlarged sizes Medium/Large/Extra large; two-line title box in the Back page; only an over-long thumbnail title shrinks; pictures kept up to 2000px at quality 0.9; server makes 1000px `.t.` copies (sharp) for sub-page thumbnails; home holders use full pictures.
- The owner makes comparison pictures by hand in Final Cut Pro (Save Current Frame, PNG or JPEG, 1920x1080) and will remove names from the pictures and use darker backgrounds behind the spec boxes.

## Next session
1. Separate Back page: move the Admin to its own private, password-protected address (for example `/admin`) and remove the gear button from the public site. Visitors never see an Admin button. Keep login, auto-save and everything the Back page does now.
2. Speed: move the Railway service region from US East to EU West (Amsterdam) for UK visitors (scintillating-cat → Settings → Region). Slideshow background loading is already done (18 Oct).
3. Continue the Back page clear-out item by item. The owner shows a screenshot of each option; wait for their go-ahead before deleting anything.
