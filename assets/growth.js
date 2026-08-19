(() => {
  const endpoint = "/api/growth/event";
  const cleanPath = (value) => {
    const path = new URL(value, location.href).pathname.replace(/\.html$/, "") || "/";
    return /^\/[a-z0-9\-/]*$/.test(path) ? path.slice(0, 160) : "/";
  };
  const track = (event, path = location.pathname) => {
    const body = JSON.stringify({ event, path: cleanPath(path) });
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    else fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  };
  window.bloodyHopesTrack = track;
  track("page_view");
  if (location.pathname.startsWith("/campfire")) track("campfire_open");
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (/youtube\.com$|youtu\.be$/.test(url.hostname.replace(/^www\./, ""))) {
      track("youtube_click", link.dataset.growthPath || location.pathname);
    }
    else if (url.origin === location.origin && /^\/(songs|articles)\//.test(url.pathname)) track("content_open", url.pathname);
    else if (url.origin === location.origin && url.pathname.startsWith("/campfire")) track("campfire_open", url.pathname);
  });
})();
