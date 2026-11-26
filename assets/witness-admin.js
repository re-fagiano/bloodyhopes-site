let token = "";
const status = document.getElementById("status");
const queue = document.getElementById("queue");
async function call(method, body, after = 0) {
  const filter = document.getElementById("filter").value;
  const response = await fetch(`/api/witness/moderate?status=${encodeURIComponent(filter)}&after=${after}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function load(after = 0) {
  const data = await call("GET", undefined, after);
  queue.replaceChildren();
  for (const branch of data.branches) {
    const article = document.createElement("article");
    const title = document.createElement("h2"); title.textContent = branch.thesis;
    const details = document.createElement("pre"); details.textContent = JSON.stringify(branch, null, 2);
    article.append(title, details);
    for (const action of ["approved", "withdrawn"]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = action === "approved" ? "Approve" : "Withdraw";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await call("POST", { id: branch.id, status: action }); status.textContent = `${branch.id}: ${action}`; await load(); }
        catch (error) { status.textContent = error.message; button.disabled = false; }
      });
      article.append(button);
    }
    queue.append(article);
  }
  if (!data.branches.length) queue.textContent = "No submissions yet.";
  if (data.next_cursor) {
    const next = document.createElement("button"); next.type = "button"; next.textContent = "Next page";
    next.addEventListener("click", () => load(data.next_cursor).catch(error => { status.textContent = error.message; }));
    queue.append(next);
  }
}
document.getElementById("access").addEventListener("submit", async (event) => {
  event.preventDefault(); token = document.getElementById("token").value.trim(); document.getElementById("token").value = "";
  try { await load(); status.textContent = "Queue loaded. Token is kept only in this page’s memory."; }
  catch (error) { token = ""; status.textContent = error.message; }
});
document.getElementById("lock").addEventListener("click", () => { token = ""; document.getElementById("token").value = ""; queue.replaceChildren(); status.textContent = "Session cleared."; });
