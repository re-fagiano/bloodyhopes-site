const source = (new URLSearchParams(location.search).get("source") || "direct").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "direct";

function track(event) {
  fetch("/api/growth/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, path: `/install/${source}` }),
    keepalive: true
  }).catch(() => {});
}

track("install_view");

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.closest("article")?.querySelector("code")?.textContent || "";
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
    track("install_copy");
    setTimeout(() => { button.textContent = "Copy"; }, 1600);
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => entry.target.classList.toggle("is-visible", entry.isIntersecting));
}, { threshold: 0.18 });
document.querySelectorAll(".install-section").forEach((section) => observer.observe(section));
