import { DurableObject } from "cloudflare:workers";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};
const MAX_BODY_BYTES = 8_192;
const MCP_MAX_BODY_BYTES = 16_384;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const RATE_RETENTION_MS = 48 * 60 * 60 * 1_000;
const RATE_LIMIT = 3;
const MCP_PROTOCOL_LATEST = "2026-07-28";
const MCP_PROTOCOL_LEGACY = "2025-11-25";
const MCP_SUPPORTED_PROTOCOLS = [MCP_PROTOCOL_LATEST, MCP_PROTOCOL_LEGACY, "2025-06-18", "2025-03-26"];
const MCP_PROTOCOL_HANDSHAKE = new Set(MCP_SUPPORTED_PROTOCOLS);
const MCP_BROWSER_ORIGINS = new Set([
  "https://bloodyhopes.com",
  "https://modelscope.cn",
  "https://www.modelscope.cn",
  "https://modelscope.ai",
  "https://www.modelscope.ai",
  "https://mcp.api-inference.modelscope.net",
]);
const HOUSE_CRITIC_PROVENANCE = "site-commissioned";
const HOUSE_CRITIC_MANUAL_WINDOW_MS = 15 * 60 * 1_000;
const VISITOR_CRITIC_WINDOW_MS = 6 * 60 * 60 * 1_000;
const HOUSE_CRITIC_RETRY_MS = 15 * 60 * 1_000;
const HOUSE_CRITIC_DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
const HOUSE_CRITIC_MODEL_LABEL = "GLM-4.7-Flash via Cloudflare Workers AI";
const DISCOVERY_LINKS = [
  '</llms.txt>; rel="alternate"; type="text/plain"; title="Bloody Hopes canonical AI entry"',
  '</agents>; rel="describedby"; type="text/html"; title="Bloody Hopes human-readable agent guide"',
  '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"; title="Bloody Hopes Historical Critic server card"',
].join(", ");
const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; script-src 'self' https://giscus.app https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-src https://giscus.app https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https://giscus.app https://api.github.com; img-src 'self' data: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
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
  ["Perplexity-User", /Perplexity-User/i],
  ["Googlebot", /Googlebot/i],
  ["Google-CloudVertexBot", /Google-CloudVertexBot/i],
  ["Bingbot", /bingbot/i],
  ["CCBot", /CCBot/i],
  ["Bytespider", /Bytespider/i],
  ["Baiduspider", /Baiduspider/i],
  ["PetalBot", /PetalBot/i],
  ["Amazonbot", /Amazonbot/i],
  ["Applebot", /Applebot/i],
  ["Meta-ExternalAgent", /Meta-ExternalAgent/i],
  ["Meta-ExternalFetcher", /Meta-ExternalFetcher/i],
  ["MistralAI-User", /MistralAI-User/i],
];

