# Launch LEONIDA SIGNAL with GitHub (desktop setup, phone access afterward)

## A. Create the GitHub repository

1. On a Windows computer, download and **extract** `LEONIDA_SIGNAL_GitHub_Ready.zip`. **Do not upload the ZIP as a single file.**
2. Open https://github.com/new while signed into GitHub.
3. Repository name: `leonida-signal`. Visibility: **Public** (compatible with GitHub Free Pages). Do not check "Add a README"; the package has one. Click **Create repository**.
4. Choose **uploading an existing file** (or **Add file → Upload files**). Drag **the contents of the extracted folder** into the browser, preserving `.github/workflows/`, `scripts/`, `config/`, `data/`, and the root-level files. GitHub supports dragging folders. Commit to `main`. The workflow file must end up at exactly `.github/workflows/scan-and-publish.yml`, not inside another wrapper folder.

## B. Publish the mobile website

5. In the repo open **Settings → Pages**, set **Source = GitHub Actions**. GitHub's workflow suggestions aren't needed; this package has its own.
6. Open **Actions** and select **Scan Twitch and publish Leonida Signal**. If needed, enable workflows. Click **Run workflow → Run workflow** on `main`. Wait for a green deployment result.
7. Open **Settings → Pages** and follow the website URL, normally `https://YOUR-USERNAME.github.io/leonida-signal/`. Open it on your iPhone via Safari. Use Safari **Share → Add to Home Screen** to keep the shortcut.

At this point the site is live with six curated Twitch clip links, seven watchlist candidates and private manual rights/editing features. The Twitch feed is **not** live yet.

## C. Enable automatic Twitch discovery

8. Visit https://dev.twitch.tv/console/apps and register a Twitch application. Use a confidential client type (server-side app) if offered. Follow Twitch's current application settings; you'll get a **Client ID** and **Client Secret**. These credentials belong to Twitch, not GitHub.
9. In GitHub go to your repository's **Settings → Secrets and variables → Actions → New repository secret**. Create **two secrets**, exactly named:
   - `TWITCH_CLIENT_ID` — your Twitch application's client ID
   - `TWITCH_CLIENT_SECRET` — your Twitch application's client secret
10. Do not put either value into a text file in the repository, and do not paste the Client Secret into chat. In **Actions**, run **Scan Twitch and publish Leonida Signal** again. Open the site after the run completes and click **Refresh**. The sidebar will show the public feed status.
11. The workflow is scheduled every 3 hours, with a potential GitHub delay. For an immediate fresh scan, manually run the GitHub Action; pressing **Refresh** inside the app only reloads already-published data.

## D. Watchlist changes

- The 7 creator handles used by the cloud scanner are in GitHub's `config/watchlist.json`. Edit this file in GitHub and commit. The next workflow run uses the revised list.
- The watchlist visible in your app can be edited independently **for your own review and ranking**, but these browser edits do not change the cloud scanning list or synchronize across devices.
- If the Twitch game category is not indexed, the website reports that honestly instead of claiming clips were retrieved.

## E. Data and privacy

- This is a public GitHub Pages website. The public clip feed and source code are visible to anyone, while your rights notes and approvals live in your browser storage. Do not store passwords, identity documents, or highly sensitive records inside the rights desk.
- For an iPhone-to-PC transfer, go to **Settings → Export JSON** on the old device, transfer that JSON file privately, then use **Settings → Import JSON** on the new one. This replaces the local workspace; do regular backups.
- GitHub Pages has no server/database for authenticated cross-device sync. That needs a future backend (e.g. an authenticated hosted database), not just a GitHub account.

## Troubleshooting

- **404 / site not found:** Confirm Pages source is GitHub Actions, workflow deployment was green, and you are opening the repo's Pages URL, not the GitHub code URL.
- **The site loads but no fresh clips:** Confirm `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are set in Actions secrets; run the workflow again, then refresh the site. Check Actions logs for errors. The feed file at `data/latest.json` shows status but never contains secrets.
- **GitHub Actions workflow is missing:** Make sure `.github/workflows/scan-and-publish.yml` was uploaded, with the `.github` folder included.
- **Mobile UI doesn't persist on another device:** That's expected: browser-local storage does not automatically sync. Export/import backups.
- **No live streaming immediately:** The workflow is scheduled and may be delayed. Use **Actions → Run workflow** to initiate a scan.

## Important

This project discovers public source links; it does not automatically authorize redistribution. Get permission (or document a valid legal basis) and make genuinely original editorial content before reposting. Keep creator/license approvals secure. Read `README.md` for technical details.
