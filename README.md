# The Comparison Society

A neon-styled price and spec comparison site (yachts, cars, motorbikes…), with a built-in Back page (Admin) opened from the gear button.

## How it works

- `public/index.html` – the whole site (from the Claude artifact version). When it runs on the server it:
  - asks for the admin password when the gear button is clicked,
  - uploads pictures to the server instead of keeping them inside the page (no 16 MB limit),
  - saves to the site through the server (**Save to site** and **Auto-save to site** both work),
  - sends click tracking to the server.
  
  Opened as a plain file, it still works the old way (browser storage only).
- `server.js` – a small Node/Express server. It keeps everything in one data folder:
  - `state.json` – the site data. The newest save wins, as before.
  - `history/` – the last 30 saved versions, in case a save needs undoing.
  - `uploads/` – the pictures.
  - `traffic.json` – click counts.
- `docs/HANDOFF-NOTES.md` – notes on how the page is put together.

## Deploying on Railway

1. In Railway: **New Project → Deploy from GitHub repo** → choose this repo.
2. Open the service → **Settings → Volumes → Add volume**, mount path `/data`. Pictures and site data live here. Without a volume they are lost on every redeploy.
3. Open **Variables** and add:
   - `ADMIN_PASSWORD` – the password for the Back page (pick a long one).
   - `SESSION_SECRET` – any long random text (keeps logins valid when you change the password).
4. **Settings → Networking → Generate Domain** to get a web address. You can add your own domain there later.

Railway sets `PORT` and the volume path automatically.

## Moving the pictures over

Open the old artifact site, go to Back page → **Download backup**. Then on the new site, log in, go to Back page → **Restore backup** and choose that file, then press **Save to site**. The server moves every picture out of the backup into its own file automatically.

## Running it on a computer

```
npm install
ADMIN_PASSWORD=choose-one npm start
```

Then open http://localhost:3000. Run `npm test` to run the server tests.