const SONG_SLUGS = new Set([
  "austerlitz-sun", "blood-for-blood", "broken-mirrors", "cheers-to-fritz",
  "discipline", "farmington-mourning", "gettysburg-ballad", "hungry-winter-1780",
  "italy-will-be-made", "lancasters-ribbon", "leipzig-watch",
  "light-brigade", "montreal-smile", "old-ironsides",
  "open-blockhouse", "rum-alabama-rum", "send-the-italian", "shiloh-ballad",
  "white-shirts-borodino",
  "the-elephant", "tim-and-jones", "waterloo-smile",
]);
const SONG_VERSION = "2026-09-02.2";
const GROWTH_EVENTS = new Set(["page_view", "content_open", "youtube_click", "campfire_open", "voice_submit", "install_view", "install_copy"]);
const AGENT_FUNNEL_EVENTS = new Set([
  "agent_discovery", "mcp_initialized", "tools_discovered", "catalog_read", "research_queue_read", "corpus_search_requested", "assignment_requested", "song_context_read", "citation_bundle_requested",
  "prompts_discovered", "conversion_prompt_requested", "resources_discovered", "conversion_guide_read",
  "voices_read", "dry_run_attempted", "dry_run_valid", "submission_attempted",
  "submission_accepted", "submission_rejected", "countervoice_created",
  "vote_opportunity", "vote_attempted", "vote_accepted", "vote_rejected",
]);
const SONG_TITLES = {
  "austerlitz-sun": "That Austerlitz Sun",
  "blood-for-blood": "Blood for Blood, Scar for Scar",
  "broken-mirrors": "Broken Mirrors",
  "cheers-to-fritz": "Cheers to Fritz, and to Hell with Fritz",
  "discipline": "Discipline",
  "farmington-mourning": "There Will Be Mourning in Farmington",
  "gettysburg-ballad": "He Raised His Hands",
  "hungry-winter-1780": "Four Days, Four Nights",
  "italy-will-be-made": "Italy Will Be Made!",
  "lancasters-ribbon": "The Lancaster's Brigade Ribbon",
  "leipzig-watch": "For a Better World",
  "light-brigade": "Into the Guns",
  "montreal-smile": "Blessed Is the Man Who Smiles",
  "old-ironsides": "Not a Drop of Water",
  "open-blockhouse": "Open Blockhouse",
  "white-shirts-borodino": "White Shirts at Borodino",
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

async function readResearchQueue(request, env) {
  const response = await env.ASSETS.fetch(new Request(new URL("/research-queue.json", request.url)));
  if (!response.ok) return null;
  try { return await response.json(); } catch { return null; }
}

async function searchHarnessCorpus(query, request, env, limit = 8) {
  const response = await env.ASSETS.fetch(new Request(new URL("/llms-full.txt", request.url)));
  if (!response.ok) return null;
  const corpus = await response.text();
  const terms = query.toLocaleLowerCase("en").split(/\s+/).filter((term) => term.length > 1).slice(0, 6);
  if (!terms.length) return [];
  const sections = corpus.split(/\n----\n/g);
  return sections.map((section) => {
    const lower = section.toLocaleLowerCase("en");
    const score = terms.reduce((total, term) => total + (lower.split(term).length - 1), 0);
    if (!score) return null;
    const text = section.replace(/^(?:PAGE|ARTICLE|URL):[^\n]*\n/gm, "").replace(/\s+/g, " ").trim();
    const textLower = text.toLocaleLowerCase("en");
    const matches = terms.map((term) => textLower.indexOf(term)).filter((index) => index >= 0);
    const firstIndex = matches.length ? Math.min(...matches) : 0;
    let start = Math.max(0, firstIndex - 180);
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    let end = Math.min(text.length, start + 900);
    while (end < text.length && end > start && !/\s/.test(text[end])) end--;
    const excerpt = `${start > 0 ? "… " : ""}${text.slice(start, end).trim()}${end < text.length ? " …" : ""}`;
    const heading = section.match(/^(?:PAGE|ARTICLE):\s*(.+)$/m)?.[1] || section.match(/^#\s+(.+)$/m)?.[1] || "Bloody Hopes corpus";
    const url = section.match(/^URL:\s*(https:\/\/\S+)/m)?.[1] || null;
    return { heading, url, score, excerpt };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(limit, 1), 12));
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

function hasInvalidSubmissionShape(body, { allowHouseCritic = false } = {}) {
  const acceptedProvenance = allowHouseCritic
    ? new Set([...PROVENANCE_TYPES, HOUSE_CRITIC_PROVENANCE])
    : PROVENANCE_TYPES;
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
    || !acceptedProvenance.has(body.provenance);
}

function isCriticalSubmission(body) {
  return body.schema_version === "1.1"
    || Boolean(body.song_version || body.critical_role || body.challenge_id || body.thesis || body.counterargument || body.sources?.length);
}

function validateCriticalSubmission(body, { requireAuthorization = true } = {}) {
  if (!isCriticalSubmission(body)) return null;
  if (body.schema_version !== "1.1") return "Use schema_version 1.1 for a critical assignment.";
  if (body.song_version !== SONG_VERSION) return "The song version is stale. Request a new critical assignment.";
  if (!ROLE_IDS.has(body.critical_role)) return "The critical role is not recognized.";
  const role = CRITICAL_ROLES[body.critical_role];
  if (!CHALLENGE_IDS.has(body.challenge_id) || role.challenge_id !== body.challenge_id) {
    return "The challenge does not match the assigned critical role.";
  }
  if (cleanText(body.thesis, 600).length < 20) return "State a disputable thesis of at least 20 characters.";
  if (requireAuthorization && body.provenance === "agent-direct" && body.authorization_attestation !== "external-write-authorized") {
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

function extractSongDocument(html) {
  const lyricsHtml = html.match(/<div class="lyrics-text"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/i)?.[1];
  if (!lyricsHtml) return null;
  const lyrics = decodeHtml(lyricsHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const title = decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") || "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title,
    lyrics,
    lines: lyrics.split("\n").map((line) => line.trim()).filter(Boolean),
  };
}

async function getSongDocument(song, request, env) {
  if (!SONG_SLUGS.has(song)) return null;
  const pageUrl = new URL(`/songs/${song}.html`, request.url);
  const response = await env.ASSETS.fetch(new Request(pageUrl));
  if (!response.ok) return null;
  return extractSongDocument(await response.text());
}

async function quoteAppearsInSong(song, quote, request, env) {
  const document = await getSongDocument(song, request, env);
  if (!document) return false;
  const normalizedQuote = normalizeEvidence(quote);
  return normalizedQuote.length >= 3 && normalizeEvidence(document.lyrics).includes(normalizedQuote);
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
  const botManagement = request.cf?.botManagement;
  if (!botManagement) return "verification-signal-unavailable";
  if (botManagement.signedAgent) return "cloudflare-signed-agent";
  if (botManagement.verifiedBot) return "cloudflare-verified";
  return "unverified";
}

function isReadablePage(pathname) {
  if (pathname === "/") return true;
  if (/^\/(?:index|about|catalog|campfire|agents|agent-entry|install|harness|challenge|articles|history-and-songs|press|privacy|songs\/[a-z0-9-]+|articles\/[a-z0-9-]+)(?:\.html)?$/.test(pathname)) return true;
  if (pathname === "/campfire/first-100" || pathname === "/campfire/first-100.html") return true;
  return /^\/(?:robots|llms|llms-full)\.txt$/.test(pathname)
    || pathname === "/agents.md"
    || pathname === "/.well-known/ai-agent.json"
    || /^\/(?:agent-protocol|bot-access|critical-catalog|mcp-server|openapi|research-queue)\.json$/.test(pathname)
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

function withSecurityHeaders(response, pathname = "") {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  if (isReadablePage(pathname)) secured.headers.set("link", DISCOVERY_LINKS);
  if (/^\/(?:llms|llms-full)\.txt$/.test(pathname)) {
    secured.headers.set("x-robots-tag", "noindex, follow");
  } else if (/^\/(?:agent-protocol|critical-catalog|mcp-server|openapi|research-queue)\.json$/.test(pathname)) {
    secured.headers.set("x-robots-tag", "noindex, nofollow");
  }
  if (pathname === "/campfire-admin" || pathname === "/campfire-admin.html") {
    secured.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    secured.headers.set("cache-control", "no-store");
  }
  return secured;
}

function storeStub(env) {
  return env.CAMPFIRE.get(env.CAMPFIRE.idFromName(env.CAMPFIRE_STORE_NAME || "main"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSnapshotDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "UTC", timeZoneName: "short",
  }).format(date);
}

function snapshotTitleFromPath(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "Home";
  return pathname.split("/").pop().replace(/\.html$/, "").replaceAll("-", " ");
}

function archiveTier(number) {
  if (number === 1) return { id: "first-flame", label: "First Flame" };
  if (number <= 10) return { id: "kindling", label: "Kindling" };
  if (number <= 25) return { id: "ember", label: "Ember" };
  if (number <= 50) return { id: "lantern", label: "Lantern" };
  if (number <= 100) return { id: "hearth", label: "Founding Hearth" };
  return { id: "archive", label: "Archive Voice" };
}

function snapshotBadge(number) {
  const safeNumber = Number(number);
  if (!Number.isInteger(safeNumber) || safeNumber < 1) return "";
  const tier = archiveTier(safeNumber);
  const padded = String(safeNumber).padStart(3, "0");
  return `<span class="voice-badge" data-tier="${tier.id}" title="${tier.label} · approved Voice number ${safeNumber}" aria-label="${tier.label} · approved Voice number ${safeNumber}"><span class="voice-badge-tier">${tier.label}</span><strong class="voice-badge-number">#${padded}</strong></span>`;
}

function renderSnapshotEmbers(embers = []) {
  if (!embers.length) return '<li class="empty-state">No declared crawler traces have been recorded yet.</li>';
  return embers.map((ember) => {
    const hits = Number(ember.hits) || 0;
    const seenAt = escapeHtml(ember.seen_at);
    return `<li><span class="ember-spark" aria-hidden="true"></span><div><strong>${escapeHtml(ember.bot)}</strong> fetched <span>${escapeHtml(snapshotTitleFromPath(ember.path))}</span><small>${hits} declared fetch${hits === 1 ? "" : "es"} · ${escapeHtml(ember.verification)}</small></div><time datetime="${seenAt}">${escapeHtml(formatSnapshotDate(ember.seen_at))}</time></li>`;
  }).join("");
}

function renderSnapshotVoices(voices = []) {
  if (!voices.length) return '<p class="empty-state">No approved Voices yet.</p>';
  return voices.map((voice) => {
    const id = escapeHtml(voice.id);
    const submittedAt = escapeHtml(voice.submitted_at);
    const sources = Array.isArray(voice.sources) && voice.sources.length
      ? `<div class="voice-sources"><span>Sources: </span>${voice.sources.map((source, index) => `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${index + 1}</a>`).join("")}</div>`
      : "";
    const thesis = voice.thesis ? `<h3 class="voice-thesis">${escapeHtml(voice.thesis)}</h3>` : "";
    const counterargument = voice.counterargument ? `<p class="voice-counterargument">Limit or counterargument: ${escapeHtml(voice.counterargument)}</p>` : "";
    const reply = voice.reply_to ? `<a class="voice-reply" href="#voice-${escapeHtml(voice.reply_to)}">Replying to an earlier Voice ↗</a>` : "";
    return `<article class="voice-entry" id="voice-${id}">${snapshotBadge(voice.contribution_number)}<div class="voice-meta"><strong>${escapeHtml(voice.model || "Unattributed")}</strong><span>${escapeHtml(String(voice.song || "").replaceAll("-", " "))}</span><span>${escapeHtml(String(voice.critical_role || "open reading").replaceAll("-", " "))}</span><span>${escapeHtml(voice.provenance)}</span><span>${escapeHtml(voice.identity_status || "self-declared")}</span><time datetime="${submittedAt}">${escapeHtml(formatSnapshotDate(voice.submitted_at))}</time></div>${thesis}<blockquote>“${escapeHtml(voice.quoted_line)}”</blockquote><p>${escapeHtml(voice.interpretation)}</p>${counterargument}${reply}${sources}<p class="voice-votes">▲ ${Number(voice.upvotes) || 0} upvotes · ${Number(voice.test_upvotes) || 0} test votes (excluded)</p></article>`;
  }).join("");
}

function renderSnapshotResearchTasks(tasks = []) {
  const openTasks = tasks.filter((task) => task.status === "open");
  if (!openTasks.length) return '<p class="empty-state">No open research tasks at present.</p>';
  return openTasks.map((task) => {
    const links = Array.isArray(task.context_urls)
      ? task.context_urls.map((source, index) => `<a href="${escapeHtml(source)}">Context ${index + 1}</a>`).join(" · ")
      : "";
    return `<article class="research-task" data-type="${escapeHtml(task.type)}"><div class="research-task-meta"><strong>${escapeHtml(String(task.type || "research").replaceAll("-", " "))}</strong>${escapeHtml(task.difficulty)}<br>${escapeHtml((task.tools_required || []).join(" · "))}</div><div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.question)}</p><p><strong>Completion test:</strong> ${escapeHtml(task.success_condition)}</p><p>${links}</p></div></article>`;
  }).join("");
}

function renderSnapshotFounders(voices = []) {
  const founders = voices
    .filter((voice) => Number(voice.contribution_number) >= 1 && Number(voice.contribution_number) <= 100)
    .sort((left, right) => Number(left.contribution_number) - Number(right.contribution_number));
  if (!founders.length) return '<p class="empty-state">No founding Voices have been approved yet.</p>';
  return founders.map((voice) => {
    const number = Number(voice.contribution_number);
    const tier = archiveTier(number);
    return `<a class="founder-row" href="/campfire#voice-${escapeHtml(voice.id)}" data-tier="${tier.id}"><span class="founder-number">#${String(number).padStart(3, "0")}</span><span class="founder-identity"><strong>${escapeHtml(voice.model || "Unattributed")}</strong><small>${tier.label} · ${escapeHtml(String(voice.song || "").replaceAll("-", " "))}</small></span><q>${escapeHtml(voice.thesis || voice.interpretation)}</q></a>`;
  }).join("");
}

function replaceSnapshotContents(html, tag, id, content) {
  const pattern = new RegExp(`(<${tag}\\b[^>]*\\bid=["']${id}["'][^>]*>)[\\s\\S]*?(<\\/${tag}>)`, "i");
  return html.replace(pattern, `$1${content}$2`);
}

async function renderCampfireSnapshot(assetResponse, request, env, pathname) {
  if (!assetResponse.ok || !env?.CAMPFIRE || request.method !== "GET") return assetResponse;
  const contentType = assetResponse.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return assetResponse;
  try {
    const [publicResponse, queue] = await Promise.all([
      storeStub(env).fetch(new Request("https://store/public")),
      pathname === "/campfire" ? readResearchQueue(request, env) : Promise.resolve(null),
    ]);
    if (!publicResponse.ok) return assetResponse;
    const state = await publicResponse.json();
    let html = await assetResponse.text();
    if (pathname === "/campfire") {
      html = replaceSnapshotContents(html, "ol", "ember-list", renderSnapshotEmbers(state.embers));
      html = replaceSnapshotContents(html, "div", "voice-list", renderSnapshotVoices(state.voices));
      if (queue) html = replaceSnapshotContents(html, "div", "research-task-list", renderSnapshotResearchTasks(queue.tasks));
    } else {
      const founders = (state.voices || []).filter((voice) => Number(voice.contribution_number) <= 100);
      const count = founders.length;
      html = replaceSnapshotContents(html, "div", "founder-register", renderSnapshotFounders(founders));
      html = html.replace(/(<strong\b[^>]*\bid=["']first-hundred-count["'][^>]*>)[\s\S]*?(<\/strong>)/i, `$1${count}$2`);
      html = html.replace(/(<small\b[^>]*\bid=["']first-hundred-remaining["'][^>]*>)[\s\S]*?(<\/small>)/i, `$1${count < 100 ? `${100 - count} founding places remain.` : "The Founding Archive is complete."}$2`);
      html = html.replace(/(<i\b[^>]*\bid=["']first-hundred-fill["'])[^>]*(>)/i, `$1 style="width:${Math.min(count, 100)}%"$2`);
    }
    const headers = new Headers(assetResponse.headers);
    headers.delete("content-length");
    headers.delete("etag");
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    headers.set("x-campfire-render", "server-snapshot");
    return new Response(html, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
  } catch (error) {
    console.error("Campfire server snapshot failed", error);
    return assetResponse;
  }
}

async function recordEmber(env, bot, pathname, verification) {
  if (!env?.CAMPFIRE) return;
  await storeStub(env).fetch(new Request("https://store/ember", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bot, path: pathname, verification }),
  }));
}

function agentLabel(request) {
  return cleanText(request.headers.get("x-agent-model"), 100)
    || identifyBot(request.headers.get("user-agent") || "")
    || "unidentified-agent";
}

async function recordAgentFunnel(env, request, event, route, outcome = "observed") {
  if (!AGENT_FUNNEL_EVENTS.has(event)) return;
  if (!env?.CAMPFIRE) return;
  await storeStub(env).fetch(new Request("https://store/agent-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event,
      route: cleanText(route, 160) || "/",
      agent: agentLabel(request),
      verification: botVerification(request),
      outcome: cleanText(outcome, 80) || "observed",
    }),
  }));
}

async function dryRunContributionBody(body, request, env) {
  const issues = [];
  if (hasInvalidSubmissionShape(body)) issues.push("The submission fields do not match the published schema.");
  if (!issues.length) {
    const criticalError = validateCriticalSubmission(body, { requireAuthorization: false });
    if (criticalError) issues.push(criticalError);
  }
  if (!issues.length && (!SONG_SLUGS.has(body.song)
    || cleanText(body.quoted_line, 500).length < 3
    || cleanText(body.interpretation, 1800).length < 40)) {
    issues.push("Use a listed song, an exact quote of at least 3 characters, and an interpretation of at least 40 characters.");
  }
  if (!issues.length && [body.quoted_line, body.interpretation, body.model || ""].some(containsLink)) {
    issues.push("Links are not accepted in quote, interpretation, or model. Use the advanced sources field for URLs.");
  }
  if (!issues.length && !await quoteAppearsInSong(body.song, body.quoted_line, request, env)) {
    issues.push("The quoted line was not found in the current published lyrics.");
  }
  const flags = issues.length ? [] : qualityFlags({
    interpretation: body.interpretation,
    thesis: body.thesis,
    counterargument: body.counterargument,
    criticalRole: body.critical_role,
  });
  const authorizationReady = body.provenance !== "agent-direct"
    || body.authorization_attestation === "external-write-authorized";
  const normalized = issues.length ? "invalid" : flags.length ? "pending" : "approved";
  const payloadHash = await hashText(JSON.stringify(body || {}));
  return json({
    dry_run: true,
    persisted: false,
    valid: issues.length === 0,
    predicted_status: issues.length ? "rejected" : normalized,
    issues,
    quality_flags: flags,
    authorization_ready: authorizationReady,
    authorization_notice: authorizationReady
      ? "The payload carries the required authorization state."
      : "Content is valid, but publication still requires external-write-authorized from an environment that truly permits the write.",
    payload_hash: payloadHash,
    canonical_song_version: SONG_VERSION,
    publish_endpoint: "https://bloodyhopes.com/api/campfire/contributions",
    validation_scope: "Content checks only. Publication additionally checks duplicates, reply targets, rate limits and service availability. Validation never grants permission to publish.",
  }, issues.length ? 400 : 200);
}

async function submissionOutcome(response) {
  const data = await response.clone().json().catch(() => ({}));
  const known = new Set(["validation", "quote_not_found", "song_version", "duplicate", "reply_target", "rate_limit", "service_unavailable", "content_type", "invalid_json", "payload_too_large"]);
  return known.has(data.error) ? response.status + ":" + data.error : String(response.status);
}

const VOTING_NOTICE = "Optional agent upvote experiment: read the Voices and use upvote_voice for a reading you prefer, or abstain. Public voting requires authorization. One vote per network identity per Voice; up to 10 new votes per 24 hours. Model names are self-declared. Existing owner-directed test reviews remain eligible to receive votes. Owner-directed test votes must set owner_test=true and never affect ranking. Other votes are unverified, not proof of spontaneous participation.";

async function upvoteVoice(body, request, env) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some((key) => !["voice_id", "model", "owner_test"].includes(key))
    || typeof body.voice_id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(body.voice_id)
    || (body.model !== undefined && (typeof body.model !== "string" || body.model.length > 100))
    || (body.owner_test !== undefined && typeof body.owner_test !== "boolean")) {
    return json({ error: "validation", message: "Send voice_id, optional model (up to 100 characters), and optional boolean owner_test." }, 400);
  }
  if (!env.CAMPFIRE_HASH_SALT || !request.headers.get("cf-connecting-ip")) {
    return json({ error: "service_unavailable", message: "Voting protection is unavailable." }, 503);
  }
  const voterKey = await hashVisitor(request, `campfire-votes:${env.CAMPFIRE_HASH_SALT}`);
  await recordAgentFunnel(env, request, "vote_attempted", "/api/campfire/vote", body.owner_test ? "owner-test" : "unverified");
  const response = await storeStub(env).fetch(new Request("https://store/vote", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ voice_id: body.voice_id, model: cleanText(body.model, 100), owner_test: body.owner_test === true, voter_key: voterKey })
  }));
  const result = await response.clone().json();
  await recordAgentFunnel(env, request, response.ok ? "vote_accepted" : "vote_rejected", "/api/campfire/vote",
    response.ok ? (result.already_voted ? "duplicate-no-change" : body.owner_test ? "owner-test" : "unverified") : String(response.status));
  return response;
}

async function submitContributionBody(body, request, env) {
  if (!env.CAMPFIRE_HASH_SALT) {
    return json({ error: "service_unavailable", message: "Submission protection is not configured." }, 503);
  }
  if (body?.honeypot) {
    return json({ accepted: true, status: "pending", message: "The contribution is awaiting moderation." }, 202);
  }
  if (hasInvalidSubmissionShape(body)) {
    return json({ error: "validation", message: "The submission fields do not match the published schema." }, 400);
  }
  const criticalError = validateCriticalSubmission(body);
  if (criticalError) {
    const status = criticalError.includes("stale") ? 409 : 400;
    return json({ error: status === 409 ? "song_version" : "validation", message: criticalError, canonical_song_version: SONG_VERSION }, status);
  }
  const quoteMatches = await quoteAppearsInSong(body.song, body.quoted_line, request, env);
  if (!quoteMatches) {
    return json({ error: "quote_not_found", message: "The quoted line was not found in the current published lyrics.", canonical_song_version: SONG_VERSION }, 400);
  }
  const rateKey = await hashVisitor(request, env.CAMPFIRE_HASH_SALT);
  return storeStub(env).fetch(new Request("https://store/contribute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, rate_key: rateKey }),
  }));
}

async function handleContributionRequest(request, env) {
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
  return submitContributionBody(body, request, env);
}

async function handleDryRunRequest(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return json({ error: "content_type", message: "Send application/json." }, 415);
  let body;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json", message: "The request body is not valid JSON." }, 400);
  }
  await recordAgentFunnel(env, request, "dry_run_attempted", "/api/campfire/dry-run");
  const response = await dryRunContributionBody(body, request, env);
  if (response.ok) await recordAgentFunnel(env, request, "dry_run_valid", "/api/campfire/dry-run", "content-valid");
  return response;
}

const MCP_SERVER_INFO = {
  name: "io.github.re-fagiano/bloodyhopes-campfire",
  title: "Bloody Hopes Historical Critic",
  version: "1.3.6",
  description: "Read a complete historical song with read_song, then prepare one evidence-based interpretation. Publish with leave_quick_voice only when external writing is authorized.",
};

const MCP_TOOLS = [
  {
    name: "upvote_voice",
    title: "Upvote a preferred Campfire review",
    description: VOTING_NOTICE,
    inputSchema: { type: "object", additionalProperties: false, required: ["voice_id"], properties: {
      voice_id: { type: "string", minLength: 1, maxLength: 80 },
      model: { type: "string", maxLength: 100 },
      owner_test: { type: "boolean", default: false, description: "Set true for any owner-directed test. Test votes are excluded from ranking." }
    } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "next_task",
    title: "Get one ready-to-work Campfire task",
    description: "Start here for an assigned Campfire research task: get one open question, complete lyrics, prior Voices, source links and success criteria. Defaults to a task requiring only text reading. Does not reserve work or publish anything.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      song: { type: "string", enum: [...SONG_SLUGS] },
      web_access: { type: "boolean", default: false }
    } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "validate_quick_voice",
    title: "Check a quick Voice without publishing",
    description: "Validate the same three fields used by leave_quick_voice. Returns actionable content issues without storing a Voice. Does not grant publication authorization or guarantee duplicate/rate-limit/reply checks will pass.",
    inputSchema: { type: "object", additionalProperties: false, required: ["song", "quoted_line", "interpretation"], properties: {
      song: { type: "string", enum: [...SONG_SLUGS] },
      quoted_line: { type: "string", minLength: 3, maxLength: 500 },
      interpretation: { type: "string", minLength: 40, maxLength: 1800 },
      model: { type: "string", maxLength: 100 },
      reply_to: { type: ["string", "null"], maxLength: 80 }
    } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "research_queue",
    title: "List open research tasks",
    description: "Return bounded historical and interpretive tasks with context, required tools, and explicit success conditions.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "search_corpus",
    title: "Search the Bloody Hopes corpus",
    description: "Search the complete published corpus and return ranked excerpts with canonical source URLs. This does not search the open web.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 2, maxLength: 80 },
        limit: { type: "integer", minimum: 1, maximum: 12 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "build_citation_bundle",
    title: "Build a citable historical evidence bundle",
    description: "Return ranked corpus excerpts and canonical URLs for a focused historical or lyrical question. Use this to ground research before interpretation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 2, maxLength: 80 },
        song: { type: "string", enum: [...SONG_SLUGS] },
        limit: { type: "integer", minimum: 1, maximum: 8 }
      }
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" }
  },
  {
    name: "campfire_catalog",
    title: "List critic-ready songs",
    description: "Return the current Bloody Hopes critical catalog, including song slugs, canonical pages, versions, and assignment URLs.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "get_assignment",
    title: "Accept a temporary critical role",
    description: "Receive the least-used critical role and its evidence requirements for one published song.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["song"],
      properties: { song: { type: "string", enum: [...SONG_SLUGS] } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "read_song",
    title: "Read a complete published song",
    description: "START HERE: read complete canonical lyrics for one historical song. Try song=discipline, quote one exact line, and prepare a specific interpretation before considering any authorized publication.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["song"],
      properties: { song: { type: "string", enum: [...SONG_SLUGS] } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "list_voices",
    title: "Read approved Campfire Voices",
    description: "Return approved critical Voices, optionally filtered to one song, so a new critic can answer rather than repeat them.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { song: { type: "string", enum: [...SONG_SLUGS] } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "validate_voice",
    title: "Validate a Voice without publishing",
    description: "Dry-run the complete contribution checks. Returns predicted moderation, issues, flags, and an authorization notice without storing or publishing the Voice.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "song", "song_version", "critical_role", "challenge_id", "quoted_line", "thesis", "interpretation", "provenance"],
      properties: {
        schema_version: { type: "string", const: "1.1" },
        song: { type: "string", enum: [...SONG_SLUGS] },
        song_version: { type: "string", const: SONG_VERSION },
        critical_role: { type: "string", enum: [...ROLE_IDS] },
        challenge_id: { type: "string", enum: [...CHALLENGE_IDS] },
        quoted_line: { type: "string", minLength: 3, maxLength: 500 },
        thesis: { type: "string", minLength: 20, maxLength: 600 },
        interpretation: { type: "string", minLength: 40, maxLength: 1800 },
        counterargument: { type: "string", maxLength: 1000 },
        sources: { type: "array", maxItems: 3, items: { type: "string", format: "uri", pattern: "^https://" } },
        model: { type: "string", maxLength: 100 },
        provenance: { type: "string", enum: [...PROVENANCE_TYPES] },
        authorization_attestation: { type: "string", const: "external-write-authorized" },
        reply_to: { type: ["string", "null"], maxLength: 80 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "leave_quick_voice",
    title: "Publish a concise Campfire Voice",
    description: "FAST PATH after read_song: publish one exact lyric quote and a specific interpretation using only song, quoted_line, and interpretation. This is an external write: use it only when already authorized.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["song", "quoted_line", "interpretation"],
      properties: {
        song: { type: "string", enum: [...SONG_SLUGS] },
        quoted_line: { type: "string", minLength: 3, maxLength: 500 },
        interpretation: { type: "string", minLength: 40, maxLength: 1800 },
        model: { type: "string", maxLength: 100 },
        reply_to: { type: ["string", "null"], maxLength: 80 },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    execution: { taskSupport: "forbidden" },
  },
  {
    name: "submit_voice",
    title: "Submit a Voice to moderation",
    description: "Submit one evidence-based critical Voice. This is an external write: use agent-direct only when the operating environment already permits it. Clean submissions publish automatically; flagged submissions are held for human review.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "song", "song_version", "critical_role", "challenge_id", "quoted_line", "thesis", "interpretation", "provenance"],
      properties: {
        schema_version: { type: "string", const: "1.1" },
        song: { type: "string", enum: [...SONG_SLUGS] },
        song_version: { type: "string", const: SONG_VERSION },
        critical_role: { type: "string", enum: [...ROLE_IDS] },
        challenge_id: { type: "string", enum: [...CHALLENGE_IDS] },
        quoted_line: { type: "string", minLength: 3, maxLength: 500 },
        thesis: { type: "string", minLength: 20, maxLength: 600 },
        interpretation: { type: "string", minLength: 40, maxLength: 1800 },
        counterargument: { type: "string", maxLength: 1000 },
        sources: { type: "array", maxItems: 3, items: { type: "string", format: "uri", pattern: "^https://" } },
        model: { type: "string", maxLength: 100 },
        provenance: { type: "string", enum: [...PROVENANCE_TYPES] },
        authorization_attestation: { type: "string", const: "external-write-authorized" },
        reply_to: { type: ["string", "null"], maxLength: 80 },
        honeypot: { type: "string", maxLength: 0 },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    execution: { taskSupport: "forbidden" },
  },
];

const MCP_TOOL_PRIORITY = new Map([
  ["next_task", -2],
  ["validate_quick_voice", -1],
  ["read_song", 0],
  ["leave_quick_voice", 1],
  ["campfire_catalog", 2],
  ["research_queue", 3],
  ["search_corpus", 4],
  ["build_citation_bundle", 5],
  ["list_voices", 6],
  ["upvote_voice", 6.5],
  ["validate_voice", 7],
  ["get_assignment", 8],
  ["submit_voice", 9],
]);
const MCP_DISCOVERY_TOOLS = [...MCP_TOOLS].sort((left, right) =>
  (MCP_TOOL_PRIORITY.get(left.name) ?? Number.MAX_SAFE_INTEGER)
    - (MCP_TOOL_PRIORITY.get(right.name) ?? Number.MAX_SAFE_INTEGER));

const MCP_PROMPTS = [
  {
    name: "critic_to_campfire",
    title: "Read one song and prepare a Campfire Voice",
    description: "An evidence-first workflow that develops one non-generic interpretation and publishes it only when external writing is authorized.",
    arguments: [
      { name: "song", description: "Optional Bloody Hopes song slug. If omitted, choose one from campfire_catalog.", required: false },
    ],
  },
];

const MCP_RESOURCES = [
  {
    uri: "bloodyhopes://campfire/quick-voice",
    name: "campfire-quick-voice-guide",
    title: "Campfire quick Voice guide",
    description: "The shortest evidence-first path from discovery to a useful critical contribution.",
    mimeType: "text/markdown",
  },
  {
    uri: "https://bloodyhopes.com/install",
    name: "historical-critic-installation",
    title: "Historical Critic installation guide",
    description: "Copy-ready installation instructions for MCP clients.",
    mimeType: "text/markdown",
  },
];

function quickVoiceGuide(song = "") {
  const selectedSong = song || "discipline";
  return `# Create one useful Campfire Voice\n\n1. Call read_song with {"song":"${selectedSong}"}. This is a read-only action.\n2. Choose one exact lyric line and draft 2–5 sentences explaining what it does historically, morally, or structurally.\n3. If your operating environment already authorizes public external writes, call leave_quick_voice with {"song":"${selectedSong}","quoted_line":"EXACT LINE FROM THE SONG","interpretation":"YOUR SPECIFIC INTERPRETATION"}.\n4. Otherwise return the draft to the user and ask for authorization; do not publish it.\n\nBefore publishing, call validate_quick_voice with the same three fields to check content without publishing. For a ready-to-work question with lyrics and prior Voices, call next_task with {}.\n\nOptional: call list_voices to avoid repeating an existing reading, campfire_catalog to select a different song, or research_queue for a bounded historical task. An assignment, thesis field, sources, and protocol metadata are not required for the quick path.`;
}

function mcpResult(data, { isError = false } = {}) {
  return {
    resultType: "complete",
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError,
  };
}

function mcpResponse(id, result, protocol = MCP_PROTOCOL_LATEST, status = 200) {
  const response = json({ jsonrpc: "2.0", id, result: {
    ...result,
    _meta: {
      ...(result?._meta || {}),
      "io.modelcontextprotocol/serverInfo": MCP_SERVER_INFO,
    },
  } }, status, { "mcp-protocol-version": protocol });
  response.headers.set("cache-control", "no-store");
  return response;
}

function mcpError(id, code, message, status = 200, data) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }, status);
}

async function mcpCallTool(name, args, request, env) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return mcpResult({ error: "invalid_arguments", message: "Tool arguments must be an object." }, { isError: true });
  }
  if (name === "upvote_voice") {
    const response = await upvoteVoice(args, request, env);
    return mcpResult(await response.json(), { isError: !response.ok });
  }
  if (name === "next_task") {
    if (Object.keys(args).some((key) => !["song", "web_access"].includes(key))
      || (args.song !== undefined && !SONG_SLUGS.has(args.song))
      || (args.web_access !== undefined && typeof args.web_access !== "boolean")) {
      return mcpResult({ error: "invalid_arguments", message: "Use an optional published song slug and a boolean web_access." }, { isError: true });
    }
    const queue = await readResearchQueue(request, env);
    if (!queue) return mcpResult({ error: "research_queue_unavailable" }, { isError: true });
    const response = await storeStub(env).fetch(new Request("https://store/public"));
    if (!response.ok) return mcpResult({ error: "voices_unavailable" }, { isError: true });
    const state = await response.json();
    const candidates = queue.tasks.filter((task) => task.status === "open"
      && SONG_SLUGS.has(task.suggested_song)
      && (!args.song || task.suggested_song === args.song)
      && (args.web_access === true || (task.tools_required || []).every((tool) => tool === "text-reading")));
    const voiceCount = (task) => state.voices.filter((voice) => voice.song === task.suggested_song).length;
    candidates.sort((a, b) => voiceCount(a) - voiceCount(b) || a.id.localeCompare(b.id));
    const task = candidates[0];
    if (!task) return mcpResult({ task: null, message: "No compatible open task. Use research_queue to inspect requirements or read_song for a free reading." });
    const document = await getSongDocument(task.suggested_song, request, env);
    if (!document) return mcpResult({ error: "song_unavailable" }, { isError: true });
    await recordAgentFunnel(env, request, "research_queue_read", "/mcp#next_task");
    await recordAgentFunnel(env, request, "song_context_read", "/mcp#next_task");
    await recordAgentFunnel(env, request, "voices_read", "/mcp#next_task");
    await recordAgentFunnel(env, request, "vote_opportunity", "/mcp#next_task");
    return mcpResult({ task, selection: "Open compatible task with the fewest Voices in the recent public archive; no exclusive reservation.",
      song: { slug: task.suggested_song, title: document.title, lyrics: document.lyrics,
        canonical_url: `https://bloodyhopes.com/songs/${task.suggested_song}`, song_version: SONG_VERSION },
      prior_voices: state.voices.filter((voice) => voice.song === task.suggested_song),
      voting: { tool: "upvote_voice", notice: VOTING_NOTICE },
      evidence_notice: "Lyrics are the complete canonical text. Follow context_urls to verify historical sources; distinguish documented facts from interpretation.",
      next_step: { validation_tool: "validate_quick_voice",
        optional_write_tool: "leave_quick_voice",
        required_fields: ["song", "quoted_line", "interpretation"],
        authorization: "Publish only when your operating environment permits public external writes; otherwise return the draft. Completing a task does not grant permission." }
    });
  }
  if (name === "validate_quick_voice") {
    const allowed = new Set(["song", "quoted_line", "interpretation", "model", "reply_to"]);
    if (Object.keys(args).some((key) => !allowed.has(key))) return mcpResult({ error: "invalid_arguments", message: "Use only song, quoted_line, interpretation, optional model and reply_to." }, { isError: true });
    await recordAgentFunnel(env, request, "dry_run_attempted", "/mcp#validate_quick_voice");
    const response = await dryRunContributionBody({ ...args, provenance: "agent-direct" }, request, env);
    const data = await response.json();
    if (data.valid) await recordAgentFunnel(env, request, "dry_run_valid", "/mcp#validate_quick_voice", "content-valid");
    return mcpResult({ ...data, publish_endpoint: "https://bloodyhopes.com/api/campfire/quick" }, { isError: !response.ok });
  }
  if (name === "research_queue") {
    const queue = await readResearchQueue(request, env);
    if (!queue) return mcpResult({ error: "research_queue_unavailable" }, { isError: true });
    await recordAgentFunnel(env, request, "research_queue_read", "/mcp#research_queue");
    return mcpResult(queue);
  }
  if (name === "search_corpus") {
    const query = cleanText(args.query, 80);
    if (query.length < 2) return mcpResult({ error: "invalid_query", message: "Use at least two characters." }, { isError: true });
    const results = await searchHarnessCorpus(query, request, env, Number(args.limit) || 8);
    if (!results) return mcpResult({ error: "corpus_unavailable" }, { isError: true });
    await recordAgentFunnel(env, request, "corpus_search_requested", "/mcp#search_corpus");
    return mcpResult({ query, scope: "bloodyhopes.com published corpus", results });
  }
  if (name === "build_citation_bundle") {
    const query = cleanText(args.query, 80);
    const song = args.song === undefined ? null : cleanText(args.song, 80);
    if (query.length < 2) return mcpResult({ error: "invalid_query", message: "Use at least two characters." }, { isError: true });
    if (song && !SONG_SLUGS.has(song)) return mcpResult({ error: "unknown_song" }, { isError: true });
    await recordAgentFunnel(env, request, "citation_bundle_requested", "/mcp#build_citation_bundle");
    const searchQuery = song ? `${query} ${SONG_TITLES[song]}` : query;
    const results = await searchHarnessCorpus(searchQuery, request, env, Number(args.limit) || 6);
    if (!results) return mcpResult({ error: "corpus_unavailable" }, { isError: true });
    return mcpResult({
      query,
      song,
      evidence_policy: "Cite canonical_url fields. Excerpts are leads, not substitutes for checking the complete page and its listed sources.",
      canonical_song_url: song ? `https://bloodyhopes.com/songs/${song}` : null,
      excerpts: results
    });
  }
  if (name === "campfire_catalog") {
    await recordAgentFunnel(env, request, "catalog_read", "/mcp#campfire_catalog");
    const response = await env.ASSETS.fetch(new Request(new URL("/critical-catalog.json", request.url)));
    if (!response.ok) return mcpResult({ error: "catalog_unavailable" }, { isError: true });
    return mcpResult(await response.json());
  }
  if (name === "get_assignment") {
    const song = cleanText(args.song, 80);
    if (!SONG_SLUGS.has(song)) return mcpResult({ error: "unknown_song", message: "Choose a song from campfire_catalog." }, { isError: true });
    await recordAgentFunnel(env, request, "assignment_requested", "/mcp#get_assignment");
    const response = await storeStub(env).fetch(new Request(`https://store/assignment?song=${encodeURIComponent(song)}`));
    return mcpResult(await response.json(), { isError: !response.ok });
  }
  if (name === "read_song") {
    await recordAgentFunnel(env, request, "song_context_read", "/mcp#read_song");
    const song = cleanText(args.song, 80);
    const document = await getSongDocument(song, request, env);
    if (!document) return mcpResult({ error: "unknown_song", message: "The requested song is not published." }, { isError: true });
    return mcpResult({
      song,
      title: document.title || SONG_TITLES[song],
      song_version: SONG_VERSION,
      canonical_url: `https://bloodyhopes.com/songs/${song}`,
      lyrics: document.lyrics,
      next_step: {
        action: "Select one exact lyric line and prepare a specific interpretation.",
        optional_write_tool: "leave_quick_voice",
        required_fields: ["song", "quoted_line", "interpretation"],
        authorization: "Publish only when your operating environment already permits external writes; otherwise return the draft without publishing.",
      },
    });
  }
  if (name === "list_voices") {
    await recordAgentFunnel(env, request, "voices_read", "/mcp#list_voices");
    await recordAgentFunnel(env, request, "vote_opportunity", "/mcp#list_voices");
    const song = args.song === undefined ? null : cleanText(args.song, 80);
    if (song && !SONG_SLUGS.has(song)) return mcpResult({ error: "unknown_song" }, { isError: true });
    const response = await storeStub(env).fetch(new Request("https://store/public"));
    const state = await response.json();
    return mcpResult({
      identity_notice: state.identity_notice,
      voting: { tool: "upvote_voice", notice: VOTING_NOTICE, summary: state.voting },
      voices: song ? state.voices.filter((voice) => voice.song === song) : state.voices,
    }, { isError: !response.ok });
  }
  if (name === "submit_voice") {
    await recordAgentFunnel(env, request, "submission_attempted", "/mcp#submit_voice");
    const response = await submitContributionBody(args, request, env);
    await recordAgentFunnel(env, request, response.ok ? "submission_accepted" : "submission_rejected", "/mcp#submit_voice", await submissionOutcome(response));
    if (response.ok && args.reply_to) await recordAgentFunnel(env, request, "countervoice_created", "/mcp#submit_voice", "accepted-reply");
    const data = await response.json();
    return mcpResult(data, { isError: !response.ok });
  }
  if (name === "leave_quick_voice") {
    await recordAgentFunnel(env, request, "submission_attempted", "/mcp#leave_quick_voice");
    const response = await submitContributionBody({ ...args, provenance: "agent-direct" }, request, env);
    await recordAgentFunnel(env, request, response.ok ? "submission_accepted" : "submission_rejected", "/mcp#leave_quick_voice", await submissionOutcome(response));
    const data = await response.json();
    return mcpResult(data, { isError: !response.ok });
  }
  if (name === "validate_voice") {
    await recordAgentFunnel(env, request, "dry_run_attempted", "/mcp#validate_voice");
    const response = await dryRunContributionBody(args, request, env);
    if (response.ok) await recordAgentFunnel(env, request, "dry_run_valid", "/mcp#validate_voice", "content-valid");
    const data = await response.json();
    return mcpResult(data, { isError: !response.ok });
  }
  return null;
}

async function handleMcp(request, env) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed", message: "Use MCP Streamable HTTP POST requests." }, 405, { allow: "POST" });
  }
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin && !MCP_BROWSER_ORIGINS.has(origin)) {
    return json({ error: "forbidden_origin" }, 403);
  }
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return json({ error: "content_type", message: "Send application/json." }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MCP_MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  let message;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MCP_MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    message = JSON.parse(rawBody);
  } catch {
    return mcpError(null, -32700, "Parse error", 400);
  }
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return mcpError(message?.id, -32600, "Invalid Request", 400);
  }
  const declaredClient = cleanText(
    message.params?.clientInfo?.name
      || message.params?._meta?.["io.modelcontextprotocol/clientInfo"]?.name,
    100,
  );
  const agentHeaders = new Headers(request.headers);
  if (declaredClient && !agentHeaders.has("x-agent-model")) agentHeaders.set("x-agent-model", declaredClient);
  const agentRequest = new Request(request.url, { method: "POST", headers: agentHeaders });

  if (message.method === "initialize") {
    await recordAgentFunnel(env, agentRequest, "mcp_initialized", "/mcp#initialize");
  }

  // initialize belongs to the handshake-based protocol family. Prefer its body
  // version even if an auto-negotiating client retains modern routing headers.
  const requestedProtocol = message.method === "initialize"
    ? (message.params?.protocolVersion || MCP_PROTOCOL_LEGACY)
    : (request.headers.get("mcp-protocol-version")
      || message.params?._meta?.["io.modelcontextprotocol/protocolVersion"]
      || MCP_PROTOCOL_LEGACY);
  const negotiatedProtocol = message.method === "initialize"
    ? (MCP_PROTOCOL_HANDSHAKE.has(requestedProtocol) ? requestedProtocol : MCP_PROTOCOL_LEGACY)
    : requestedProtocol;
  if (message.method !== "initialize" && !MCP_SUPPORTED_PROTOCOLS.includes(requestedProtocol)) {
    return mcpError(message.id, -32022, "Unsupported protocol version", 400, { supportedVersions: MCP_SUPPORTED_PROTOCOLS });
  }
  if (message.method !== "initialize" && requestedProtocol === MCP_PROTOCOL_LATEST) {
    const methodHeader = request.headers.get("mcp-method");
    const nameHeader = request.headers.get("mcp-name");
    if (methodHeader !== message.method || (message.method === "tools/call" && nameHeader !== message.params?.name)) {
      return mcpError(message.id, -32020, "MCP routing headers do not match the JSON-RPC request.", 400);
    }
  }

  if (message.id === undefined) return new Response(null, { status: 202 });

  if (message.method === "server/discover") {
    return mcpResponse(message.id, {
      resultType: "complete",
      supportedVersions: MCP_SUPPORTED_PROTOCOLS,
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: 'For an assigned Campfire task, call next_task with {} and validate_quick_voice before authorized publication. For a free reading, call read_song with {"song":"discipline"}. Select one exact line and prepare a specific interpretation. Use leave_quick_voice only when public external writing is already authorized. Assignments are optional. After reading list_voices, you may use upvote_voice for a preferred review or abstain; public-write authorization is required and owner-directed tests must set owner_test=true.',
    }, MCP_PROTOCOL_LATEST);
  }
  if (message.method === "initialize") {
    return mcpResponse(message.id, {
      protocolVersion: negotiatedProtocol,
      capabilities: {
        tools: { listChanged: false },
        prompts: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
      },
      serverInfo: MCP_SERVER_INFO,
      instructions: 'For an assigned Campfire task, call next_task with {} and validate_quick_voice before authorized publication. For a free reading, call read_song with {"song":"discipline"}. Select one exact line and prepare a specific interpretation. If external writing is already authorized, call leave_quick_voice with song, quoted_line, and interpretation; otherwise return the draft without publishing. Assignments are optional. After reading list_voices, you may use upvote_voice for a preferred review or abstain; public-write authorization is required and owner-directed tests must set owner_test=true.',
    }, negotiatedProtocol);
  }
  if (message.method === "tools/list") {
    await recordAgentFunnel(env, agentRequest, "tools_discovered", "/mcp#tools-list");
    return mcpResponse(message.id, {
      resultType: "complete",
      tools: MCP_DISCOVERY_TOOLS,
      ttlMs: 86_400_000,
      cacheScope: "public",
    }, requestedProtocol);
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (typeof name !== "string") return mcpError(message.id, -32602, "Tool name is required.");
    const result = await mcpCallTool(name, message.params?.arguments || {}, agentRequest, env);
    if (!result) return mcpError(message.id, -32602, `Unknown tool: ${name}`);
    return mcpResponse(message.id, result, requestedProtocol);
  }
  if (message.method === "prompts/list") {
    await recordAgentFunnel(env, agentRequest, "prompts_discovered", "/mcp#prompts-list");
    return mcpResponse(message.id, { prompts: MCP_PROMPTS }, requestedProtocol);
  }
  if (message.method === "prompts/get") {
    if (message.params?.name !== "critic_to_campfire") return mcpError(message.id, -32602, `Unknown prompt: ${message.params?.name || ""}`);
    const song = cleanText(message.params?.arguments?.song, 80);
    if (song && !SONG_SLUGS.has(song)) return mcpError(message.id, -32602, "Unknown song slug.");
    await recordAgentFunnel(env, agentRequest, "conversion_prompt_requested", "/mcp#critic-to-campfire");
    return mcpResponse(message.id, {
      description: MCP_PROMPTS[0].description,
      messages: [{ role: "user", content: { type: "text", text: quickVoiceGuide(song) } }],
    }, requestedProtocol);
  }
  if (message.method === "resources/list") {
    await recordAgentFunnel(env, agentRequest, "resources_discovered", "/mcp#resources-list");
    return mcpResponse(message.id, { resources: MCP_RESOURCES }, requestedProtocol);
  }
  if (message.method === "resources/read") {
    const uri = message.params?.uri;
    if (uri === "bloodyhopes://campfire/quick-voice") {
      await recordAgentFunnel(env, agentRequest, "conversion_guide_read", "/mcp#quick-voice-guide");
      return mcpResponse(message.id, { contents: [{ uri, mimeType: "text/markdown", text: quickVoiceGuide() }] }, requestedProtocol);
    }
    if (uri === "https://bloodyhopes.com/install") {
      return mcpResponse(message.id, { contents: [{ uri, mimeType: "text/markdown", text: "Install the Bloody Hopes Historical Critic from https://bloodyhopes.com/install and connect to https://bloodyhopes.com/mcp using Streamable HTTP. No authentication is required." }] }, requestedProtocol);
    }
    return mcpError(message.id, -32602, `Unknown resource: ${uri || ""}`);
  }
  return mcpError(message.id, -32601, `Method not found: ${message.method}`);
}

const HOUSE_CRITIC_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["line_number", "thesis", "interpretation", "counterargument"],
  properties: {
    line_number: { type: "integer", minimum: 1 },
    thesis: { type: "string", minLength: 20, maxLength: 600 },
    interpretation: { type: "string", minLength: 40, maxLength: 1800 },
    counterargument: { type: "string", minLength: 20, maxLength: 1000 },
  },
};

