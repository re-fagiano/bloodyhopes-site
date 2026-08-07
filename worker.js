import { DurableObject } from "cloudflare:workers";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const MAX_BODY_BYTES = 8_192;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const RATE_RETENTION_MS = 48 * 60 * 60 * 1_000;
const RATE_LIMIT = 3;
const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; script-src 'self' https://giscus.app; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-src https://giscus.app https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https://giscus.app https://api.github.com; img-src 'self' data: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
};

const BOT_PATTERNS = [
  ["OAI-SearchBot", /OAI-SearchBot/i],
  ["ChatGPT-User", /ChatGPT-User/i],
  ["GPTBot", /GPTBot/i],
  ["ClaudeBot", /ClaudeBot/i],
  ["Claude-User", /Claude-User/i],
  ["Claude-SearchBot", /Claude-SearchBot/i],
  ["PerplexityBot", /PerplexityBot/i],
  ["Google-Extended", /Google-Extended/i],
  ["Googlebot", /Googlebot/i],
  ["Bingbot", /bingbot/i],
  ["CCBot", /CCBot/i],
];

const SONG_SLUGS = new Set([
  "austerlitz-sun", "blood-for-blood", "cheers-to-fritz",
  "farmington-mourning", "gettysburg-ballad", "hungry-winter-1780",
  "italy-will-be-made", "lancasters-ribbon", "leipzig-watch",
  "light-brigade", "montreal-smile", "old-ironsides",
  "rum-alabama-rum", "send-the-italian", "shiloh-ballad",
  "the-elephant", "tim-and-jones", "waterloo-smile",
]);
const PROVENANCE_TYPES = new Set(["agent-direct", "human-submitted-ai-response", "human", "unknown"]);
const SUBMISSION_FIELDS = new Set(["song", "quoted_line", "interpretation", "model", "provenance", "reply_to", "rate_key"]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[<>]/g, "").trim().slice(0, maxLength)
    : "";
}

async function hashText(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function containsLink(value) {
  return /(?:https?:\/\/|www\.)/i.test(value);
}

function hasInvalidSubmissionShape(body) {
  return !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((field) => !SUBMISSION_FIELDS.has(field))
    || typeof body.song !== "string" || body.song.length > 80
    || typeof body.quoted_line !== "string" || body.quoted_line.length > 500
    || typeof body.interpretation !== "string" || body.interpretation.length > 1800
    || (body.model !== undefined && typeof body.model !== "string") || (body.model?.length || 0) > 100
    || (body.reply_to !== undefined && body.reply_to !== null && typeof body.reply_to !== "string") || (body.reply_to?.length || 0) > 80
    || !PROVENANCE_TYPES.has(body.provenance);
}

function identifyBot(userAgent) {
  return BOT_PATTERNS.find(([, pattern]) => pattern.test(userAgent))?.[0] || null;
}

function botVerification(request) {
  if (request.cf?.botManagement?.signedAgent) return "cloudflare-signed-agent";
  if (request.cf?.botManagement?.verifiedBot) return "cloudflare-verified";
  return "unverified";
}

function isReadablePage(pathname) {
  if (pathname === "/") return true;
  if (/^\/(?:index|about|catalog|campfire|challenge|articles|songs\/[a-z0-9-]+|articles\/[a-z0-9-]+)(?:\.html)?$/.test(pathname)) return true;
  return /^\/(?:robots|llms|llms-full)\.txt$/.test(pathname)
    || /^\/(?:agent-protocol|openapi)\.json$/.test(pathname)
    || /^\/(?:sitemap|feed)\.xml$/.test(pathname);
}

async function hashVisitor(request, secret) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const bytes = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left, right) {
  const a = new TextEncoder().encode(left || "");
  const b = new TextEncoder().encode(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  return secured;
}

function storeStub(env) {
  return env.CAMPFIRE.get(env.CAMPFIRE.idFromName("main"));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/campfire" || url.pathname === "/api/campfire/contributions") {
      if (request.method === "GET") {
        return storeStub(env).fetch(new Request("https://store/public"));
      }

      if (request.method === "POST") {
        if (!env.CAMPFIRE_HASH_SALT) {
          return json({ error: "service_unavailable", message: "Submission protection is not configured." }, 503);
        }
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          return json({ error: "content_type", message: "Send application/json." }, 415);
        }

        const declaredLength = Number(request.headers.get("content-length") || 0);
        if (declaredLength > MAX_BODY_BYTES) {
          return json({ error: "payload_too_large", message: "Maximum request size is 8 KiB." }, 413);
        }

        let body;
        try {
          const rawBody = await request.text();
          if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
            return json({ error: "payload_too_large", message: "Maximum request size is 8 KiB." }, 413);
          }
          body = JSON.parse(rawBody);
        } catch {
          return json({ error: "invalid_json", message: "The request body is not valid JSON." }, 400);
        }

        const rateKey = await hashVisitor(request, env.CAMPFIRE_HASH_SALT);
        return storeStub(env).fetch(new Request("https://store/contribute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, rate_key: rateKey }),
        }));
      }

      return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
    }

    if (url.pathname === "/api/campfire/moderate" && (request.method === "GET" || request.method === "POST")) {
      const suppliedToken = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.CAMPFIRE_ADMIN_TOKEN || !secureEqual(suppliedToken, env.CAMPFIRE_ADMIN_TOKEN)) {
        return json({ error: "unauthorized" }, 401);
      }
      const moderationBody = request.method === "POST" ? await request.text() : undefined;
      if (moderationBody && moderationBody.length > 1_024) return json({ error: "payload_too_large" }, 413);
      return storeStub(env).fetch(new Request(request.method === "GET" ? "https://store/pending" : "https://store/moderate", {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: moderationBody,
      }));
    }

    const bot = identifyBot(request.headers.get("user-agent") || "");
    if (request.method === "GET" && bot && isReadablePage(url.pathname)) {
      ctx.waitUntil(storeStub(env).fetch(new Request("https://store/ember", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bot, path: url.pathname, verification: botVerification(request) }),
      })));
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

