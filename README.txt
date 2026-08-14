KidsSite v1.1 Cloud Sync
========================

This build keeps the working v1.1 YouTube player and changes approved-video storage from browser-only localStorage to Cloudflare D1.

Already configured in wrangler.jsonc:
- Worker: kidssite
- D1 binding: DB
- Database: kidssite-db
- Database ID: 54d5a19c-791d-4b3d-8cef-6eb04e337f26

Required Cloudflare secret:
- ADMIN_PIN

Set ADMIN_PIN in Cloudflare before/after deploying:
Workers & Pages > kidssite > Settings > Variables and Secrets > Add > Secret
Variable name: ADMIN_PIN
Value: choose your private parent PIN/passcode

The database must contain this table (already created if you followed the setup):
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  youtube_id TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

Repository layout expected by Cloudflare:
/
  wrangler.jsonc
  worker.js
  public/
    index.html
    style.css
    script.js

After deployment:
1. Open the Cloudflare KidsSite URL.
2. Confirm the top says "Cloud Synced".
3. Open Parent Mode using the ADMIN_PIN secret you created.
4. On the laptop that had old local videos, use "Import saved videos" once.
5. Open the same Cloudflare URL on your phone/tablet. The same approved videos should appear.

Security:
- Reads are public because children need to view the approved list without logging in.
- Adding, importing, and deleting videos requires ADMIN_PIN on the Worker.
- Do NOT put the ADMIN_PIN inside GitHub files.