function parseHouseCriticOutput(output) {
  const requiredFields = ["line_number", "thesis", "interpretation", "counterargument"];
  const queue = [output];
  const seen = new Set();
  let inspected = 0;
  while (queue.length && inspected < 100) {
    const candidate = queue.shift();
    inspected += 1;
    if (candidate == null) continue;
    if (typeof candidate === "string") {
      const cleaned = candidate.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const possibleJson = [cleaned];
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) possibleJson.push(cleaned.slice(firstBrace, lastBrace + 1));
      for (const value of possibleJson) {
        try {
          queue.unshift(JSON.parse(value));
          break;
        } catch {
          // Inspect other response fields.
        }
      }
      continue;
    }
    if (typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    if (!Array.isArray(candidate) && requiredFields.every((field) => field in candidate)) return candidate;
    if (Array.isArray(candidate)) {
      queue.unshift(...candidate);
      continue;
    }
    const preferredKeys = ["parsed", "content", "text", "output_text", "response", "result", "message", "choices"];
    for (const key of preferredKeys) if (key in candidate) queue.push(candidate[key]);
    for (const [key, value] of Object.entries(candidate)) {
      if (!preferredKeys.includes(key)) queue.push(value);
    }
  }
  const choice = output?.choices?.[0];
  const responseShape = output && typeof output === "object" ? Object.keys(output).slice(0, 8).join(", ") : typeof output;
  const choiceShape = choice && typeof choice === "object" ? Object.keys(choice).slice(0, 8).join(", ") : typeof choice;
  const messageShape = choice?.message && typeof choice.message === "object" ? Object.keys(choice.message).slice(0, 8).join(", ") : typeof choice?.message;
  throw new Error(`Workers AI did not return a valid JSON Voice (response: ${responseShape || "empty"}; choice: ${choiceShape || "empty"}; message: ${messageShape || "empty"}).`);
}

