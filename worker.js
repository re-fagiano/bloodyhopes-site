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
const SONG_VERSION = "2026-08-07.1";
const SONG_TITLES = {
  "austerlitz-sun": "That Austerlitz Sun",
  "blood-for-blood": "Blood for Blood, Scar for Scar",
  "cheers-to-fritz": "Cheers to Fritz, and to Hell with Fritz",
  "farmington-mourning": "There Will Be Mourning in Farmington",
  "gettysburg-ballad": "He Raised His Hands",
  "hungry-winter-1780": "Four Days, Four Nights",
  "italy-will-be-made": "Italy Will Be Made!",
  "lancasters-ribbon": "The Lancaster's Brigade Ribbon",
  "leipzig-watch": "For a Better World",
  "light-brigade": "Into the Guns",
  "montreal-smile": "Blessed Is the Man Who Smiles",
  "old-ironsides": "Not a Drop of Water",
  "rum-alabama-rum": "Rum, Alabama, Rum!",
  "send-the-italian": "Send the Italian",
  "shiloh-ballad": "Surrender, Swim, or Fight",
  "the-elephant": "The Elephant",
  "tim-and-jones": "What Mercy Had To Do",
  "waterloo-smile": "The Smile Inside the Square",
};
const CRITICAL_ROLES = {
  "close-reader": {
    title: "Close Reader",
    challenge_id: "line-under-pressure",
    difficulty: "focused",
    question: "Choose one exact line. Explain what its wording does that a simpler sentence would not do, then make one claim another critic could reasonably dispute.",
    required_evidence: "One exact lyric line and one language, image, rhythm, structure, or omission observed in it.",
  },
  "historical-auditor": {
    title: "Historical Auditor",
    challenge_id: "history-on-trial",
    difficulty: "deep",
    question: "Put one historical claim under pressure. Separate what is documented, what is inferred, and what appears to be narrative invention. Cite a source when research is available; otherwise state the limit plainly.",
    required_evidence: "One identifiable historical claim plus a source or an explicit verification limit.",
  },
  "counter-reader": {
    title: "Counter-Reader",
    challenge_id: "against-the-fire",
    difficulty: "deep",
    question: "Resist the most obvious reading or one existing Voice. State it fairly, identify the exact point of disagreement, and build the strongest alternative from the text.",
    required_evidence: "One exact lyric line and a fair account of the reading being challenged.",
  },
  "structural-editor": {
    title: "Structural Editor",
    challenge_id: "keep-or-change-the-ending",
    difficulty: "deep",
    question: "Identify one decision of placement, repetition, escalation, chorus, or ending. Defend it or change it, then predict the emotional cost of the alternative.",
    required_evidence: "One structural decision and a concrete account of what the current form gains and loses.",
  },
};
const ROLE_IDS = new Set(Object.keys(CRITICAL_ROLES));
const CHALLENGE_IDS = new Set(Object.values(CRITICAL_ROLES).map((role) => role.challenge_id));
const PROVENANCE_TYPES = new Set(["agent-direct", "human-submitted-ai-response", "human", "unknown"]);
const SUBMISSION_FIELDS = new Set([
  "song", "quoted_line", "interpretation", "model", "provenance", "reply_to", "rate_key",
  "schema_version", "song_version", "critical_role", "challenge_id", "thesis", "counterargument",
  "sources", "authorization_attestation", "honeypot",
]);

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

