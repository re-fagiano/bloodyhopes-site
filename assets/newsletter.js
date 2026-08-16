(() => {
  const form = document.querySelector("[data-newsletter-form]");
  if (!form) return;
  const status = form.querySelector("[data-newsletter-status]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const data = new FormData(form);
    button.disabled = true;
    status.textContent = "Joining…";
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), consent: data.get("consent") === "yes", company: data.get("company"), source: form.dataset.source || "website" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Subscription could not be saved.");
      status.textContent = result.message;
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
