/* ANIMA — Service Worker (PWA)
   Network-first para archivos propios (siempre lo último), con
   respaldo a caché cuando no hay conexión. No intercepta Supabase ni CDNs. */
const CACHE = "anima-v72";
const ASSETS = [
  "./", "index.html", "studio.html", "portfolio.html", "legal.html", "manifest.webmanifest",
  "umbral.html", "despertar.html", "home.html", "planes.html",
  "assets/css/anima.css", "assets/css/studio.css", "assets/css/umbral.css", "assets/css/world-tree.css", "assets/css/identity.css",
  "assets/js/seed.js", "assets/js/supabase.js", "assets/js/anima.js", "assets/js/portfolio.js",
  "assets/js/anima-state.js", "assets/js/rite.js", "assets/js/world-tree.js", "assets/js/icons.js",
  "assets/img/icon.svg", "assets/img/lumbre.svg", "assets/img/og-anima.png"
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

  /* La plataforma (/app/) NO pasa por aquí, y es a propósito.
     ---------------------------------------------------------------------
     Su index.html apunta a un bundle cuyo nombre lleva un hash que cambia
     en cada build. Cachear ESE html es lo que deja a alguien pidiendo un
     JavaScript que ya no existe en el servidor: el documento viejo sobrevive
     en la caché, el archivo al que apunta se borró con el despliegue nuevo,
     y /app/ queda en blanco sin decir por qué. Ya pasó una vez (#79).

     Los archivos con hash en el nombre no necesitan este service worker: no
     cambian nunca de contenido, así que la caché del navegador ya los sirve
     bien y para siempre. Lo único que esta capa aportaba sobre /app/ era la
     posibilidad de servir una versión vieja.

     El sitio —la portada, STUDIO, el Árbol— sigue igual: ahí los archivos
     tienen nombre fijo y la caché sí sirve para que funcione sin conexión. */
  if (url.pathname.startsWith("/app/")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match("home.html")))
  );
});
