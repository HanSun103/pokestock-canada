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
    if (match) return decodeXml(match[1].replace(/<[^>]+>/g, ""));
  }
  return null;
}

function parseRemoteFeed(body, contentType, url) {
  if (contentType.includes("json") || body.trimStart().startsWith("{")) {
    const json = JSON.parse(body);
    return json.items ?? json.signals ?? [];
  }

  const blocks = [...body.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.map((block) => {
    const linkAttribute = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1];
    return {
      title: tag(block, ["title"]),
      url: linkAttribute ?? tag(block, ["link", "guid"]),
      publishedAt: tag(block, ["published", "updated", "pubDate"]),
      discoveredAt: new Date().toISOString(),
      eventType: "expansion-announced",
      region: "global",
      product: {
        id: `unclassified-${Buffer.from(url).toString("base64url").slice(0, 12)}`,
        name: tag(block, ["title"]) ?? "Unclassified Pokémon publication",
        series: "Needs classification",
        type: "other",
        releaseDate: null,
      },
      facts: ["Automatically collected feed item; product classification requires review."],
      expectedAction: "Review before raising an actionable alert.",
    };
  });
}

export async function readConfiguredSources(config, root, collectedAt, fetchImpl = fetch) {
  const batches = [];
  for (const source of config.sources.filter((candidate) => candidate.enabled)) {
    if (source.type !== "json-file") throw new Error(`unsupported configured source type: ${source.type}`);
    const path = resolve(root, source.path);
    if (path !== root && !path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) throw new Error(`source escapes project root: ${source.path}`);
    const document = JSON.parse(await readFile(path, "utf8"));
    batches.push({ source, items: document.items ?? [] });
  }

  const remoteUrls = (process.env.POKESTOCK_FEED_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const [index, value] of remoteUrls.entries()) {
    const url = new URL(value);
    if (config.remoteFeedPolicy.requireHttps && url.protocol !== "https:") throw new Error(`remote feed must use HTTPS: ${value}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.remoteFeedPolicy.timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": config.remoteFeedPolicy.userAgent, Accept: "application/feed+json, application/json, application/atom+xml, application/rss+xml, text/xml" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`remote feed returned ${response.status}: ${value}`);
      const body = await response.text();
      batches.push({
        source: { id: `permitted-remote-${index + 1}`, name: url.hostname, publisherClass: "permitted-feed", region: "unknown" },
        items: parseRemoteFeed(body, response.headers.get("content-type") ?? "", value),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  return { batches, collectedAt };
}
