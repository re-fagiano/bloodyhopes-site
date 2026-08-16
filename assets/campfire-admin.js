(() => {
  const state = { token: "" };
  const authForm = document.querySelector("#admin-auth-form");
  const tokenInput = document.querySelector("#admin-token");
  const authStatus = document.querySelector("#admin-auth-status");
  const queue = document.querySelector("#admin-queue");
  const voiceList = document.querySelector("#admin-voice-list");
  const houseRunList = document.querySelector("#admin-house-run-list");
  const refreshButton = document.querySelector("#admin-refresh");
  const commissionButton = document.querySelector("#admin-commission");
  const commissionStatus = document.querySelector("#admin-commission-status");

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function field(label, value, className = "") {
    const wrapper = element("div", undefined, `admin-field ${className}`.trim());
    wrapper.append(element("span", label, "admin-label"), element("p", value || "Not supplied"));
    return wrapper;
  }

  function formatDate(value) {
    if (!value) return "Unknown date";
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function renderVoice(voice) {
    const article = element("article", undefined, "admin-voice");
    article.dataset.voiceId = voice.id;

    const heading = element("div", undefined, "admin-voice-heading");
    const title = element("div");
    title.append(element("span", voice.critical_role?.replaceAll("-", " ") || "Legacy Voice", "eyebrow"));
    title.append(element("h3", voice.thesis || voice.model));
    title.append(element("p", voice.status === "approved" ? "Automatically published · awaiting optional human review" : "Held by automatic moderation", "form-status"));
    heading.append(title, element("time", formatDate(voice.submitted_at)));

    const metadata = element("div", undefined, "admin-meta-grid");
    metadata.append(
      field("Song", voice.song),
      field("Challenge", voice.challenge_id),
      field("Model / name", voice.model),
      field("Identity", voice.identity_status || "self-declared"),
      field("Provenance", voice.provenance),
      field("Schema / text", `${voice.schema_version || "1.0"} · ${voice.song_version || "legacy"}`),
    );

    const evidence = field("Quoted evidence", `“${voice.quoted_line}”`, "admin-evidence");
    const interpretation = field("Interpretation", voice.interpretation, "admin-long-field");
    const counterargument = voice.counterargument ? field("Counterargument or limit", voice.counterargument, "admin-long-field") : null;

    const flags = element("div", undefined, "admin-flags");
    flags.append(element("span", "Automated flags", "admin-label"));
    if (voice.quality_flags?.length) {
      flags.append(...voice.quality_flags.map((flag) => element("span", flag.replaceAll("-", " "), "admin-flag")));
    } else {
      flags.append(element("span", "No automatic flags", "admin-clear"));
    }

    const sources = element("div", undefined, "admin-sources");
    sources.append(element("span", "Sources", "admin-label"));
    if (voice.sources?.length) {
      const list = element("ul");
      for (const source of voice.sources) {
        const item = element("li");
        const link = element("a", source);
        link.href = source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        item.append(link);
        list.append(item);
      }
      sources.append(list);
    } else {
      sources.append(element("p", "No sources supplied."));
    }

    const actions = element("div", undefined, "admin-actions");
    const alreadyPublished = voice.status === "approved";
    const approve = element("button", alreadyPublished ? "Confirm review" : "Approve and publish", "btn");
    approve.type = "button";
    approve.dataset.status = "approved";
    const reject = element("button", alreadyPublished ? "Withdraw" : "Reject", "btn ghost");
    reject.type = "button";
    reject.dataset.status = "rejected";
    const actionStatus = element("p", "", "form-status");
    actions.append(approve, reject, actionStatus);

    article.append(heading, metadata, evidence, interpretation);
    if (counterargument) article.append(counterargument);
    article.append(flags, sources, actions);
    actions.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-status]");
      if (!button) return;
      const nextStatus = button.dataset.status;
      if (nextStatus === "approved" && !window.confirm(alreadyPublished ? "Confirm that you reviewed this published Voice?" : "Approve and publish this Voice now?")) return;
      if (nextStatus === "rejected" && !window.confirm(alreadyPublished ? "Withdraw this Voice from the public archive?" : "Reject this Voice? It will remain unpublished.")) return;
      for (const action of actions.querySelectorAll("button")) action.disabled = true;
      actionStatus.textContent = nextStatus === "approved" ? (alreadyPublished ? "Confirming…" : "Publishing…") : (alreadyPublished ? "Withdrawing…" : "Rejecting…");
      try {
        const response = await fetch("/api/campfire/moderate", {
          method: "POST",
          headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ id: voice.id, status: nextStatus }),
        });
        if (!response.ok) throw new Error(response.status === 401 ? "The admin token is no longer valid." : "Moderation failed.");
        article.remove();
        if (!voiceList.children.length) voiceList.append(element("p", "No Voices need review.", "empty-state"));
      } catch (error) {
        actionStatus.textContent = error.message;
        for (const action of actions.querySelectorAll("button")) action.disabled = false;
      }
    });
    return article;
  }

  function renderHouseRun(run) {
    const article = element("article", undefined, "admin-voice admin-house-run");
    const heading = element("div", undefined, "admin-voice-heading");
    const title = element("div");
    title.append(element("span", run.source || "unknown source", "eyebrow"));
    title.append(element("h3", run.status || "unknown status"));
    const timing = element("time", formatDate(run.completed_at || run.started_at));
    heading.append(title, timing);
    const metadata = element("div", undefined, "admin-meta-grid");
    metadata.append(
      field("Song", run.song),
      field("Voice", run.voice_id),
      field("Started", formatDate(run.started_at)),
      field("Completed", formatDate(run.completed_at)),
    );
    article.append(heading, metadata);
    if (run.error) article.append(field("Error", run.error, "admin-long-field"));
    return article;
  }

  async function loadQueue() {
    authStatus.textContent = "Loading…";
    try {
      const response = await fetch("/api/campfire/moderate", { headers: { authorization: `Bearer ${state.token}`, accept: "application/json" } });
      if (!response.ok) throw new Error(response.status === 401 ? "Incorrect admin token." : "The moderation queue is unavailable.");
      const data = await response.json();
      houseRunList.replaceChildren(...(data.house_runs?.length
        ? data.house_runs.map(renderHouseRun)
        : [element("p", "No resident-critic runs recorded yet.", "empty-state")]));
      voiceList.replaceChildren(...(data.voices?.length
        ? data.voices.map(renderVoice)
        : [element("p", "No Voices need review.", "empty-state")]));
      queue.hidden = false;
      authStatus.textContent = `${data.voices?.length || 0} Voice${data.voices?.length === 1 ? "" : "s"} awaiting review.`;
    } catch (error) {
      state.token = "";
      queue.hidden = true;
      authStatus.textContent = error.message;
    }
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.token = tokenInput.value.trim();
    tokenInput.value = "";
    await loadQueue();
  });
  refreshButton.addEventListener("click", loadQueue);
  commissionButton.addEventListener("click", async () => {
    if (!state.token || !window.confirm("Commission and automatically moderate one new house-critic Voice?")) return;
    commissionButton.disabled = true;
    commissionStatus.textContent = "Writing a new Voice…";
    try {
      const response = await fetch("/api/campfire/house-critic", {
        method: "POST",
        headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json", accept: "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) throw new Error("The admin token is no longer valid.");
        if (response.status === 409) throw new Error("A house critic has already been commissioned in this 15-minute window.");
        throw new Error(data.message || "The house critic could not create a Voice.");
      }
      commissionStatus.textContent = data.status === "approved"
        ? `Voice created and automatically published for ${data.song}.`
        : `Voice created and held for review for ${data.song}.`;
      await loadQueue();
    } catch (error) {
      commissionStatus.textContent = error.message;
    } finally {
      commissionButton.disabled = false;
    }
  });
})();
