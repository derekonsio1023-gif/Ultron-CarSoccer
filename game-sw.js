const CACHE_PREFIX = "car-soccer-offline-";
const CACHE_NAME = CACHE_PREFIX + "d5f32609df9cf5083b30";
const BASE_URL = new URL(".", self.location.href);
const MANIFEST_PATH = new URL("offline-manifest.json", BASE_URL).href;
const MANIFEST_KEY = new URL("__car-soccer-offline-manifest__", BASE_URL).href;
const INDEX_URL = new URL("index.html", BASE_URL).href;
const APP_DOCUMENTS = new Map([
  [BASE_URL.pathname, INDEX_URL],
  [new URL("index.html", BASE_URL).pathname, INDEX_URL],
  [new URL("embed", BASE_URL).pathname, new URL("embed.html", BASE_URL).href],
  [new URL("online", BASE_URL).pathname, new URL("online.html", BASE_URL).href],
  [new URL("legal", BASE_URL).pathname, new URL("legal/index.html", BASE_URL).href],
]);

async function loadManifest(cache) {
  const cached = await cache.match(MANIFEST_KEY);
  const response = cached || await fetch(MANIFEST_PATH, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${MANIFEST_PATH}: ${response.status}`);

  const manifest = await response.json();
  if (!manifest || !Array.isArray(manifest.entries)) {
    throw new Error("The offline manifest has an invalid format.");
  }
  return manifest;
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}

async function cacheEntries(cache, manifest) {
  const entries = manifest.entries;
  let completed = 0;

  for (let index = 0; index < entries.length; index += 6) {
    const batch = entries.slice(index, index + 6);
    await Promise.all(batch.map(async (entry) => {
      const url = new URL(entry.url, BASE_URL);
      if (url.origin !== self.location.origin || !Number.isSafeInteger(entry.bytes)) {
        throw new Error(`Invalid offline manifest entry: ${entry.url}`);
      }

      const options = { cache: "reload" };
      if (entry.integrity && !["/index.html", "/online.html"].includes(url.pathname)) {
        options.integrity = entry.integrity;
      }
      const response = await fetch(new Request(url.href, options));
      if (!response.ok) throw new Error(`Could not download ${entry.url}: ${response.status}`);
      await cache.put(url.href, response);
      completed += 1;
    }));

    await notifyClients({ kind: "offline-progress", completed, total: entries.length });
  }

  await cache.put(
    MANIFEST_KEY,
    new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const manifest = await loadManifest(cache);
      await cacheEntries(cache, manifest);
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      await notifyClients({
        kind: "offline-progress",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const port = event.ports[0];
  if (event.data?.kind === "activate-update") {
    port?.postMessage({ kind: "update-activating" });
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.kind !== "prepare-offline" || !port) return;

  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const manifest = await loadManifest(cache);
      const missing = [];
      for (const entry of manifest.entries) {
        const url = new URL(entry.url, BASE_URL);
        if (!(await cache.match(url.href))) missing.push(entry);
      }
      if (missing.length) {
        await cacheEntries(cache, { entries: missing });
      }
      port.postMessage({ kind: "offline-ready" });
    } catch (error) {
      port.postMessage({
        kind: "offline-error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      port.close();
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    if (request.mode === "navigate") {
      const documentPath = APP_DOCUMENTS.get(url.pathname) || INDEX_URL;
      const documentResponse = await cache.match(documentPath);
      if (documentResponse) return documentResponse;
    }

    return fetch(request);
  })());
});