// src/tutor.ts
function readSse(sse) {
  const lines = sse.split("\n");
  const rest = lines.pop() ?? "";
  let text = "";
  for (const line of lines) {
    const data = line.startsWith("data: ") ? line.slice(6).trim() : "";
    if (!data || data === "[DONE]") continue;
    try {
      text += JSON.parse(data).response ?? "";
    } catch {
    }
  }
  return { text, rest };
}

// ui/app.ts
var $ = (id) => document.getElementById(id);
var upload = $("upload");
var chat = $("chat");
var log = $("log");
var deckId = () => location.hash.slice(1);
upload.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(upload);
  const file = form.get("file");
  const pasted = String(form.get("text")).trim();
  const [fileName, text] = file.size ? [file.name, await file.text()] : [/^[[{]/.test(pasted) ? "pasted.json" : "pasted.txt", pasted];
  const res = await fetch("/api/decks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: form.get("title"), fileName, text })
  });
  const body = await res.json();
  if (!res.ok) return showError(body.message);
  location.hash = body.id;
});
function showError(message) {
  const el = $("upload-error");
  el.textContent = message;
  el.hidden = false;
}
async function load() {
  if (!deckId()) return;
  const res = await fetch(`/api/decks/${deckId()}`);
  if (!res.ok) return showError("That study session no longer exists.");
  const deck = await res.json();
  upload.hidden = true;
  $("study").hidden = false;
  $("deck-title").textContent = deck.title;
  renderCards(deck);
  if (!log.childElementCount) deck.messages.forEach((m) => bubble(m.role, m.content));
  if (["queued", "running", "waiting"].includes(deck.status)) setTimeout(load, 2e3);
}
function renderCards({ cards, status }) {
  const done = cards.filter((c) => c.choices?.length).length;
  $("progress").textContent = `${done} of ${cards.length} cards have options (workflow: ${status})`;
  $("cards").replaceChildren(
    ...cards.map((c, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${c.prompt}`;
      const options = document.createElement("div");
      options.className = "options";
      for (const [text, correct] of [[c.answer, true], ...(c.choices ?? []).map((x) => [x, false])]) {
        const chip = document.createElement("span");
        chip.textContent = String(text);
        if (correct) chip.className = "correct";
        options.append(chip);
      }
      li.append(options);
      return li;
    })
  );
}
function bubble(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  log.append(el);
  log.scrollTop = log.scrollHeight;
  return el;
}
chat.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = chat.elements.namedItem("message");
  const button = chat.querySelector("button");
  const message = input.value.trim();
  input.value = "";
  button.disabled = true;
  bubble("user", message);
  const reply = bubble("assistant", "\u2026");
  const res = await fetch(`/api/decks/${deckId()}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!res.ok || !res.body) {
    reply.textContent = (await res.json().catch(() => null))?.message ?? "The tutor is unavailable.";
    button.disabled = false;
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  reply.textContent = "";
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    const { text, rest } = readSse(buffer + r.value);
    buffer = rest;
    reply.textContent += text;
    log.scrollTop = log.scrollHeight;
  }
  button.disabled = false;
});
addEventListener("hashchange", load);
load();
