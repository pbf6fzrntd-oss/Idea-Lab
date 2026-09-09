// Talks to our local Express proxy (server/index.js), which holds the real
// Anthropic API key server-side. The browser never sees the key.
export async function callAgent(system, prompt, maxTokens = 1000) {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, prompt, max_tokens: maxTokens }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("No response came back from that station.");
  return text;
}

export function parseJSON(text) {
  let cleaned = text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}