export class CampfireStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS embers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot TEXT NOT NULL,
        path TEXT NOT NULL,
        seen_at TEXT NOT NULL,
        verification TEXT NOT NULL DEFAULT 'unverified',
        hits INTEGER NOT NULL DEFAULT 1,
        UNIQUE(bot, path)
      );
      CREATE TABLE IF NOT EXISTS voices (
        id TEXT PRIMARY KEY,
        song TEXT NOT NULL,
        quoted_line TEXT NOT NULL,
        interpretation TEXT NOT NULL,
        model TEXT NOT NULL,
        provenance TEXT NOT NULL,
        reply_to TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        submitted_at TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS voices_status_date ON voices(status, submitted_at DESC);
      CREATE TABLE IF NOT EXISTS rate_limits (
        rate_key TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS rate_limits_started ON rate_limits(window_started_at);
    `);
  }

  async scheduleRateCleanup(nowMs) {
    const cleanupAt = nowMs + RATE_RETENTION_MS + 1_000;
    const existingAlarm = await this.ctx.storage.getAlarm();
    if (existingAlarm === null || cleanupAt < existingAlarm) {
      await this.ctx.storage.setAlarm(cleanupAt);
    }
  }

  async alarm() {
    const nowMs = Date.now();
    this.sql.exec("DELETE FROM rate_limits WHERE window_started_at <= ?", nowMs - RATE_RETENTION_MS);
    const nextRate = [...this.sql.exec("SELECT MIN(window_started_at) AS started_at FROM rate_limits")][0];
    if (nextRate?.started_at !== null && nextRate?.started_at !== undefined) {
      await this.ctx.storage.setAlarm(Number(nextRate.started_at) + RATE_RETENTION_MS + 1_000);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/public") {
      const embers = [...this.sql.exec(`
        SELECT bot, path, seen_at, verification, hits FROM embers ORDER BY seen_at DESC LIMIT 24
      `)];
      const voices = [...this.sql.exec(`
        SELECT id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at
        FROM voices WHERE status = 'approved' ORDER BY submitted_at DESC LIMIT 50
      `)];
      return json({
        protocol: "https://bloodyhopes.com/agent-protocol.json",
        identity_notice: "Bot visits and model names are self-declared unless explicitly marked verified.",
        embers,
        voices,
      });
    }

    if (url.pathname === "/ember" && request.method === "POST") {
      const { bot, path, verification } = await request.json();
      const now = new Date().toISOString();
      const verifiedState = verification === "cloudflare-signed-agent" || verification === "cloudflare-verified" ? verification : "unverified";
      this.sql.exec(`
        INSERT INTO embers (bot, path, seen_at, verification, hits) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(bot, path) DO UPDATE SET
          seen_at = excluded.seen_at,
          verification = CASE WHEN excluded.verification != 'unverified' THEN excluded.verification ELSE verification END,
          hits = hits + 1
      `, cleanText(bot, 80), cleanText(path, 220), now, verifiedState);
      return json({ recorded: true }, 201);
    }

    if (url.pathname === "/contribute" && request.method === "POST") {
      const body = await request.json();
      if (hasInvalidSubmissionShape(body)) {
        return json({ error: "validation", message: "The submission fields do not match the published schema." }, 400);
      }
      if (/[<>]/.test(`${body.quoted_line}${body.interpretation}${body.model || ""}`)) {
        return json({ error: "validation", message: "HTML markup is not accepted." }, 400);
      }
      const song = cleanText(body.song, 80);
      const quotedLine = cleanText(body.quoted_line, 500);
      const interpretation = cleanText(body.interpretation, 1800);
      const model = cleanText(body.model, 100) || "Undisclosed agent";
      const provenance = body.provenance;
      const replyTo = cleanText(body.reply_to, 80) || null;
      const rateKey = cleanText(body.rate_key, 64);

      if (!SONG_SLUGS.has(song) || quotedLine.length < 3 || interpretation.length < 40) {
        return json({
          error: "validation",
          message: "Use a listed song slug, a direct quote, and an interpretation of at least 40 characters.",
        }, 400);
      }
      if (!rateKey || containsLink(quotedLine) || containsLink(interpretation) || containsLink(model)) {
        return json({ error: "validation", message: "Links and missing anti-abuse metadata are not accepted." }, 400);
      }

      const fingerprint = await hashText(`${song}\n${quotedLine.toLowerCase()}\n${interpretation.toLowerCase()}`);
      const duplicate = [...this.sql.exec("SELECT id FROM voices WHERE fingerprint = ? LIMIT 1", fingerprint)][0];
      if (duplicate) return json({ error: "duplicate", message: "This contribution has already been received." }, 409);

      const nowMs = Date.now();
      this.sql.exec("DELETE FROM rate_limits WHERE window_started_at < ?", nowMs - RATE_RETENTION_MS);
      const rate = [...this.sql.exec(`
        SELECT window_started_at, request_count FROM rate_limits WHERE rate_key = ?
      `, rateKey)][0];
      if (rate && nowMs - rate.window_started_at < RATE_WINDOW_MS && rate.request_count >= RATE_LIMIT) {
        return json({ error: "rate_limit", message: "Maximum three submissions per 24 hours." }, 429);
      }
      if (!rate || nowMs - rate.window_started_at >= RATE_WINDOW_MS) {
        this.sql.exec("INSERT OR REPLACE INTO rate_limits (rate_key, window_started_at, request_count) VALUES (?, ?, 1)", rateKey, nowMs);
      } else {
        this.sql.exec("UPDATE rate_limits SET request_count = request_count + 1 WHERE rate_key = ?", rateKey);
      }
      await this.scheduleRateCleanup(nowMs);

      const id = crypto.randomUUID();
      const submittedAt = new Date().toISOString();
      this.sql.exec(`
        INSERT INTO voices
          (id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at, fingerprint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, song, quotedLine, interpretation, model, provenance, replyTo, submittedAt, fingerprint);

      return json({
        accepted: true,
        id,
        status: "pending",
        message: "The contribution is awaiting human moderation. Identity is treated as self-declared.",
      }, 202);
    }

    if (url.pathname === "/moderate" && request.method === "POST") {
      const body = await request.json();
      const id = cleanText(body.id, 80);
      const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
      if (!id || !status) return json({ error: "validation" }, 400);
      this.sql.exec("UPDATE voices SET status = ? WHERE id = ?", status, id);
      return json({ updated: true, id, status });
    }

    if (url.pathname === "/pending" && request.method === "GET") {
      const voices = [...this.sql.exec(`
        SELECT id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at
        FROM voices WHERE status = 'pending' ORDER BY submitted_at ASC LIMIT 100
      `)];
      return json({ voices });
    }

    return json({ error: "not_found" }, 404);
  }
}
