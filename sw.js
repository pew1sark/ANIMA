/* ANIMA — Service Worker (PWA)
   Network-first para archivos propios (siempre lo último), con
   respaldo a caché cuando no hay conexión. No intercepta Supabase ni CDNs. */
const CACHE = "anima-v11";
const ASSETS = [
  "./", "index.html", "studio.html", "roadmap.html", "portfolio.html", "legal.html", "manifest.webmanifest",
  "umbral.html", "despertar.html", "home.html", "alpha.html",
  "assets/css/anima.css", "assets/css/studio.css", "assets/css/umbral.css", "assets/css/world-tree.css", "assets/css/identity.css", "assets/css/alpha.css",
  "assets/js/seed.js", "assets/js/supabase.js", "assets/js/anima.js", "assets/js/portfolio.js",
  "assets/js/anima-state.js", "assets/js/rite.js", "assets/js/world-tree.js", "assets/js/icons.js", "assets/js/alpha.js",
  "assets/img/icon.svg", "assets/img/lumbre.svg"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // deja pasar Supabase/CDN/fuentes
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match("home.html")))
  );
});
