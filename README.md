# LEONIDA SIGNAL — GitHub Pages edition (v1.1)

**GTA VI streamer clip discovery, rights desk and editing queue.** Independent fan-media project, not affiliated with Rockstar Games. This edition is made for mobile browsers and GitHub Pages.

## What works now

- Responsive desktop + iPhone-friendly dashboard with Overview, Discovery, Watchlist, Rights Desk, Edit Pipeline and Settings.
- The **six selected CaseOh, Kai Cenat and Jynxzi Twitch source links** are bundled as **starter leads, NOT live API results**. They initially have zero views/unknown timestamps to avoid invented metadata.
- Users can manually add Twitch/YouTube/Kick clip links, review scores, organize the watchlist, write notes, track permission evidence and move clips through the pipeline.
- Production is blocked if rights clearance has not been recorded; publication still requires a human, the footage, valid permissions, original work and platform compliance.
- Browser localStorage retains **private editorial data on that device and browser only**. Export/import JSON in Settings for backups. No login or cross-device sync in this edition.
- After setup, GitHub Actions scans the official Twitch *Grand Theft Auto VI* category and configured watchlist and deploys updated **public metadata** to GitHub Pages approximately every 3 hours (schedules may be delayed by GitHub).
- On-page **Refresh** fetches the most recently deployed feed; it does **not** initiate an on-demand Twitch scan.

## Deploy

See **[SETUP.md](SETUP.md)** for the exact beginner-friendly steps.

Core files:

- `index.html`, `styles.css`, `app.js` — GitHub Pages website
- `data/latest.json` — published public data; contains initial six curated links until connected
- `.github/workflows/scan-and-publish.yml` — scheduled/manual Github Actions deployment
- `scripts/scan_twitch.py` — standard-library-only public Twitch metadata scanner
- `config/watchlist.json` — public scanner's source watchlist (edit THIS file to change cloud scan targets)

## Data architecture

GitHub-hosted static website → reads `data/latest.json` refreshed by GitHub Actions → merges public source metadata by Twitch clip ID or URL into **your browser-local editorial record** → rights/notes/stages stay on the device. No rights records, drafts or approval notes are sent to GitHub by this app.

**Not implemented:** shared cloud logins, multi-user workspace, direct Twitch/Kick/YouTube ingestion beyond the Twitch API, auto-downloading streamer videos, media editing, automatic social posting, or license verification. A public static site is not a secure database for personal records.

## Scanner technical details

- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are GitHub Actions **repository secrets**, never committed to a public file or written into `data/latest.json`.
- App access token to read `GET /helix/games`, `GET /helix/users` and `GET /helix/clips`. The scan fetches top clips in the last 48 hours and up to 15 additional clips for each configured creator, excluding clips from other games.
- Deduplicate by Twitch clip ID and publish up to 150 source records per scan. The score in the browser is a **review heuristic**, not an empirical prediction of popularity.
- Manual check: `python scripts/scan_twitch.py` (requires environment variables and network access).
- Offline tests: `python -m unittest discover -s scripts -v` (no network needed).
- GitHub Actions scheduled jobs can be delayed; public repositories can have schedules automatically disabled after 60 days of repo inactivity. Check the Actions tab periodically.

## Rights

The uploader/clipper may differ from the broadcaster and does not automatically grant reuse rights. Store written authorization, allowed platforms and terms for each clip or document another defensible legal basis. Twitch permission and Rockstar's game-video policy are separate. Merely crediting someone does not grant permission, and monetization eligibility depends on platform rules.
