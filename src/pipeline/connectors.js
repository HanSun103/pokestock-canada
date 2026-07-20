import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(xml, names) {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return decodeXml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  }
  return null;
}

function linkedUrls(xml) {
  return [...xml.matchAll(/href=["'](https:\/\/[^"']+)["']/gi)]
    .map((match) => decodeXml(match[1]))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function parseRemoteFeed(body, contentType, feedUrl, discoveredAt) {
  if (contentType.includes("json") || body.trimStart().startsWith("{")) {
    const json = JSON.parse(body);
    return (json.items ?? []).map((item, index) => ({
      id: String(item.id ?? `remote-${index + 1}`),
      title: String(item.title ?? "Untitled publication"),
      url: String(item.url ?? item.external_url ?? feedUrl),
      publishedAt: item.date_published ?? item.date_modified ?? item.publishedAt,
      publicationTimePrecision: item.publicationTimePrecision ?? "exact",
      discoveredAt,
      text: String(item.content_text ?? item.summary ?? item.content_html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      linkedUrls: linkedUrls(String(item.content_html ?? "")),
    }));
  }

  const blocks = [...body.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.map((block, index) => {
    const linkAttribute = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
    return {
      id: tag(block, ["id", "guid"]) ?? `remote-${index + 1}`,
      title: tag(block, ["title"]) ?? "Untitled publication",
      url: linkAttribute ?? tag(block, ["link", "guid"]) ?? feedUrl,
      publishedAt: tag(block, ["published", "updated", "pubDate"]),
      publicationTimePrecision: "exact",
      discoveredAt,
      text: tag(block, ["summary", "description", "content"]) ?? "",
      linkedUrls: linkedUrls(block),
    };
  });
}

function isReleaseCandidate(publication, filter = {}) {
  const haystack = `${publication.title} ${publication.text}`.toLowerCase();
  const topics = filter.requiredTopicTerms ?? [];
  const releaseTerms = filter.requiredReleaseTerms ?? [];
  return (!topics.length || topics.some((term) => haystack.includes(term.toLowerCase())))
    && (!releaseTerms.length || releaseTerms.some((term) => haystack.includes(term.toLowerCase())));
}

async function fetchFeed(feed, config, collectedAt, fetchImpl) {
  const url = new URL(feed.url);
  if (config.remoteFeedPolicy.requireHttps && url.protocol !== "https:") throw new Error(`remote feed must use HTTPS: ${feed.url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.remoteFeedPolicy.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": config.remoteFeedPolicy.userAgent, Accept: "application/feed+json, application/json, application/atom+xml, application/rss+xml, text/xml" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`remote feed returned ${response.status}: ${feed.url}`);
    const body = await response.text();
    const discoveryFilter = { ...(config.discoveryFilter ?? {}), ...(feed.discoveryFilter ?? {}) };
    const publications = parseRemoteFeed(body, response.headers.get("content-type") ?? "", feed.url, collectedAt)
      .filter((publication) => isReleaseCandidate(publication, discoveryFilter))
      .slice(0, discoveryFilter.maxItemsPerSource ?? 25);
    return {
      source: {
        id: feed.id,
        name: feed.name,
        publisherClass: feed.publisherClass ?? "permitted-feed",
        region: feed.region ?? "unknown",
        leadOnly: Boolean(feed.leadOnly),
      },
      publications,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function readConfiguredSources(config, root, collectedAt, fetchImpl = fetch) {
  const batches = [];
  const rawBatches = [];
  const sourceErrors = [];
  for (const source of config.sources.filter((candidate) => candidate.enabled)) {
    if (source.type !== "json-file") throw new Error(`unsupported configured source type: ${source.type}`);
    const path = resolve(root, source.path);
    if (path !== root && !path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) throw new Error(`source escapes project root: ${source.path}`);
    const document = JSON.parse(await readFile(path, "utf8"));
    batches.push({ source, items: document.items ?? [] });
  }

  const supplemental = (process.env.POKESTOCK_FEED_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean)
    .map((url, index) => ({ id: `permitted-remote-${index + 1}`, name: new URL(url).hostname, url, publisherClass: "permitted-feed", region: "unknown", enabled: true }));
  const feeds = [...(config.discoveryFeeds ?? []).filter((feed) => feed.enabled), ...supplemental];
  for (const feed of feeds) {
    try {
      const batch = await fetchFeed(feed, config, collectedAt, fetchImpl);
      if (batch.publications.length) rawBatches.push(batch);
    } catch (error) {
      sourceErrors.push({ sourceId: feed.id, message: error.message });
      console.warn(`Discovery feed ${feed.id} skipped: ${error.message}`);
    }
  }
  return { batches, rawBatches, sourceErrors, collectedAt };
}
