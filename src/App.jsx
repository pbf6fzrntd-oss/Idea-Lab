import React, { useState, useEffect, useRef, useCallback } from "react";
import { Radar, Users, Hammer, Loader2, History, Code2, Eye, Sparkles, ChevronRight, RotateCcw, AlertTriangle } from "lucide-react";
import { callAgent, parseJSON } from "./lib/callAgent.js";
import { validateBrief, validateRanking, validatePrototype, isolatedDocument } from "./lib/validation.js";
import { storage } from "./lib/storage.js";

const AGENTS = {
  scout: { name: "Scout", role: "Trend Scout", color: "#4FA6A0" },
  strategist: { name: "Strategist", role: "Product Strategist", color: "#8B7FD9" },
  skeptic: { name: "Skeptic", role: "Feasibility Critic", color: "#E2694B" },
  architect: { name: "Architect", role: "Builder", color: "#E4A33B" },
};

const INK = "#12151C";
const PANEL = "#191E26";
const PANEL2 = "#20262F";
const BORDER = "#2B323D";
const TEXT = "#ECE7DA";
const MUTED = "#8D93A0";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const [topic, setTopic] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | brainstorming | ranking | ranked | building | built | error
  const [agentStatus, setAgentStatus] = useState({ scout: "idle", strategist: "idle", skeptic: "idle", architect: "idle" });
  const [log, setLog] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [prototype, setPrototype] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState([]);
  const sessionRef = useRef(null);
  const setSessionId = id => { sessionRef.current = id; };
  const [viewingHistory, setViewingHistory] = useState(false);
  const feedEndRef = useRef(null);
  const activeRef = useRef(false);

  useEffect(() => {
    (async () => {
      const r = await storage.get("sessions-index");
      if (r?.value) setHistoryIndex(JSON.parse(r.value));
    })().catch(() => setErrorMsg("Session history is unavailable in this browser."));
  }, []);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log, ideas.length]);

  function pushLog(agentKey, text) {
    setLog((l) => [...l, { id: uid(), agent: agentKey, text }]);
  }

  function setStatus(key, val) {
    setAgentStatus((s) => ({ ...s, [key]: val }));
  }

  async function saveSession(finalIdeas, finalPrototype, finalSelected) {
    try {
      const id = sessionRef.current || uid();
      const record = {
        id,
        topic: topic.trim() || "(open-ended)",
        ts: Date.now(),
        ideas: finalIdeas,
        selected: finalSelected,
        prototype: finalPrototype,
      };
      const entry = {
        id,
        topic: record.topic,
        ts: record.ts,
        topTitle: finalIdeas?.[0]?.title || "",
        topScore: finalIdeas?.[0]?.score ?? null,
        built: !!finalPrototype,
      };
      const list = await storage.save(record, entry);
      setHistoryIndex(list);
      setSessionId(id);
    } catch (e) {
      setErrorMsg("Your result is available, but saving failed. Export it before leaving: " + e.message);
    }
  }

  const runBrainstorm = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setViewingHistory(false);
    setPhase("brainstorming");
    setErrorMsg("");
    setLog([]);
    setIdeas([]);
    setSelected(null);
    setPrototype(null);
    setSessionId(uid());
    setAgentStatus({ scout: "active", strategist: "active", skeptic: "idle", architect: "idle" });

    const topicLine = topic.trim()
      ? `Focus area / seed topic given by the user: "${topic.trim()}"`
      : "No topic was given — choose a plausible workflow to explore. Treat market demand as an unverified hypothesis.";

    const system = `You are running a two-person product innovation desk inside a software brainstorming lab. Respond ONLY with strict JSON, no markdown fences, no commentary outside the JSON. Schema:
{"scout_note": string (2-3 sentences, first person as the Trend Scout, on why this space is hot right now and the sharpest angle on it), "strategist_note": string (2-3 sentences, first person as the Product Strategist, framing the concrete gap in existing tools), "ideas": [ {"title": string (short product name), "pitch": string (1-2 sentences, what it does and for whom), "sector": string (short label, e.g. "Healthcare Ops")} — exactly 5 items, spanning different angles on the topic ]}`;
    const userPrompt = `${topicLine}\nGenerate 5 distinct software/application ideas addressing real, specific pain points in this space. Avoid generic ideas ("an app that connects X and Y"); be concrete about the workflow or problem solved.`;

    let brainstormData;
    try {
      const raw = await callAgent(system, userPrompt);
      brainstormData = validateBrief(parseJSON(raw));
      setIdeas(brainstormData.ideas);
      if (!Array.isArray(brainstormData.ideas) || brainstormData.ideas.length === 0) throw new Error("Malformed idea list.");
    } catch (e) {
      setPhase("error");
      setErrorMsg("The Scout and Strategist couldn't agree on a clean brief (" + e.message + "). Try again, maybe with a narrower topic.");
      setAgentStatus({ scout: "idle", strategist: "idle", skeptic: "idle", architect: "idle" });
      activeRef.current = false;
      return;
    }

    setStatus("scout", "done");
    setStatus("strategist", "done");
    pushLog("scout", brainstormData.scout_note);
    pushLog("strategist", brainstormData.strategist_note);

    setPhase("ranking");
    setStatus("skeptic", "active");
    const rankSystem = `You are the Skeptic on a product innovation desk — a sharp, fair feasibility critic. Respond ONLY with strict JSON, no markdown fences. Schema:
{"skeptic_note": string (2-3 sentences, first person, your overall read on this batch of ideas), "ranked": [ {"id": string (must exactly match one given id), "score": integer 1-10 (build-worthiness: feasibility + real demand), "verdict": string (one sharp sentence on its biggest strength or risk)} — one entry per idea given, sorted highest score first ]}`;
    const rankPrompt = `Topic: ${topic.trim() || "(open-ended trend)"}\nIdeas to score:\n${JSON.stringify(brainstormData.ideas)}`;

    let rankData;
    try {
      const raw = await callAgent(rankSystem, rankPrompt);
      rankData = parseJSON(raw);
      validateRanking(rankData, brainstormData.ideas);
    } catch (e) {
      setPhase("error");
      setErrorMsg("The Skeptic choked on scoring (" + e.message + "). The ideas above are still valid — try again to get them ranked.");
      setStatus("skeptic", "idle");
      activeRef.current = false;
      return;
    }

    setStatus("skeptic", "done");
    pushLog("skeptic", rankData.skeptic_note);

    const merged = validateRanking(rankData, brainstormData.ideas);

    setIdeas(merged);
    setPhase("ranked");
    await saveSession(merged, null, null);
    activeRef.current = false;
  }, [topic]);

  const runBuild = useCallback(
    async (idea) => {
      if (activeRef.current) return;
      activeRef.current = true;
      setPhase("building");
      setSelected(idea);
      setShowCode(false);
      setStatus("architect", "active");

      const system = `You are the Architect on a product innovation desk — you turn a chosen idea into a small, genuinely working prototype. Respond ONLY with strict JSON, no markdown fences. Schema:
{"architect_note": string (1-2 sentences, first person, what you built and the core interaction), "stack": string (short, e.g. "Vanilla HTML/CSS/JS"), "html": string (a COMPLETE self-contained HTML document: <!doctype html> through </html>, all CSS in a <style> tag and all JS in a <script> tag, no external dependencies or network calls, dark-mode-friendly styling, must be genuinely interactive and functional, not a static mockup)}`;
      const userPrompt = `Idea: ${idea.title}\nPitch: ${idea.pitch}\nSector: ${idea.sector}\nBuild a compact, working single-page prototype demonstrating the core interaction a user would have with this.`;

      try {
        const raw = await callAgent(system, userPrompt, 8000);
        const data = validatePrototype(parseJSON(raw));
        if (!data.html) throw new Error("No prototype code came back.");
        setPrototype(data);
        setStatus("architect", "done");
        setPhase("built");
        await saveSession(ideas, data, idea);
      } catch (e) {
        setPhase("error");
        setErrorMsg("The Architect's build failed (" + e.message + "). You can try building this idea again.");
        setStatus("architect", "idle");
      } finally { activeRef.current = false; }
    },
    [ideas]
  );

  async function openHistorySession(id) {
    if (activeRef.current) return;
    try {
    const r = await storage.get("session:" + id);
    if (!r?.value) return;
    const record = JSON.parse(r.value);
    setTopic(record.topic === "(open-ended)" ? "" : record.topic);
    setIdeas(record.ideas || []);
    setSelected(record.selected || null);
    setPrototype(record.prototype || null);
    setSessionId(record.id);
    setLog([]);
    setAgentStatus({
      scout: record.ideas?.length ? "done" : "idle",
      strategist: record.ideas?.length ? "done" : "idle",
      skeptic: record.ideas?.length ? "done" : "idle",
      architect: record.prototype ? "done" : "idle",
    });
    setPhase(record.prototype ? "built" : record.ideas?.length ? "ranked" : "idle");
    setViewingHistory(true);
    setHistoryOpen(false);
    setShowCode(false);
    } catch (e) { setErrorMsg("Unable to open this session: " + e.message); }
  }

  function startFresh() {
    if (activeRef.current) return;
    setTopic("");
    setPhase("idle");
    setLog([]);
    setIdeas([]);
    setSelected(null);
    setPrototype(null);
    setSessionId(null);
    setViewingHistory(false);
    setAgentStatus({ scout: "idle", strategist: "idle", skeptic: "idle", architect: "idle" });
  }

  const busy = phase === "brainstorming" || phase === "ranking" || phase === "building";

  return (
    <div style={styles.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .il-btn { transition: transform .12s ease, background .15s ease, border-color .15s ease; cursor: pointer; }
        .il-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .il-btn:disabled { opacity: .5; cursor: default; }
        .il-card { transition: border-color .15s ease, transform .15s ease; }
        .il-card:hover { border-color: #3A4250; transform: translateY(-1px); }
        .il-dot { display:inline-block; width:8px; height:8px; border-radius:50%; }
        .il-pulse { animation: il-pulse 1.2s ease-in-out infinite; }
        @keyframes il-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .il-scroll::-webkit-scrollbar { width: 8px; }
        .il-scroll::-webkit-scrollbar-thumb { background: #2B323D; border-radius: 4px; }
        .il-hist-item:hover { background: #20262F; }
        textarea, input { outline: none; }
        input::placeholder { color: #6B7180; }
      `}</style>

      <div style={styles.header}>
        {!!ideas.length && <button disabled={busy} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({topic, ideas, selected, prototype}, null, 2)], {type: "application/json"})); const a = document.createElement("a"); a.href=url; a.download="idea-lab-session.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Export session</button>}
        <div style={styles.brand}>
          <Sparkles size={18} color="#E4A33B" />
          <span style={styles.brandText}>Idea Lab</span>
        </div>
        <button className="il-btn" style={styles.ghostBtn} onClick={() => setHistoryOpen((v) => !v)}>
          <History size={15} />
          <span>Past sessions{historyIndex.length ? ` (${historyIndex.length})` : ""}</span>
        </button>
      </div>

      {historyOpen && (
        <div style={styles.historyPanel} className="il-scroll">
          {historyIndex.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13, padding: "10px 4px" }}>No past sessions yet — run a brainstorm and it'll land here.</div>
          ) : (
            historyIndex.map((h) => (
              <div key={h.id} className="il-hist-item" style={styles.histItem} onClick={() => openHistorySession(h.id)}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: TEXT, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.topic}</div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                    {h.topTitle ? `${h.topTitle} · score ${h.topScore}` : "no ideas yet"} {h.built ? "· prototype built" : ""}
                  </div>
                </div>
                <ChevronRight size={14} color={MUTED} />
              </div>
            ))
          )}
        </div>
      )}

      <div style={styles.controlRow}>
        <input
          style={styles.input}
          placeholder="Seed topic (optional) — leave blank to let the Scout pick a hot trend…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && runBrainstorm()}
          disabled={busy}
        />
        <button className="il-btn" style={styles.primaryBtn} onClick={runBrainstorm} disabled={busy}>
          {busy && phase !== "ranked" ? <Loader2 size={15} className="il-pulse" /> : <Radar size={15} />}
          <span>{ideas.length ? "New brainstorm" : "Start brainstorm"}</span>
        </button>
        {(ideas.length > 0 || log.length > 0) && !busy && (
          <button className="il-btn" style={styles.ghostBtn} onClick={startFresh}>
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      <div style={styles.roster}>
        {Object.entries(AGENTS).map(([key, a]) => (
          <div key={key} style={styles.rosterItem}>
            <span
              className={agentStatus[key] === "active" ? "il-dot il-pulse" : "il-dot"}
              style={{ background: agentStatus[key] === "idle" ? "#3A4250" : a.color }}
            />
            <span style={{ color: agentStatus[key] === "idle" ? MUTED : TEXT, fontSize: 12.5 }}>{a.name}</span>
            <span style={{ color: "#5A6070", fontSize: 11 }}>{a.role}</span>
          </div>
        ))}
      </div>

      {phase === "error" && (
        <div style={styles.errorBox}>
          <AlertTriangle size={15} color="#E2694B" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: "#F0C4B8" }}>{errorMsg}</span>
        </div>
      )}

      {log.length > 0 && (
        <div style={styles.feed}>
          {log.map((entry) => {
            const a = AGENTS[entry.agent];
            return (
              <div key={entry.id} style={{ ...styles.logCard, borderLeftColor: a.color }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: a.color, marginBottom: 3, fontFamily: "'JetBrains Mono', monospace" }}>{a.name.toUpperCase()}</div>
                <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.5 }}>{entry.text}</div>
              </div>
            );
          })}
          <div ref={feedEndRef} />
        </div>
      )}

      {phase === "ranking" && (
        <div style={{ ...styles.logCard, borderLeftColor: AGENTS.skeptic.color, display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={13} className="il-pulse" color={AGENTS.skeptic.color} />
          <span style={{ fontSize: 13, color: MUTED }}>Skeptic is scoring the batch…</span>
        </div>
      )}

      {ideas.length > 0 && (
        <div style={styles.board}>
          <div style={styles.boardHeader}>
            <Users size={14} color={MUTED} />
            <span style={{ fontSize: 12.5, color: MUTED }}>Ranked by build-worthiness · {viewingHistory ? "loaded from history" : "highest score first"}</span>
          </div>
          <div style={styles.grid}>
            {ideas.map((idea, i) => (
              <div key={idea.id} className="il-card" style={{ ...styles.ideaCard, borderColor: i === 0 ? "#3D3626" : BORDER }}>
                <div style={styles.ideaTop}>
                  <span style={styles.sectorTag}>{idea.sector}</span>
                  <span style={{ fontSize: 12, color: MUTED, fontFamily: "'JetBrains Mono', monospace" }}>#{i + 1}</span>
                </div>
                <div style={styles.ideaTitle}>{idea.title}</div>
                <div style={styles.ideaPitch}>{idea.pitch}</div>
                <div style={styles.scoreRow}>
                  <div style={styles.scoreTrack}>
                    <div style={{ ...styles.scoreFill, width: `${idea.score * 10}%`, background: idea.score >= 7 ? "#4FA6A0" : idea.score >= 4 ? "#E4A33B" : "#E2694B" }} />
                  </div>
                  <span style={{ fontSize: 12.5, color: TEXT, fontFamily: "'JetBrains Mono', monospace" }}>{idea.score}/10</span>
                </div>
                <div style={styles.verdict}>{idea.verdict}</div>
                <button
                  className="il-btn"
                  style={{ ...styles.buildBtn, opacity: phase === "building" ? 0.6 : 1 }}
                  disabled={phase === "building"}
                  onClick={() => runBuild(idea)}
                >
                  {phase === "building" && selected?.id === idea.id ? (
                    <>
                      <Loader2 size={13} className="il-pulse" /> Building…
                    </>
                  ) : (
                    <>
                      <Hammer size={13} /> Build this
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {prototype && (
        <div style={styles.buildPanel}>
          <div style={styles.buildHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Hammer size={14} color={AGENTS.architect.color} />
              <span style={{ fontSize: 13.5, color: TEXT, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected?.title}</span>
              <span style={styles.stackTag}>{prototype.stack}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="il-btn" style={{ ...styles.toggleBtn, ...(!showCode ? styles.toggleActive : {}) }} onClick={() => setShowCode(false)}>
                <Eye size={12} /> Preview
              </button>
              <button className="il-btn" style={{ ...styles.toggleBtn, ...(showCode ? styles.toggleActive : {}) }} onClick={() => setShowCode(true)}>
                <Code2 size={12} /> Code
              </button>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, padding: "8px 14px 0", lineHeight: 1.5 }}>{prototype.architect_note}</div>
          <div style={styles.previewBezel}>
            {showCode ? (
              <pre style={styles.codeBlock}>{prototype.html}</pre>
            ) : (
              <iframe title="prototype" srcDoc={isolatedDocument(prototype.html)} style={styles.iframe} sandbox="allow-scripts" referrerPolicy="no-referrer" />
            )}
          </div>
        </div>
      )}

      {phase === "idle" && log.length === 0 && (
        <div style={styles.emptyState}>
          <Radar size={22} color="#3A4250" />
          <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
            Give the desk a topic, or leave it blank and the Scout will pick a current cross-industry trend. Four agents — Scout, Strategist, Skeptic, Architect — will brainstorm, rank, and build a working prototype of the winner.
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    background: INK,
    color: TEXT,
    fontFamily: "'Inter', -apple-system, sans-serif",
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    padding: 18,
    maxWidth: 880,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandText: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, fontWeight: 600, letterSpacing: 0.2 },
  ghostBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${BORDER}`,
    color: MUTED, fontSize: 12.5, padding: "6px 10px", borderRadius: 8,
  },
  historyPanel: {
    display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto",
    background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 6,
  },
  histItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px", borderRadius: 7, cursor: "pointer", gap: 8 },
  controlRow: { display: "flex", gap: 8 },
  input: {
    flex: 1, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 13px",
    color: TEXT, fontSize: 13.5, fontFamily: "'Inter', sans-serif",
  },
  primaryBtn: {
    display: "flex", alignItems: "center", gap: 7, background: "#E4A33B", color: "#1A1406",
    border: "none", borderRadius: 9, padding: "0 16px", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap",
  },
  roster: { display: "flex", flexWrap: "wrap", gap: 16, padding: "2px 2px 0" },
  rosterItem: { display: "flex", alignItems: "center", gap: 6 },
  errorBox: {
    display: "flex", gap: 8, background: "#2A1D1A", border: "1px solid #4A2E28", borderRadius: 10, padding: "10px 12px",
  },
  feed: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 4 },
  logCard: { background: PANEL, borderLeft: "3px solid", borderRadius: 8, padding: "9px 12px" },
  board: { display: "flex", flexDirection: "column", gap: 10 },
  boardHeader: { display: "flex", alignItems: "center", gap: 6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 },
  ideaCard: { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13, display: "flex", flexDirection: "column", gap: 7 },
  ideaTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  sectorTag: {
    fontSize: 10.5, color: "#B9BFCB", background: "#252C36", padding: "2px 7px", borderRadius: 5,
    fontFamily: "'JetBrains Mono', monospace",
  },
  ideaTitle: { fontFamily: "'Fraunces', Georgia, serif", fontSize: 16, fontWeight: 600, lineHeight: 1.25 },
  ideaPitch: { fontSize: 12.5, color: "#C6C1B4", lineHeight: 1.5 },
  scoreRow: { display: "flex", alignItems: "center", gap: 8 },
  scoreTrack: { flex: 1, height: 5, background: "#252C36", borderRadius: 3, overflow: "hidden" },
  scoreFill: { height: "100%", borderRadius: 3 },
  verdict: { fontSize: 12, color: MUTED, fontStyle: "italic", lineHeight: 1.45 },
  buildBtn: {
    marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    background: "transparent", border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 7, padding: "7px 0", fontSize: 12.5,
  },
  buildPanel: { background: PANEL2, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" },
  buildHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 0", gap: 8 },
  stackTag: { fontSize: 10.5, color: "#B9BFCB", background: "#252C36", padding: "2px 7px", borderRadius: 5, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" },
  toggleBtn: { display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, fontSize: 11.5, padding: "5px 9px", borderRadius: 6 },
  toggleActive: { color: TEXT, borderColor: "#4A515F", background: "#252C36" },
  previewBezel: { margin: 14, marginTop: 10, borderRadius: 9, overflow: "hidden", border: `1px solid ${BORDER}`, background: "#0D0F13" },
  iframe: { width: "100%", height: 420, border: "none", background: "#fff" },
  codeBlock: {
    margin: 0, padding: 14, fontSize: 11.5, lineHeight: 1.6, color: "#C6E6D6",
    fontFamily: "'JetBrains Mono', monospace", maxHeight: 420, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 10px" },
};