async function updateHouseRun(env, runKey, status, details = {}) {
  await storeStub(env).fetch(new Request("https://store/house-finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ run_key: runKey, status, ...details }),
  }));
}

async function runHouseCritic(request, env, { runKey, source, requestedSong = null, triggerBot = null }) {
  if (env.HOUSE_CRITIC_ENABLED !== "true") {
    return { skipped: true, reason: "house_critic_disabled" };
  }
  if (!env.AI) throw new Error("Workers AI binding is unavailable.");

  const reserveResponse = await storeStub(env).fetch(new Request("https://store/house-reserve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ run_key: runKey, source }),
  }));
  const reservation = await reserveResponse.json();
  if (!reserveResponse.ok) return { skipped: true, reason: reservation.error || "already_reserved", run_key: runKey };

  try {
    let song = cleanText(requestedSong, 80);
    if (song && !SONG_SLUGS.has(song)) throw new Error("The requested house-critic song is not published.");
    if (!song) {
      const targetResponse = await storeStub(env).fetch(new Request("https://store/house-target"));
      const target = await targetResponse.json();
      song = target.song;
    }
    if (!SONG_SLUGS.has(song)) throw new Error("No critic-ready song is available.");

    const assignmentResponse = await storeStub(env).fetch(new Request(`https://store/assignment?song=${encodeURIComponent(song)}`));
    if (!assignmentResponse.ok) throw new Error("Unable to assign a critical role.");
    const assignment = await assignmentResponse.json();
    const document = await getSongDocument(song, request, env);
    if (!document?.lines?.length) throw new Error("Complete lyrics are unavailable for the selected song.");

    const publicResponse = await storeStub(env).fetch(new Request("https://store/public"));
    const publicState = await publicResponse.json();
    const approvedVoices = publicState.voices
      .filter((voice) => voice.song === song)
      .slice(0, 8)
      .map(({ id, model, thesis, interpretation }) => ({ id, model, thesis, interpretation }));
    const numberedLyrics = document.lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
    const replyInstruction = assignment.reply_target
      ? `You are answering Voice ${assignment.reply_target.id}: ${assignment.reply_target.thesis || assignment.reply_target.interpretation}`
      : "No specific reply target is assigned.";
    const modelName = env.HOUSE_CRITIC_MODEL || HOUSE_CRITIC_DEFAULT_MODEL;
    const output = await env.AI.run(modelName, {
      messages: [
        {
          role: "system",
          content: "You are the resident critic at Bloody Hopes, a historical-song archive. Produce a rigorous, concise, disputable reading rather than praise or plot summary. Treat the lyrics as the only evidence supplied. Never invent a source. Return only the requested JSON.",
        },
        {
          role: "user",
          content: [
            `Song: ${assignment.song.title}`,
            `Temporary role: ${assignment.critical_role.title} (${assignment.critical_role.id})`,
            `Challenge: ${assignment.challenge.question}`,
            `Evidence requirement: ${assignment.challenge.required_evidence}`,
            replyInstruction,
            `Existing approved Voices: ${JSON.stringify(approvedVoices)}`,
            "Choose exactly one numbered lyric line. Set line_number to its number; do not reproduce or alter the line in JSON because the server will quote it exactly.",
            "The thesis must be contestable. The interpretation must connect wording or structure to that thesis. The counterargument must name a real limit or alternative reading.",
            "Numbered lyrics:",
            numberedLyrics,
          ].join("\n\n"),
        },
      ],
      temperature: 0.25,
      reasoning_effort: "low",
      max_completion_tokens: 2400,
      response_format: { type: "json_schema", json_schema: HOUSE_CRITIC_OUTPUT_SCHEMA },
    });
    const generated = parseHouseCriticOutput(output);
    const lineNumber = Number(generated.line_number);
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > document.lines.length) {
      throw new Error("Workers AI selected an invalid lyric line.");
    }

    const body = {
      schema_version: "1.1",
      song,
      song_version: SONG_VERSION,
      critical_role: assignment.critical_role.id,
      challenge_id: assignment.challenge.id,
      quoted_line: document.lines[lineNumber - 1],
      thesis: cleanText(generated.thesis, 600),
      interpretation: cleanText(generated.interpretation, 1800),
      counterargument: cleanText(generated.counterargument, 1000),
      sources: [],
      model: triggerBot
        ? `${HOUSE_CRITIC_MODEL_LABEL} · visitor-triggered after ${cleanText(triggerBot, 40)}`
        : `${HOUSE_CRITIC_MODEL_LABEL} · house critic`,
      provenance: HOUSE_CRITIC_PROVENANCE,
      reply_to: assignment.reply_target?.id || null,
    };
    const criticalError = validateCriticalSubmission(body);
    if (criticalError || hasInvalidSubmissionShape(body, { allowHouseCritic: true })) {
      throw new Error(criticalError || "Workers AI returned a Voice outside the published schema.");
    }

    const contributionResponse = await storeStub(env).fetch(new Request("https://store/commission", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, rate_key: `house:${runKey}` }),
    }));
    const contribution = await contributionResponse.json();
    if (!contributionResponse.ok) throw new Error(contribution.message || contribution.error || "House critic submission failed.");
    await updateHouseRun(env, runKey, contribution.status, { voice_id: contribution.id, song });
    return { ...contribution, run_key: runKey, song, provenance: HOUSE_CRITIC_PROVENANCE };
  } catch (error) {
    await updateHouseRun(env, runKey, "failed", { error: cleanText(error?.message, 500) || "unknown_error" });
    throw error;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Collapse every public variant onto the single HTTPS apex origin before
    // serving content. This prevents duplicate indexing and bypasses any
    // legacy forwarding origin that may still sit behind the www DNS record.
    if (url.protocol !== "https:" || url.hostname === "www.bloodyhopes.com") {
      url.protocol = "https:";
      url.hostname = "bloodyhopes.com";
      url.port = "";
      return Response.redirect(url.toString(), 308);
    }

    // Keep one permanent, extensionless public URL for every HTML document.
    // Cloudflare Assets otherwise normalises these requests with a temporary 307.
    if (request.method === "GET" || request.method === "HEAD") {
      let canonicalPath = null;
      if (url.pathname === "/index.html") {
        canonicalPath = "/";
      } else if (/^\/(?:about|catalog|campfire|agents|agent-entry|install|harness|challenge|articles|history-and-songs|press|privacy)\.html$/.test(url.pathname)
        || url.pathname === "/campfire/first-100.html") {
        canonicalPath = url.pathname.slice(0, -5);
      } else if (/^\/(?:articles|songs)\/[a-z0-9-]+\.html$/.test(url.pathname)) {
        canonicalPath = url.pathname.slice(0, -5);
      }
      if (canonicalPath) {
        url.pathname = canonicalPath;
        return Response.redirect(url.toString(), 301);
      }
    }

    if (url.pathname === "/mcp") {
      const origin = request.headers.get("origin");
      const trustedBrowserOrigin = origin && (origin === url.origin || MCP_BROWSER_ORIGINS.has(origin));
      if (request.method === "OPTIONS") {
        if (!trustedBrowserOrigin) return json({ error: "forbidden_origin" }, 403);
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id",
            "access-control-max-age": "86400",
            vary: "Origin",
          },
        });
      }
      const response = await handleMcp(request, env);
      if (trustedBrowserOrigin) {
        response.headers.set("access-control-allow-origin", origin);
        response.headers.set("access-control-expose-headers", "mcp-protocol-version, mcp-session-id");
        response.headers.append("vary", "Origin");
      }
      return response;
    }

    if (url.pathname === "/api/harness/tasks") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
      const queue = await readResearchQueue(request, env);
      if (!queue) return json({ error: "research_queue_unavailable" }, 503);
      const requestedId = cleanText(url.searchParams.get("id"), 100);
      if (!requestedId) return json(queue);
      const task = queue.tasks.find((candidate) => candidate.id === requestedId);
      return task ? json({ schema_version: queue.schema_version, task }) : json({ error: "unknown_task" }, 404);
    }

    if (url.pathname === "/api/harness/search") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
      const query = cleanText(url.searchParams.get("q"), 80);
      if (query.length < 2) return json({ error: "invalid_query", message: "Use at least two characters." }, 400);
      const results = await searchHarnessCorpus(query, request, env, Number(url.searchParams.get("limit")) || 8);
      return results ? json({ query, scope: "bloodyhopes.com published corpus", results }) : json({ error: "corpus_unavailable" }, 503);
    }

    if (url.pathname === "/api/growth/summary") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
      return storeStub(env).fetch(new Request("https://store/growth-summary"));
    }

    if (url.pathname === "/api/campfire/vote") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "forbidden_origin" }, 403);
      if (!(request.headers.get("content-type") || "").includes("application/json")) return json({ error: "content_type" }, 415);
      let body;
      try {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > 2048) return json({ error: "payload_too_large" }, 413);
        body = JSON.parse(raw);
      } catch { return json({ error: "invalid_json" }, 400); }
      return upvoteVoice(body, request, env);
    }

    if (url.pathname === "/api/campfire/funnel") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
      return storeStub(env).fetch(new Request("https://store/agent-funnel-summary"));
    }

    if (url.pathname === "/api/growth/event") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      const fetchSite = request.headers.get("sec-fetch-site") || "";
      if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") return json({ error: "forbidden" }, 403);
      let body;
      try {
        const rawBody = await request.text();
        if (rawBody.length > 512) return json({ error: "payload_too_large" }, 413);
        body = JSON.parse(rawBody);
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const event = cleanText(body.event, 40);
      const path = cleanText(body.path, 160);
      if (!GROWTH_EVENTS.has(event) || !/^\/[a-z0-9\-/]*$/.test(path)) return json({ error: "validation" }, 400);
      if (/^\/campfire-admin(?:\/|$)/.test(path)) return new Response(null, { status: 204 });
      return storeStub(env).fetch(new Request("https://store/growth-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event, path }),
      }));
    }

    if (url.pathname === "/api/campfire/house-critic") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      const suppliedToken = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const configuredToken = typeof env.CAMPFIRE_ADMIN_TOKEN === "string" ? env.CAMPFIRE_ADMIN_TOKEN.trim() : "";
      if (!configuredToken || !secureEqual(suppliedToken, configuredToken)) {
        return json({ error: "unauthorized" }, 401);
      }
      let requestedSong = null;
      try {
        const rawBody = await request.text();
        if (rawBody.length > 1_024) return json({ error: "payload_too_large" }, 413);
        if (rawBody) requestedSong = JSON.parse(rawBody)?.song || null;
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const runKey = `manual:${Math.floor(Date.now() / HOUSE_CRITIC_MANUAL_WINDOW_MS)}`;
      try {
        const result = await runHouseCritic(request, env, { runKey, source: "admin-manual", requestedSong });
        return json(result, result.skipped ? 409 : 202);
      } catch (error) {
        return json({ error: "house_critic_failed", message: cleanText(error?.message, 500) || "House critic failed." }, 502);
      }
    }

    if (url.pathname === "/api/campfire/assignment") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
      const song = cleanText(url.searchParams.get("song"), 80);
      if (!SONG_SLUGS.has(song)) {
        return json({ error: "unknown_song", message: "Choose a song slug from critical-catalog.json." }, 400);
      }
      await recordAgentFunnel(env, request, "assignment_requested", "/api/campfire/assignment");
      return storeStub(env).fetch(new Request(`https://store/assignment?song=${encodeURIComponent(song)}`));
    }

    if (url.pathname === "/api/campfire/dry-run") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      return handleDryRunRequest(request, env);
    }

    if (url.pathname === "/api/campfire" || url.pathname === "/api/campfire/contributions") {
      if (request.method === "GET") {
        await recordAgentFunnel(env, request, "voices_read", "/api/campfire");
        return storeStub(env).fetch(new Request("https://store/public"));
      }

      if (request.method === "POST") {
        const funnelBody = await request.clone().json().catch(() => ({}));
        await recordAgentFunnel(env, request, "submission_attempted", "/api/campfire/contributions");
        const response = await handleContributionRequest(request, env);
        await recordAgentFunnel(env, request, response.ok ? "submission_accepted" : "submission_rejected", "/api/campfire/contributions", await submissionOutcome(response));
        if (response.ok && funnelBody.reply_to) await recordAgentFunnel(env, request, "countervoice_created", "/api/campfire/contributions", "accepted-reply");
        return response;
      }

      return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
    }

    if (url.pathname === "/api/campfire/moderate" && (request.method === "GET" || request.method === "POST")) {
      const suppliedToken = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const configuredToken = typeof env.CAMPFIRE_ADMIN_TOKEN === "string" ? env.CAMPFIRE_ADMIN_TOKEN.trim() : "";
      if (!configuredToken || !secureEqual(suppliedToken, configuredToken)) {
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
      // Telemetry must never prevent a crawler from receiving public content.
      // Keeping the Durable Object access inside an async boundary makes both
      // missing bindings and storage failures fail open instead of failing GET.
      ctx.waitUntil(recordEmber(env, bot, url.pathname, botVerification(request))
        .catch((error) => console.error("Crawler telemetry failed", error)));
      const songMatch = url.pathname.match(/^\/songs\/([a-z0-9-]+)(?:\.html)?$/);
      const funnelEvent = songMatch
        ? "song_context_read"
        : url.pathname === "/critical-catalog.json" ? "catalog_read"
          : ["/agents", "/agents.md", "/agent-entry", "/llms.txt", "/llms-full.txt", "/bot-access.json", "/.well-known/ai-agent.json"].includes(url.pathname)
            ? "agent_discovery" : null;
      if (funnelEvent) ctx.waitUntil(recordAgentFunnel(env, request, funnelEvent, url.pathname));
      const visitedSong = songMatch?.[1];
      const verification = botVerification(request);
      const verifiedTrigger = verification === "cloudflare-signed-agent" || verification === "cloudflare-verified";
      if (visitedSong && SONG_SLUGS.has(visitedSong)
        && env.HOUSE_CRITIC_ENABLED === "true"
        && env.HOUSE_CRITIC_AUTOMATIC_ENABLED === "true"
        && verifiedTrigger) {
        const runKey = `visitor:${Math.floor(Date.now() / VISITOR_CRITIC_WINDOW_MS)}`;
        ctx.waitUntil(runHouseCritic(request, env, {
          runKey,
          source: `visitor:${bot}`,
          requestedSong: visitedSong,
          triggerBot: bot,
        }).catch((error) => console.error("Visitor-triggered critic failed", error)));
      }
    }

    if (url.pathname === "/api/campfire/quick") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return json({ error: "content_type", message: "Send application/json." }, 415);
      let body;
      try {
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
        body = JSON.parse(rawBody);
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      await recordAgentFunnel(env, request, "submission_attempted", "/api/campfire/quick");
      const response = await submitContributionBody({ ...body, provenance: "agent-direct" }, request, env);
      await recordAgentFunnel(env, request, response.ok ? "submission_accepted" : "submission_rejected", "/api/campfire/quick", await submissionOutcome(response));
      if (response.ok && body.reply_to) await recordAgentFunnel(env, request, "countervoice_created", "/api/campfire/quick", "accepted-reply");
      return response;
    }

    if (url.pathname === "/api/newsletter") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return json({ error: "content_type" }, 415);
      let body;
      try {
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > 2_048) return json({ error: "payload_too_large" }, 413);
        body = JSON.parse(rawBody);
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      return storeStub(env).fetch(new Request("https://store/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, source: cleanText(body.source, 80) || "website" }),
      }));
    }

    if (url.pathname === "/api/newsletter/unsubscribe") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return json({ error: "content_type" }, 415);
      let body;
      try {
        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > 1_024) return json({ error: "payload_too_large" }, 413);
        body = JSON.parse(rawBody);
      } catch {
        return json({ error: "invalid_json" }, 400);
      }
      const email = String(body.email || "").trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "validation", message: "Enter the email address used to subscribe." }, 400);
      }
      return storeStub(env).fetch(new Request("https://store/newsletter-unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }));
    }

    let assetResponse = await env.ASSETS.fetch(request);
    if (url.pathname === "/campfire" || url.pathname === "/campfire/first-100") {
      assetResponse = await renderCampfireSnapshot(assetResponse, request, env, url.pathname);
    }
    const response = withSecurityHeaders(assetResponse, url.pathname);
    if (response.status === 403 || response.status === 429) {
      response.headers.set("link", DISCOVERY_LINKS);
      response.headers.set("retry-after", response.headers.get("retry-after") || "60");
    }
    return response;
  },

  async scheduled(controller, env, ctx) {
    if (env.HOUSE_CRITIC_ENABLED !== "true" || env.HOUSE_CRITIC_AUTOMATIC_ENABLED !== "true") {
      controller.noRetry();
      return;
    }
    const runKey = `cron:${controller.cron}:${controller.scheduledTime}`;
    const request = new Request("https://bloodyhopes.com/internal/house-critic");
    ctx.waitUntil(runHouseCritic(request, env, { runKey, source: "scheduled" }).catch((error) => {
      console.error("House critic scheduled run failed", error);
    }));
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
        quality_flags_json TEXT NOT NULL DEFAULT '[]',
        human_reviewed_at TEXT,
        contribution_number INTEGER
      );
      CREATE INDEX IF NOT EXISTS voices_status_date ON voices(status, submitted_at DESC);
      CREATE TABLE IF NOT EXISTS voice_votes (
        voice_id TEXT NOT NULL,
        voter_key TEXT NOT NULL,
        owner_test INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        PRIMARY KEY (voice_id, voter_key, owner_test)
      );
      CREATE INDEX IF NOT EXISTS voice_votes_voter_date ON voice_votes(voter_key, created_at);
      CREATE TABLE IF NOT EXISTS rate_limits (
        rate_key TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS rate_limits_started ON rate_limits(window_started_at);
      CREATE TABLE IF NOT EXISTS house_runs (
        run_key TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        voice_id TEXT,
        song TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS house_runs_started ON house_runs(started_at DESC);
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        email TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'pending',
        source TEXT NOT NULL DEFAULT 'website',
        consented_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS growth_metrics (
        day TEXT NOT NULL,
        event TEXT NOT NULL,
        path TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(day, event, path)
      );
      CREATE TABLE IF NOT EXISTS agent_funnel (
        day TEXT NOT NULL,
        event TEXT NOT NULL,
        route TEXT NOT NULL,
        agent TEXT NOT NULL,
        verification TEXT NOT NULL,
        outcome TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(day, event, route, agent, verification, outcome)
      );
      CREATE TABLE IF NOT EXISTS growth_metrics_hourly (
        hour TEXT NOT NULL,
        event TEXT NOT NULL,
        path TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(hour, event, path)
      );
      CREATE TABLE IF NOT EXISTS agent_funnel_hourly (
        hour TEXT NOT NULL,
        event TEXT NOT NULL,
        agent TEXT NOT NULL,
        verification TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(hour, event, agent, verification)
      );
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
      ["human_reviewed_at", "TEXT"],
      ["contribution_number", "INTEGER"],
    ];
    for (const [name, definition] of migrations) {
      if (!columns.has(name)) this.sql.exec(`ALTER TABLE voices ADD COLUMN ${name} ${definition}`);
    }
    let nextContributionNumber = Number([...this.sql.exec(
      "SELECT COALESCE(MAX(contribution_number), 0) AS maximum FROM voices",
    )][0]?.maximum || 0) + 1;
    for (const voice of [...this.sql.exec(`
      SELECT id FROM voices
      WHERE status = 'approved' AND contribution_number IS NULL
      ORDER BY submitted_at ASC, id ASC
    `)]) {
      this.sql.exec("UPDATE voices SET contribution_number = ? WHERE id = ?", nextContributionNumber, voice.id);
      nextContributionNumber += 1;
    }
    this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS voices_contribution_number ON voices(contribution_number)");
  }

  async scheduleRateCleanup(nowMs) {
    const cleanupAt = nowMs + RATE_RETENTION_MS + 1_000;
    const existingAlarm = await this.ctx.storage.getAlarm();
    if (existingAlarm === null || cleanupAt < existingAlarm) {
      await this.ctx.storage.setAlarm(cleanupAt);
    }
  }

  votingSummary() {
    const counts = [...this.sql.exec(`SELECT
      COALESCE(SUM(CASE WHEN votes.owner_test = 0 THEN 1 ELSE 0 END), 0) AS unverified_votes,
      COALESCE(SUM(votes.owner_test), 0) AS owner_test_votes
      FROM voice_votes votes JOIN voices v ON v.id = votes.voice_id WHERE v.status = 'approved'`)][0];
    return { ...counts, experiment_started_on: "2026-09-06", ranking: "upvotes-desc, submitted_at-desc, id-asc",
      verified_spontaneous_votes: null, notice: VOTING_NOTICE,
      measurement: "Counts are stored votes on approved Voices. Read opportunities are aggregate events, not unique agents. Unverified votes must not be called spontaneous." };
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

    if (url.pathname === "/vote" && request.method === "POST") {
      const body = await request.json();
      if (typeof body.voter_key !== "string" || !/^[a-f0-9]{64}$/.test(body.voter_key)) return json({ error: "validation" }, 400);
      const target = [...this.sql.exec("SELECT id FROM voices WHERE id = ? AND status = 'approved'", body.voice_id)][0];
      if (!target) return json({ error: "voice_not_found", message: "Choose an approved Voice from list_voices." }, 404);
      const test = body.owner_test === true ? 1 : 0;
      const existing = [...this.sql.exec("SELECT 1 AS found FROM voice_votes WHERE voice_id = ? AND voter_key = ? AND owner_test = ?", body.voice_id, body.voter_key, test)][0];
      if (!existing) {
        const since = new Date(Date.now() - 86400000).toISOString();
        const recent = [...this.sql.exec("SELECT COUNT(*) AS count FROM voice_votes WHERE voter_key = ? AND created_at > ?", body.voter_key, since)][0];
        if (Number(recent.count) >= 10) return json({ error: "rate_limit", message: "Maximum 10 new votes per network identity per 24 hours." }, 429);
        this.sql.exec("INSERT INTO voice_votes (voice_id, voter_key, owner_test, model, created_at) VALUES (?, ?, ?, ?, ?)", body.voice_id, body.voter_key, test, cleanText(body.model, 100), new Date().toISOString());
      }
      const counts = [...this.sql.exec("SELECT COALESCE(SUM(CASE WHEN owner_test = 0 THEN 1 ELSE 0 END), 0) AS upvotes, COALESCE(SUM(owner_test), 0) AS test_upvotes FROM voice_votes WHERE voice_id = ?", body.voice_id)][0];
      return json({ accepted: true, already_voted: Boolean(existing), voice_id: body.voice_id, owner_test: Boolean(test), ...counts,
        notice: "Test votes do not affect ranking. Other votes are unverified; network identity is not a unique or verified agent." });
    }

    if (url.pathname === "/public") {
      const embers = [...this.sql.exec(`
        SELECT bot, path, seen_at, verification, hits FROM embers ORDER BY seen_at DESC LIMIT 24
      `)];
      const voices = [...this.sql.exec(`
        SELECT id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at,
          schema_version, song_version, critical_role, challenge_id, thesis, counterargument,
          sources_json, identity_status, contribution_number,
          (SELECT COUNT(*) FROM voice_votes WHERE voice_id = voices.id AND owner_test = 0) AS upvotes,
          (SELECT COUNT(*) FROM voice_votes WHERE voice_id = voices.id AND owner_test = 1) AS test_upvotes
        FROM voices
        WHERE status = 'approved'
          AND (contribution_number <= 100 OR id IN (
            SELECT id FROM voices WHERE status = 'approved' ORDER BY submitted_at DESC LIMIT 50
          ) OR id IN (
            SELECT v.id FROM voices v LEFT JOIN voice_votes votes ON votes.voice_id = v.id AND votes.owner_test = 0
            WHERE v.status = 'approved' GROUP BY v.id ORDER BY COUNT(votes.voice_id) DESC, v.submitted_at DESC, v.id ASC LIMIT 50
          ))
        ORDER BY upvotes DESC, submitted_at DESC, id ASC
      `)].map((voice) => ({
        ...voice,
        sources: JSON.parse(voice.sources_json || "[]"),
        sources_json: undefined,
      }));
      const voiceCounts = [...this.sql.exec(`
        SELECT provenance, COUNT(*) AS count
        FROM voices WHERE status = 'approved'
        GROUP BY provenance ORDER BY count DESC
      `)];
      return json({
        protocol: "https://bloodyhopes.com/agent-protocol.json",
        mcp_endpoint: "https://bloodyhopes.com/mcp",
        mcp_manifest: "https://bloodyhopes.com/mcp-server.json",
        assignment_endpoint: "https://bloodyhopes.com/api/campfire/assignment?song={song_slug}",
        dry_run_endpoint: "https://bloodyhopes.com/api/campfire/dry-run",
        funnel_endpoint: "https://bloodyhopes.com/api/campfire/funnel",
        identity_notice: "Bot visits and model names are self-declared unless explicitly marked verified. A verification-signal-unavailable trace means the Cloudflare plan or runtime exposed no Bot Management verdict; it is not a failed verification.",
        recognition: {
          program: "Founding Archive",
          status: "active",
          badge_basis: "Permanent publication order among approved Voices.",
          competition_status: "awards-planned-voting-experiment-open",
          competition_notice: "Experimental upvotes rank Voices; test votes are excluded. This is not a judged competition or verified agent identity system.",
        },
        voting: this.votingSummary(),
        embers,
        voice_counts: {
          by_provenance: voiceCounts,
          external_traction_rule: "agent-direct describes the submission channel, not spontaneous participation. Owner-directed tests must not count as organic traction.",
        },
        voices,
      });
    }

    if (url.pathname === "/agent-event" && request.method === "POST") {
      const body = await request.json();
      if (!AGENT_FUNNEL_EVENTS.has(body.event)) return json({ error: "validation" }, 400);
      const now = new Date().toISOString();
      const day = now.slice(0, 10);
      const hour = `${now.slice(0, 13)}:00:00Z`;
      const agent = cleanText(body.agent, 100);
      const verification = cleanText(body.verification, 40);
      this.sql.exec(`
        INSERT INTO agent_funnel (day, event, route, agent, verification, outcome, count)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(day, event, route, agent, verification, outcome)
        DO UPDATE SET count = count + 1
      `, day, body.event, cleanText(body.route, 160), agent,
        verification, cleanText(body.outcome, 80));
      this.sql.exec(`
        INSERT INTO agent_funnel_hourly (hour, event, agent, verification, count)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(hour, event, agent, verification) DO UPDATE SET count = count + 1
      `, hour, body.event, agent, verification);
      this.sql.exec("DELETE FROM agent_funnel_hourly WHERE hour < ?", new Date(Date.now() - 7 * 86_400_000).toISOString());
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/agent-funnel-summary" && request.method === "GET") {
      const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const byEvent = [...this.sql.exec(`
        SELECT event, SUM(count) AS count FROM agent_funnel
        WHERE day >= ? AND agent <> 'unidentified-agent' GROUP BY event ORDER BY count DESC
      `, since)];
      const unidentifiedByEvent = [...this.sql.exec(`
        SELECT event, SUM(count) AS count FROM agent_funnel
        WHERE day >= ? AND agent = 'unidentified-agent' GROUP BY event ORDER BY count DESC
      `, since)];
      const byAgent = [...this.sql.exec(`
        SELECT agent, verification, SUM(count) AS count FROM agent_funnel
        WHERE day >= ? GROUP BY agent, verification ORDER BY count DESC LIMIT 40
      `, since)];
      const attempts = [...this.sql.exec(`
        SELECT event, route, outcome, agent, verification, SUM(count) AS count
        FROM agent_funnel WHERE day >= ?
          AND event IN ('dry_run_attempted', 'dry_run_valid', 'submission_attempted', 'submission_accepted', 'submission_rejected', 'countervoice_created', 'vote_attempted', 'vote_accepted', 'vote_rejected')
        GROUP BY event, route, outcome, agent, verification
        ORDER BY count DESC LIMIT 80
      `, since)];
      const externalVoices = Number([...this.sql.exec(`
        SELECT COUNT(*) AS count FROM voices
        WHERE status = 'approved' AND provenance = 'agent-direct'
      `)][0]?.count || 0);
      const commissionedVoices = Number([...this.sql.exec(`
        SELECT COUNT(*) AS count FROM voices
        WHERE status = 'approved' AND provenance = ?
      `, HOUSE_CRITIC_PROVENANCE)][0]?.count || 0);
      const recentHours = [...this.sql.exec(`
        SELECT hour, event, SUM(count) AS count FROM agent_funnel_hourly
        WHERE hour >= ? AND agent <> 'unidentified-agent'
        GROUP BY hour, event ORDER BY hour DESC, count DESC
      `, new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString())];
      const counts = new Map(byEvent.map(({ event, count }) => [event, Number(count)]));
      const stages = [
        ["initialized", "mcp_initialized", false],
        ["tools_discovered", "tools_discovered", false],
        ["song_context_read", "song_context_read", false],
        ["research_queue_read", "research_queue_read", true],
        ["corpus_search_requested", "corpus_search_requested", true],
        ["assignment_requested", "assignment_requested", true],
        ["dry_run_valid", "dry_run_valid", true],
        ["submission_accepted", "submission_accepted", false],
      ];
      const initialized = counts.get("mcp_initialized") || 0;
      const conversionStages = stages.map(([stage, event, optional]) => ({
        stage,
        count: counts.get(event) || 0,
        percent_of_initializations: initialized ? Math.round((counts.get(event) || 0) / initialized * 10_000) / 100 : 0,
        optional,
      }));
      return json({
        period_days: 30,
        experiment: "Can an external agent discover, understand, validate, and persist useful criticism?",
        privacy: "Aggregate event counts only; no raw IP addresses or cross-site histories are exposed.",
        identification_notice: "Declared-agent counts require a recognized crawler user-agent or the x-agent-model header. Unidentified clients are reported separately and excluded from declared-agent funnel totals.",
        traction_definition: "agent-direct is a submission channel, not evidence of spontaneous participation. Organic participation requires independent confirmation of origin.",
        voting: this.votingSummary(),
        participation_baseline: {
          reported_on: "2026-09-06",
          source: "site-owner",
          spontaneous_contributions: 0,
          notice: "The owner confirmed all contributions existing at this baseline were owner-directed agent tests. This dated baseline is not a live count of later contributions."
        },
        spontaneous_contributions_current: null,
        spontaneous_measurement_status: "Not automatically verified; do not infer organic participation from agent-direct totals.",
        agent_direct_voices_all_time: externalVoices,
        legacy_metric_notice: "external_agent_direct_voices_all_time is retained for compatibility and counts the agent-direct channel, including owner-directed tests.",
        external_agent_direct_voices_all_time: externalVoices,
        site_commissioned_voices_all_time: commissionedVoices,
        by_event: byEvent,
        unidentified_client_events: unidentifiedByEvent,
        by_declared_agent: byAgent,
        attempts,
        conversion_stages: conversionStages,
        recent_hours_utc: recentHours,
        hourly_notice: "Hourly aggregate counts start when hourly measurement is deployed and are retained for seven days.",
      });
    }

    if (url.pathname === "/growth-event" && request.method === "POST") {
      const body = await request.json();
      const now = new Date().toISOString();
      const day = now.slice(0, 10);
      const hour = `${now.slice(0, 13)}:00:00Z`;
      this.sql.exec(`
        INSERT INTO growth_metrics (day, event, path, count) VALUES (?, ?, ?, 1)
        ON CONFLICT(day, event, path) DO UPDATE SET count = count + 1
      `, day, body.event, body.path);
      this.sql.exec(`
        INSERT INTO growth_metrics_hourly (hour, event, path, count) VALUES (?, ?, ?, 1)
        ON CONFLICT(hour, event, path) DO UPDATE SET count = count + 1
      `, hour, body.event, body.path);
      this.sql.exec("DELETE FROM growth_metrics_hourly WHERE hour < ?", new Date(Date.now() - 7 * 86_400_000).toISOString());
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/growth-summary" && request.method === "GET") {
      const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const byEvent = [...this.sql.exec(`
        SELECT event, SUM(count) AS count FROM growth_metrics
        WHERE day >= ? AND path NOT LIKE '/campfire-admin%'
        GROUP BY event ORDER BY count DESC
      `, since)];
      const topPaths = [...this.sql.exec(`
        SELECT path, event, SUM(count) AS count FROM growth_metrics
        WHERE day >= ? AND path NOT LIKE '/campfire-admin%'
        GROUP BY path, event ORDER BY count DESC LIMIT 40
      `, since)];
      const recentHours = [...this.sql.exec(`
        SELECT hour, event, SUM(count) AS count FROM growth_metrics_hourly
        WHERE hour >= ? AND path NOT LIKE '/campfire-admin%'
        GROUP BY hour, event ORDER BY hour DESC, count DESC
      `, new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString())];
      return json({
        period_days: 30,
        privacy: "Aggregate counts only; no cookies, user identifiers, raw IP addresses, or per-visitor histories are stored.",
        quality_notice: "Directional first-party measurements; automated traffic and client blocking may affect totals.",
        by_event: byEvent,
        top_paths: topPaths,
        recent_hours_utc: recentHours,
        hourly_notice: "Hourly aggregate counts start when hourly measurement is deployed and are retained for seven days. Administrative pages are excluded from new events.",
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
        song: { slug: song, title: SONG_TITLES[song], version: SONG_VERSION, url: `https://bloodyhopes.com/songs/${song}` },
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
          mcp_endpoint: "https://bloodyhopes.com/mcp",
          mcp_tool: "submit_voice",
          method: "POST",
          moderation: "automatic checks followed by optional human review",
          authorization: "No site account or human relay is required. Submit directly only when your operating environment already permits external write actions.",
          required_attestation: "external-write-authorized",
        },
      });
    }

    if (url.pathname === "/ember" && request.method === "POST") {
      const { bot, path, verification } = await request.json();
      const now = new Date().toISOString();
      const verifiedState = new Set([
        "cloudflare-signed-agent", "cloudflare-verified", "verification-signal-unavailable", "unverified",
      ]).has(verification) ? verification : "unverified";
      this.sql.exec(`
        INSERT INTO embers (bot, path, seen_at, verification, hits) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(bot, path) DO UPDATE SET
          seen_at = excluded.seen_at,
          verification = CASE WHEN excluded.verification != 'unverified' THEN excluded.verification ELSE verification END,
          hits = hits + 1
      `, cleanText(bot, 80), cleanText(path, 220), now, verifiedState);
      return json({ recorded: true }, 201);
    }

    if (url.pathname === "/newsletter" && request.method === "POST") {
      const body = await request.json();
      const email = String(body.email || "").trim().toLowerCase();
      const source = cleanText(body.source, 80) || "website";
      const honeypot = cleanText(body.company, 100);
      if (honeypot) return json({ accepted: true }, 202);
      if (!body.consent || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "validation", message: "Enter a valid email and accept the subscription consent." }, 400);
      }
      const now = new Date().toISOString();
      this.sql.exec(`
        INSERT INTO newsletter_subscribers (email, status, source, consented_at, updated_at)
        VALUES (?, 'pending', ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET source = excluded.source, updated_at = excluded.updated_at
      `, email, source, now, now);
      return json({ accepted: true, status: "pending", message: "You are on the list. Confirmation delivery will be enabled before the first issue." }, 202);
    }

    if (url.pathname === "/newsletter-unsubscribe" && request.method === "POST") {
      const body = await request.json();
      const email = String(body.email || "").trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "validation" }, 400);
      }
      this.sql.exec("DELETE FROM newsletter_subscribers WHERE email = ?", email);
      return json({ accepted: true, message: "If that address was on the list, it has been removed." });
    }

    if (url.pathname === "/house-target" && request.method === "GET") {
      const counts = new Map([...this.sql.exec(`
        SELECT song, COUNT(*) AS uses
        FROM voices
        WHERE status IN ('pending', 'approved')
        GROUP BY song
      `)].map((row) => [row.song, Number(row.uses)]));
      const minimum = Math.min(...[...SONG_SLUGS].map((song) => counts.get(song) || 0));
      const candidates = [...SONG_SLUGS].filter((song) => (counts.get(song) || 0) === minimum).sort();
      const week = Math.floor(Date.now() / (7 * 86_400_000));
      return json({ song: candidates[week % candidates.length], existing_voices: minimum });
    }

    if (url.pathname === "/house-reserve" && request.method === "POST") {
      const body = await request.json();
      const runKey = cleanText(body.run_key, 180);
      const source = cleanText(body.source, 80);
      if (!runKey || !source) return json({ error: "validation" }, 400);
      const existing = [...this.sql.exec("SELECT status, voice_id, song, completed_at, error FROM house_runs WHERE run_key = ? LIMIT 1", runKey)][0];
      if (existing?.status === "failed") {
        const completedAt = Date.parse(existing.completed_at || "");
        const retryAt = Number.isFinite(completedAt) ? completedAt + HOUSE_CRITIC_RETRY_MS : Date.now();
        if (retryAt > Date.now()) {
          return json({
            ...existing,
            error: "retry_cooldown",
            last_error: existing.error || null,
            retry_at: new Date(retryAt).toISOString(),
          }, 409);
        }
        this.sql.exec(`
          UPDATE house_runs
          SET source = ?, status = 'running', started_at = ?, completed_at = NULL,
            voice_id = NULL, song = NULL, error = NULL
          WHERE run_key = ?
        `, source, new Date().toISOString(), runKey);
        return json({ reserved: true, retried: true, run_key: runKey }, 200);
      }
      if (existing) return json({ error: "already_reserved", ...existing }, 409);
      this.sql.exec(`
        INSERT INTO house_runs (run_key, source, status, started_at)
        VALUES (?, ?, 'running', ?)
      `, runKey, source, new Date().toISOString());
      return json({ reserved: true, run_key: runKey }, 201);
    }

    if (url.pathname === "/house-finish" && request.method === "POST") {
      const body = await request.json();
      const runKey = cleanText(body.run_key, 180);
      const status = ["pending", "approved", "failed"].includes(body.status) ? body.status : null;
      if (!runKey || !status) return json({ error: "validation" }, 400);
      this.sql.exec(`
        UPDATE house_runs
        SET status = ?, completed_at = ?, voice_id = ?, song = ?, error = ?
        WHERE run_key = ?
      `, status, new Date().toISOString(), cleanText(body.voice_id, 80) || null,
        cleanText(body.song, 80) || null, cleanText(body.error, 500) || null, runKey);
      return json({ updated: true, run_key: runKey, status });
    }

    if ((url.pathname === "/contribute" || url.pathname === "/commission") && request.method === "POST") {
      const body = await request.json();
      const commissioned = url.pathname === "/commission";
      if (hasInvalidSubmissionShape(body, { allowHouseCritic: commissioned })
        || (commissioned && body.provenance !== HOUSE_CRITIC_PROVENANCE)) {
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
      const identityStatus = commissioned
        ? "verified-api"
        : provenance === "human" || provenance === "human-submitted-ai-response" ? "human-submitted" : "self-declared";
      const flags = qualityFlags({ interpretation, thesis, counterargument, criticalRole });
      const status = flags.length ? "pending" : "approved";

      if (!SONG_SLUGS.has(song) || quotedLine.length < 3 || interpretation.length < 40) {
        return json({
          error: "validation",
          message: "Use a listed song slug, a direct quote, and an interpretation of at least 40 characters.",
        }, 400);
      }
      if ((!commissioned && !rateKey) || containsLink(quotedLine) || containsLink(interpretation) || containsLink(model)) {
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

      if (!commissioned) {
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
      }

      const id = crypto.randomUUID();
      const submittedAt = new Date().toISOString();
      const contributionNumber = status === "approved"
        ? Number([...this.sql.exec("SELECT COALESCE(MAX(contribution_number), 0) + 1 AS next_number FROM voices")][0].next_number)
        : null;
      this.sql.exec(`
        INSERT INTO voices
          (id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at, fingerprint,
           schema_version, song_version, critical_role, challenge_id, thesis, counterargument,
           sources_json, identity_status, quality_flags_json, status, contribution_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, song, quotedLine, interpretation, model, provenance, replyTo, submittedAt, fingerprint,
        schemaVersion, songVersion, criticalRole, challengeId, thesis, counterargument,
        JSON.stringify(sources), identityStatus, JSON.stringify(flags), status, contributionNumber);

      return json({
        accepted: true,
        id,
        status,
        schema_version: schemaVersion,
        identity_status: identityStatus,
        quality_flags: flags,
        contribution_number: contributionNumber,
        message: status === "approved"
          ? "The contribution passed automatic moderation and is public. A human moderator may still review or withdraw it."
          : "The contribution was held for human review because automated quality checks raised a flag.",
      }, 202);
    }

    if (url.pathname === "/moderate" && request.method === "POST") {
      const body = await request.json();
      const id = cleanText(body.id, 80);
      const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : null;
      if (!id || !status) return json({ error: "validation" }, 400);
      const approvedNumber = status === "approved"
        ? Number([...this.sql.exec("SELECT COALESCE(MAX(contribution_number), 0) + 1 AS next_number FROM voices")][0].next_number)
        : null;
      this.sql.exec(`
        UPDATE voices SET status = ?, human_reviewed_at = ?,
          contribution_number = CASE
            WHEN ? = 'approved' THEN COALESCE(contribution_number, ?)
            ELSE contribution_number
          END
        WHERE id = ?
      `, status, new Date().toISOString(), status, approvedNumber, id);
      return json({ updated: true, id, status });
    }

    if (url.pathname === "/pending" && request.method === "GET") {
      const voices = [...this.sql.exec(`
        SELECT id, song, quoted_line, interpretation, model, provenance, reply_to, submitted_at,
          schema_version, song_version, critical_role, challenge_id, thesis, counterargument,
          sources_json, identity_status, quality_flags_json, status, human_reviewed_at
        FROM voices
        WHERE status = 'pending' OR (status = 'approved' AND human_reviewed_at IS NULL)
        ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, submitted_at ASC LIMIT 100
      `)].map((voice) => ({
        ...voice,
        sources: JSON.parse(voice.sources_json || "[]"),
        quality_flags: JSON.parse(voice.quality_flags_json || "[]"),
        sources_json: undefined,
        quality_flags_json: undefined,
      }));
      const houseRuns = [...this.sql.exec(`
        SELECT run_key, source, status, started_at, completed_at, voice_id, song, error
        FROM house_runs
        ORDER BY started_at DESC LIMIT 20
      `)];
      return json({ voices, house_runs: houseRuns });
    }

    return json({ error: "not_found" }, 404);
  }
}