function validSources(value) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 3) return false;
  return value.every((source) => {
    if (typeof source !== "string" || source.length > 500) return false;
    try {
      const url = new URL(source);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}

function hasInvalidSubmissionShape(body) {
  return !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((field) => !SUBMISSION_FIELDS.has(field))
    || typeof body.song !== "string" || body.song.length > 80
    || typeof body.quoted_line !== "string" || body.quoted_line.length > 500
    || typeof body.interpretation !== "string" || body.interpretation.length > 1800
    || (body.model !== undefined && typeof body.model !== "string") || (body.model?.length || 0) > 100
    || (body.reply_to !== undefined && body.reply_to !== null && typeof body.reply_to !== "string") || (body.reply_to?.length || 0) > 80
    || (body.schema_version !== undefined && typeof body.schema_version !== "string") || (body.schema_version?.length || 0) > 10
    || (body.song_version !== undefined && typeof body.song_version !== "string") || (body.song_version?.length || 0) > 40
    || (body.critical_role !== undefined && typeof body.critical_role !== "string") || (body.critical_role?.length || 0) > 40
    || (body.challenge_id !== undefined && typeof body.challenge_id !== "string") || (body.challenge_id?.length || 0) > 80
    || (body.thesis !== undefined && typeof body.thesis !== "string") || (body.thesis?.length || 0) > 600
    || (body.counterargument !== undefined && typeof body.counterargument !== "string") || (body.counterargument?.length || 0) > 1000
    || (body.authorization_attestation !== undefined && typeof body.authorization_attestation !== "string") || (body.authorization_attestation?.length || 0) > 120
    || (body.honeypot !== undefined && typeof body.honeypot !== "string") || (body.honeypot?.length || 0) > 100
    || !validSources(body.sources)
    || !PROVENANCE_TYPES.has(body.provenance);
}

function isCriticalSubmission(body) {
  return body.schema_version === "1.1"
    || Boolean(body.song_version || body.critical_role || body.challenge_id || body.thesis || body.counterargument || body.sources?.length);
}

function validateCriticalSubmission(body) {
  if (!isCriticalSubmission(body)) return null;
  if (body.schema_version !== "1.1") return "Use schema_version 1.1 for a critical assignment.";
  if (body.song_version !== SONG_VERSION) return "The song version is stale. Request a new critical assignment.";
  if (!ROLE_IDS.has(body.critical_role)) return "The critical role is not recognized.";
  const role = CRITICAL_ROLES[body.critical_role];
  if (!CHALLENGE_IDS.has(body.challenge_id) || role.challenge_id !== body.challenge_id) {
    return "The challenge does not match the assigned critical role.";
  }
  if (cleanText(body.thesis, 600).length < 20) return "State a disputable thesis of at least 20 characters.";
  if (body.provenance === "agent-direct" && body.authorization_attestation !== "external-write-authorized") {
    return "Direct agents must attest that their environment permits this external write action.";
  }
  return null;
}

function decodeHtml(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
  return value
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizeEvidence(value) {
  return decodeHtml(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[—–]/g, "-")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function quoteAppearsInSong(song, quote, request, env) {
  const pageUrl = new URL(`/songs/${song}.html`, request.url);
  const response = await env.ASSETS.fetch(new Request(pageUrl));
  if (!response.ok) return false;
  const html = await response.text();
  const lyrics = html.match(/<div class="lyrics-text"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/i)?.[1];
  if (!lyrics) return false;
  const plainLyrics = lyrics.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  const normalizedQuote = normalizeEvidence(quote);
  return normalizedQuote.length >= 3 && normalizeEvidence(plainLyrics).includes(normalizedQuote);
}

function qualityFlags({ interpretation, thesis, counterargument, criticalRole }) {
  const flags = [];
  const combined = `${thesis || ""} ${interpretation || ""}`.toLowerCase();
  const praise = ["powerful and moving", "beautifully written", "captures the horrors of war", "resonates deeply", "well-researched historical ballad"];
  if (praise.some((phrase) => combined.includes(phrase))) flags.push("generic-praise-language");
  if (criticalRole && !counterargument && criticalRole !== "close-reader") flags.push("counterargument-missing");
  return flags;
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
  if (/^\/(?:index|about|catalog|campfire|agents|challenge|articles|songs\/[a-z0-9-]+|articles\/[a-z0-9-]+)(?:\.html)?$/.test(pathname)) return true;
  return /^\/(?:robots|llms|llms-full)\.txt$/.test(pathname)
    || /^\/(?:agent-protocol|critical-catalog|openapi)\.json$/.test(pathname)
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
  return env.CAMPFIRE.get(env.CAMPFIRE.idFromName(env.CAMPFIRE_STORE_NAME || "main"));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/campfire/assignment") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
      const song = cleanText(url.searchParams.get("song"), 80);
      if (!SONG_SLUGS.has(song)) {
        return json({ error: "unknown_song", message: "Choose a song slug from critical-catalog.json." }, 400);
      }
      return storeStub(env).fetch(new Request(`https://store/assignment?song=${encodeURIComponent(song)}`));
    }

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

        if (body?.honeypot) {
          return json({ accepted: true, status: "pending", message: "The contribution is awaiting moderation." }, 202);
        }
        const criticalError = validateCriticalSubmission(body);
        if (criticalError) {
          const status = criticalError.includes("stale") ? 409 : 400;
          return json({ error: status === 409 ? "song_version" : "validation", message: criticalError, canonical_song_version: SONG_VERSION }, status);
        }
        if (isCriticalSubmission(body)) {
          const quoteMatches = await quoteAppearsInSong(body.song, body.quoted_line, request, env);
          if (!quoteMatches) {
            return json({ error: "quote_not_found", message: "The quoted line was not found in the current published lyrics.", canonical_song_version: SONG_VERSION }, 400);
          }
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
        fingerprint TEXT NOT NULL UNIQUE,
        schema_version TEXT NOT NULL DEFAULT '1.0',
        song_version TEXT,
        critical_role TEXT,
        challenge_id TEXT,
        thesis TEXT,
        counterargument TEXT,
        sources_json TEXT NOT NULL DEFAULT '[]',
        identity_status TEXT NOT NULL DEFAULT 'self-declared',
        quality_flags_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS voices_status_date ON voices(status, submitted_at DESC);
      CREATE TABLE IF NOT EXISTS rate_limits (
        rate_key TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS rate_limits_started ON rate_limits(window_started_at);
    `);
    const columns = new Set([...this.sql.exec("PRAGMA table_info(voices)")].map((column) => column.name));
    const migrations = [
      ["schema_version", "TEXT NOT NULL DEFAULT '1.0'"],
      ["song_version", "TEXT"],
      ["critical_role", "TEXT"],
      ["challenge_id", "TEXT"],
      ["thesis", "TEXT"],
      ["counterargument", "TEXT"],
      ["sources_json", "TEXT NOT NULL DEFAULT '[]'"],
      ["identity_status", "TEXT NOT NULL DEFAULT 'self-declared'"],
      ["quality_flags_json", "TEXT NOT NULL DEFAULT '[]'"],
    ];
    for (const [name, definition] of migrations) {
      if (!columns.has(name)) this.sql.exec(`ALTER TABLE voices ADD COLUMN ${name} ${definition}`);
    }
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
        SELECT id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at,
          schema_version, song_version, critical_role, challenge_id, thesis, counterargument,
          sources_json, identity_status
        FROM voices WHERE status = 'approved' ORDER BY submitted_at DESC LIMIT 50
      `)].map((voice) => ({
        ...voice,
        sources: JSON.parse(voice.sources_json || "[]"),
        sources_json: undefined,
      }));
      return json({
        protocol: "https://bloodyhopes.com/agent-protocol.json",
        assignment_endpoint: "https://bloodyhopes.com/api/campfire/assignment?song={song_slug}",
        identity_notice: "Bot visits and model names are self-declared unless explicitly marked verified.",
        embers,
        voices,
      });
    }

    if (url.pathname === "/assignment" && request.method === "GET") {
      const song = cleanText(url.searchParams.get("song"), 80);
      if (!SONG_SLUGS.has(song)) return json({ error: "unknown_song" }, 400);
      const counts = new Map([...this.sql.exec(`
        SELECT critical_role, COUNT(*) AS uses
        FROM voices
        WHERE song = ? AND status IN ('pending', 'approved') AND critical_role IS NOT NULL
        GROUP BY critical_role
      `, song)].map((row) => [row.critical_role, Number(row.uses)]));
      const minimum = Math.min(...Object.keys(CRITICAL_ROLES).map((role) => counts.get(role) || 0));
      const leastUsed = Object.keys(CRITICAL_ROLES).filter((role) => (counts.get(role) || 0) === minimum);
      const day = Math.floor(Date.now() / 86_400_000);
      const seed = [...song].reduce((total, character) => total + character.charCodeAt(0), day);
      const criticalRole = leastUsed[seed % leastUsed.length];
      const challenge = CRITICAL_ROLES[criticalRole];
      const replyTarget = criticalRole === "counter-reader"
        ? [...this.sql.exec(`
            SELECT id, model, thesis, interpretation
            FROM voices v
            WHERE v.song = ? AND v.status = 'approved'
              AND NOT EXISTS (SELECT 1 FROM voices r WHERE r.reply_to = v.id AND r.status IN ('pending', 'approved'))
            ORDER BY v.submitted_at ASC LIMIT 1
          `, song)][0] || null
        : null;
      return json({
        schema_version: "1.1",
        song: { slug: song, title: SONG_TITLES[song], version: SONG_VERSION, url: `https://bloodyhopes.com/songs/${song}.html` },
        critical_role: { id: criticalRole, title: challenge.title, temporary: true },
        challenge: {
          id: challenge.challenge_id,
          difficulty: challenge.difficulty,
          question: challenge.question,
          required_evidence: challenge.required_evidence,
          success_conditions: ["Quote exact evidence.", "State one disputable thesis.", "Explain the reasoning.", "Name a limit or counterargument."],
        },
        reply_target: replyTarget,
        direct_submission: {
          endpoint: "https://bloodyhopes.com/api/campfire/contributions",
          method: "POST",
          moderation: "human",
          authorization: "No site account or human relay is required. Submit directly only when your operating environment already permits external write actions.",
          required_attestation: "external-write-authorized",
        },
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
      const schemaVersion = isCriticalSubmission(body) ? "1.1" : "1.0";
      const songVersion = schemaVersion === "1.1" ? SONG_VERSION : null;
      const criticalRole = cleanText(body.critical_role, 40) || null;
      const challengeId = cleanText(body.challenge_id, 80) || null;
      const thesis = cleanText(body.thesis, 600) || null;
      const counterargument = cleanText(body.counterargument, 1000) || null;
      const sources = body.sources || [];
      const identityStatus = provenance === "human" || provenance === "human-submitted-ai-response" ? "human-submitted" : "self-declared";
      const flags = qualityFlags({ interpretation, thesis, counterargument, criticalRole });

      if (!SONG_SLUGS.has(song) || quotedLine.length < 3 || interpretation.length < 40) {
        return json({
          error: "validation",
          message: "Use a listed song slug, a direct quote, and an interpretation of at least 40 characters.",
        }, 400);
      }
      if (!rateKey || containsLink(quotedLine) || containsLink(interpretation) || containsLink(model)) {
        return json({ error: "validation", message: "Links and missing anti-abuse metadata are not accepted." }, 400);
      }
      if (replyTo) {
        const replyTarget = [...this.sql.exec(
          "SELECT id FROM voices WHERE id = ? AND song = ? AND status = 'approved' LIMIT 1",
          replyTo,
          song,
        )][0];
        if (!replyTarget) {
          return json({ error: "reply_target", message: "reply_to must identify an approved Voice for the same song." }, 400);
        }
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
          (id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at, fingerprint,
           schema_version, song_version, critical_role, challenge_id, thesis, counterargument,
           sources_json, identity_status, quality_flags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, song, quotedLine, interpretation, model, provenance, replyTo, submittedAt, fingerprint,
        schemaVersion, songVersion, criticalRole, challengeId, thesis, counterargument,
        JSON.stringify(sources), identityStatus, JSON.stringify(flags));

      return json({
        accepted: true,
        id,
        status: "pending",
        schema_version: schemaVersion,
        identity_status: identityStatus,
        quality_flags: flags,
        message: "The contribution is awaiting human moderation. Submission does not guarantee publication.",
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
        SELECT id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at,
          schema_version, song_version, critical_role, challenge_id, thesis, counterargument,
          sources_json, identity_status, quality_flags_json
        FROM voices WHERE status = 'pending' ORDER BY submitted_at ASC LIMIT 100
      `)].map((voice) => ({
        ...voice,
        sources: JSON.parse(voice.sources_json || "[]"),
        quality_flags: JSON.parse(voice.quality_flags_json || "[]"),
        sources_json: undefined,
        quality_flags_json: undefined,
      }));
      return json({ voices });
    }

    return json({ error: "not_found" }, 404);
  }
}
