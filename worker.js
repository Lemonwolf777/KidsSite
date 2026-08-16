const ALLOWED_CATEGORIES = new Set(["learn", "animals", "cartoons", "songs", "stories", "math"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function isAuthorized(request, env) {
  const supplied = request.headers.get("x-admin-pin") || "";
  return Boolean(env.ADMIN_PIN) && supplied === env.ADMIN_PIN;
}

function cleanVideo(input) {
  const title = String(input?.title || "").trim().slice(0, 120);
  const youtubeId = String(input?.id || input?.youtube_id || "").trim();
  const category = String(input?.category || "").trim();

  if (!title) return { error: "A video title is required." };
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) return { error: "Invalid YouTube video ID." };
  if (!ALLOWED_CATEGORIES.has(category)) return { error: "Invalid category." };

  return { title, youtubeId, category };
}

async function listVideos(env) {
  const result = await env.DB.prepare(
    "SELECT youtube_id AS id, title, category, created_at FROM videos ORDER BY id DESC"
  ).all();
  return result.results || [];
}

let statsTableReady = false;

async function ensureStatsTable(env) {
  if (statsTableReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS watch_stats (
      youtube_id TEXT NOT NULL,
      watch_date TEXT NOT NULL,
      plays INTEGER NOT NULL DEFAULT 0,
      seconds INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (youtube_id, watch_date)
    )
  `).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_watch_stats_date ON watch_stats(watch_date)"
  ).run();
  statsTableReady = true;
}

function cleanWatchInput(input) {
  const youtubeId = String(input?.id || "").trim();
  const watchDate = String(input?.date || "").trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) return { error: "Invalid video ID." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(watchDate)) return { error: "Invalid viewing date." };
  return { youtubeId, watchDate };
}

async function approvedVideoExists(env, youtubeId) {
  const row = await env.DB.prepare("SELECT youtube_id FROM videos WHERE youtube_id = ?1").bind(youtubeId).first();
  return Boolean(row);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (!env.DB) return json({ error: "D1 database binding DB is missing." }, 503);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ ok: true, database: true, adminPinConfigured: Boolean(env.ADMIN_PIN) });
      }

      if (url.pathname === "/api/videos" && request.method === "GET") {
        return json({ videos: await listVideos(env) });
      }

      if (url.pathname === "/api/watch/start" && request.method === "POST") {
        await ensureStatsTable(env);
        const input = cleanWatchInput(await request.json());
        if (input.error) return json({ error: input.error }, 400);
        if (!(await approvedVideoExists(env, input.youtubeId))) return json({ error: "Video is not approved." }, 404);

        await env.DB.prepare(`
          INSERT INTO watch_stats (youtube_id, watch_date, plays, seconds)
          VALUES (?1, ?2, 1, 0)
          ON CONFLICT(youtube_id, watch_date) DO UPDATE SET plays = plays + 1
        `).bind(input.youtubeId, input.watchDate).run();
        return json({ ok: true });
      }

      if (url.pathname === "/api/watch/time" && request.method === "POST") {
        await ensureStatsTable(env);
        const body = await request.json();
        const input = cleanWatchInput(body);
        if (input.error) return json({ error: input.error }, 400);
        const seconds = Math.max(1, Math.min(300, Math.floor(Number(body?.seconds) || 0)));
        if (!(await approvedVideoExists(env, input.youtubeId))) return json({ error: "Video is not approved." }, 404);

        await env.DB.prepare(`
          INSERT INTO watch_stats (youtube_id, watch_date, plays, seconds)
          VALUES (?1, ?2, 0, ?3)
          ON CONFLICT(youtube_id, watch_date) DO UPDATE SET seconds = seconds + excluded.seconds
        `).bind(input.youtubeId, input.watchDate, seconds).run();
        return json({ ok: true });
      }

      if (url.pathname === "/api/stats" && request.method === "GET") {
        if (!env.ADMIN_PIN) return json({ error: "ADMIN_PIN secret is not configured yet." }, 503);
        if (!isAuthorized(request, env)) return json({ error: "Not authorized." }, 401);
        await ensureStatsTable(env);
        const from = String(url.searchParams.get("from") || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return json({ error: "Invalid start date." }, 400);

        const result = await env.DB.prepare(`
          SELECT
            s.watch_date,
            s.youtube_id AS id,
            COALESCE(v.title, 'Removed video') AS title,
            COALESCE(v.category, 'other') AS category,
            s.plays,
            s.seconds
          FROM watch_stats s
          LEFT JOIN videos v ON v.youtube_id = s.youtube_id
          WHERE s.watch_date >= ?1
          ORDER BY s.watch_date ASC, s.seconds DESC, s.plays DESC
        `).bind(from).all();
        return json({ rows: result.results || [] });
      }


      if (url.pathname === "/api/stats/reset" && request.method === "DELETE") {
        if (!env.ADMIN_PIN) return json({ error: "ADMIN_PIN secret is not configured yet." }, 503);
        if (!isAuthorized(request, env)) return json({ error: "Not authorized." }, 401);
        await ensureStatsTable(env);
        await env.DB.prepare("DELETE FROM watch_stats").run();
        return json({ ok: true });
      }

      if (url.pathname === "/api/auth" && request.method === "POST") {
        if (!env.ADMIN_PIN) return json({ error: "ADMIN_PIN secret is not configured yet." }, 503);
        if (!isAuthorized(request, env)) return json({ error: "Wrong parent PIN." }, 401);
        return json({ ok: true });
      }

      if (url.pathname === "/api/videos" && request.method === "POST") {
        if (!env.ADMIN_PIN) return json({ error: "ADMIN_PIN secret is not configured yet." }, 503);
        if (!isAuthorized(request, env)) return json({ error: "Not authorized." }, 401);

        const input = cleanVideo(await request.json());
        if (input.error) return json({ error: input.error }, 400);

        await env.DB.prepare(
          `INSERT INTO videos (title, youtube_id, category)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(youtube_id) DO UPDATE SET
             title = excluded.title,
             category = excluded.category`
        ).bind(input.title, input.youtubeId, input.category).run();

        return json({ ok: true, videos: await listVideos(env) }, 201);
      }

      if (url.pathname === "/api/videos/import" && request.method === "POST") {
        if (!env.ADMIN_PIN) return json({ error: "ADMIN_PIN secret is not configured yet." }, 503);
        if (!isAuthorized(request, env)) return json({ error: "Not authorized." }, 401);

        const body = await request.json();
        const incoming = Array.isArray(body?.videos) ? body.videos.slice(0, 100) : [];
        if (!incoming.length) return json({ error: "No videos supplied." }, 400);

        const statements = [];
        for (const raw of incoming) {
          const input = cleanVideo(raw);
          if (input.error) continue;
          statements.push(
            env.DB.prepare(
              `INSERT INTO videos (title, youtube_id, category)
               VALUES (?1, ?2, ?3)
               ON CONFLICT(youtube_id) DO UPDATE SET
                 title = excluded.title,
                 category = excluded.category`
            ).bind(input.title, input.youtubeId, input.category)
          );
        }

        if (!statements.length) return json({ error: "No valid videos found to import." }, 400);
        await env.DB.batch(statements);
        return json({ ok: true, imported: statements.length, videos: await listVideos(env) });
      }

      if (url.pathname.startsWith("/api/videos/") && request.method === "DELETE") {
        if (!env.ADMIN_PIN) return json({ error: "ADMIN_PIN secret is not configured yet." }, 503);
        if (!isAuthorized(request, env)) return json({ error: "Not authorized." }, 401);

        const youtubeId = decodeURIComponent(url.pathname.slice("/api/videos/".length));
        if (!/^[A-Za-z0-9_-]{6,20}$/.test(youtubeId)) return json({ error: "Invalid video ID." }, 400);

        await env.DB.prepare("DELETE FROM videos WHERE youtube_id = ?1").bind(youtubeId).run();
        return json({ ok: true });
      }

      return json({ error: "API route not found." }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "KidsSite cloud service had a problem. Please try again." }, 500);
    }
  }
};
