(() => {
  const form = document.querySelector("[data-unsubscribe-form]");
  if (!form) return;
  const status = form.querySelector("[data-unsubscribe-status]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const email = new FormData(form).get("email");
    button.disabled = true;
    status.textContent = "Removing the address…";
    try {
      const response = await fetch("/api/newsletter/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "The request could not be completed.");
      status.textContent = result.message;
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
