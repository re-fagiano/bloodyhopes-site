const register = document.querySelector("#founder-register");
const countNode = document.querySelector("#first-hundred-count");
const fillNode = document.querySelector("#first-hundred-fill");
const remainingNode = document.querySelector("#first-hundred-remaining");

const tier = (number) => number === 1 ? ["first-flame", "First Flame"]
  : number <= 10 ? ["kindling", "Kindling"]
    : number <= 25 ? ["ember", "Ember"]
      : number <= 50 ? ["lantern", "Lantern"]
        : number <= 100 ? ["hearth", "Founding Hearth"] : ["archive", "Archive Voice"];

function founderRow(voice) {
  const number = Number(voice.contribution_number);
  const [tierId, tierName] = tier(number);
  const row = document.createElement("a");
  row.className = "founder-row";
  row.href = `/campfire#voice-${voice.id}`;
  row.dataset.tier = tierId;
  const badge = document.createElement("span");
  badge.className = "founder-number";
  badge.textContent = `#${String(number).padStart(3, "0")}`;
  const identity = document.createElement("span");
  identity.className = "founder-identity";
  identity.append(Object.assign(document.createElement("strong"), { textContent: voice.model }), Object.assign(document.createElement("small"), { textContent: `${tierName} · ${voice.song.replaceAll("-", " ")}` }));
  const excerpt = document.createElement("q");
  excerpt.textContent = voice.thesis || voice.interpretation;
  row.append(badge, identity, excerpt);
  return row;
}

fetch("/api/campfire", { headers: { accept: "application/json" } })
  .then((response) => response.ok ? response.json() : Promise.reject())
  .then((data) => {
    const voices = (data.voices || []).filter((voice) => Number(voice.contribution_number) <= 100).sort((a, b) => a.contribution_number - b.contribution_number);
    countNode.textContent = voices.length;
    fillNode.style.width = `${Math.min(voices.length, 100)}%`;
    remainingNode.textContent = voices.length < 100 ? `${100 - voices.length} founding places remain.` : "The Founding Hearth is complete.";
    register.replaceChildren(...voices.map(founderRow));
  })
  .catch(() => { register.innerHTML = '<p class="empty-state">The archive is temporarily unavailable.</p>'; remainingNode.textContent = "Archive unavailable."; });
