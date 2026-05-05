// ── GuidedExplorePanel.tsx ────────────────────────────────────────────────────
// Drop-in replacement for the "Overview" tab content.
// Shows after upload: Gemini suggests questions → user picks one →
// only relevant analyses run → plain-English walkthrough of results.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { api }                  from "@/lib/nexus-api";
import { UploadResponse }        from "@/lib/nexus-api";
import { SchemaPanel }           from "@/components/nexus/SchemaPanel";
import {
  ChevronRight, Loader2, BarChart3, Search,
  TrendingUp, GitBranch, Lightbulb, Sparkles,
  CheckCircle2, ArrowRight, RefreshCw, ChevronDown,
} from "lucide-react";

// ── types ─────────────────────────────────────────────────────────────────────

interface SuggestedQuestion {
  question:              string;
  question_type:         string;
  category_label:        string;
  suggested_outcome_col: string | null;
  suggested_group_col:   string | null;
  suggested_predictor_col: string | null;
  why:                   string;
  relevant_dataset_id:   string;
  beginner_friendly:     boolean;
}

interface WalkthroughStep {
  step:  number;
  title: string;
  text:  string;
}

interface ExploreResult {
  question_type:  string;
  analyses_run:   string[];
  findings:       Record<string, any>;
  walkthrough:    WalkthroughStep[];
}

// ── icons per category ────────────────────────────────────────────────────────

const CAT_ICON: Record<string, React.ElementType> = {
  compare_groups:   BarChart3,
  find_patterns:    Search,
  predict_outcome:  TrendingUp,
  test_correlation: GitBranch,
  full_explore:     Sparkles,
};

const CAT_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  compare_groups:   { bg: "#e1f5ee", text: "#0f6e56", dot: "#1D9E75" },
  find_patterns:    { bg: "#eeedfe", text: "#534AB7", dot: "#534AB7" },
  predict_outcome:  { bg: "#e6f1fb", text: "#185fa5", dot: "#185fa5" },
  test_correlation: { bg: "#faeeda", text: "#854f0b", dot: "#EF9F27" },
  full_explore:     { bg: "#fbeaf0", text: "#993556", dot: "#c84c6e" },
};

// ── sub-components ────────────────────────────────────────────────────────────

function Avatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%",
      background: "#e1f5ee", color: "#0f6e56",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 500, flexShrink: 0,
    }}>G</div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--color-background-secondary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: "14px", borderBottomLeftRadius: 3,
      padding: "12px 14px", fontSize: 13,
      color: "var(--color-text-primary)", lineHeight: 1.6,
    }}>{children}</div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 500,
      padding: "2px 8px", borderRadius: 99,
      background: color ? `${color}22` : "var(--color-background-secondary)",
      color: color ?? "var(--color-text-secondary)",
      border: `0.5px solid ${color ? `${color}44` : "var(--color-border-tertiary)"}`,
      marginRight: 5, marginTop: 4,
    }}>{children}</span>
  );
}

// ── column picker ─────────────────────────────────────────────────────────────

function ColPicker({
  label, cols, value, onChange,
}: {
  label: string;
  cols: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "6px 10px", fontSize: 12,
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 8,
          background: "var(--color-background-primary)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono)",
          outline: "none", cursor: "pointer",
        }}
      >
        <option value="">— pick one —</option>
        {cols.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

// ── walkthrough step ──────────────────────────────────────────────────────────

function WalkthroughCard({ step, total }: { step: WalkthroughStep; total: number }) {
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        background: "#1D9E75", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 1,
      }}>{step.step}</div>
      <div style={{
        flex: 1,
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 10, padding: "12px 14px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 5 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{step.text}</div>
      </div>
    </div>
  );
}

// ── findings mini-summary ─────────────────────────────────────────────────────

function FindingsSummary({ findings, questionType }: { findings: Record<string, any>; questionType: string }) {
  const rows: { label: string; value: string }[] = [];

  if (questionType === "compare_groups" && findings.anova) {
    const a = findings.anova;
    rows.push({ label: "Test", value: "One-way ANOVA + Kruskal-Wallis" });
    rows.push({ label: "F statistic", value: String(a.f_statistic ?? "—") });
    rows.push({ label: "p-value", value: String(a.p_value ?? "—") });
    rows.push({ label: "Effect size (η²)", value: `${a.eta_squared} — ${a.effect_size}` });
    rows.push({ label: "Groups", value: String(a.n_groups) });
  }
  if (questionType === "compare_groups" && findings.ttest) {
    const t = findings.ttest;
    rows.push({ label: "Cohen's d", value: `${t.cohens_d} — ${t.effect_size}` });
    rows.push({ label: "Power", value: t.power ? `${(t.power.observed_power * 100).toFixed(0)}%` : "—" });
  }
  if (questionType === "find_patterns" && findings.pca) {
    const p = findings.pca;
    rows.push({ label: "PCA variance explained", value: `${(p.cumulative_variance?.[2] * 100 || 0).toFixed(1)}% (3 components)` });
  }
  if (questionType === "find_patterns" && findings.clustering) {
    const k = findings.clustering;
    rows.push({ label: "Clusters", value: String(k.k) });
    rows.push({ label: "Silhouette score", value: String(k.silhouette_score ?? "—") });
    rows.push({ label: "Cluster sizes", value: k.cluster_stats?.map((c: any) => c.n).join(", ") ?? "—" });
  }
  if (questionType === "predict_outcome" && findings.feature_importance) {
    const rf = findings.feature_importance;
    rows.push({ label: "R² (cross-validated)", value: `${rf.r2_cv_mean} ± ${rf.r2_cv_std}` });
    const top = Object.entries(rf.permutation_importance || {}).slice(0, 3);
    top.forEach(([k, v]) => rows.push({ label: `  ${k}`, value: String(v) }));
  }
  if (questionType === "test_correlation" && findings.pearson) {
    rows.push({ label: "Pearson r", value: `${findings.pearson.r} (p=${findings.pearson.p})` });
    rows.push({ label: "Spearman ρ", value: `${findings.spearman?.rho} (p=${findings.spearman?.p})` });
    if (findings.regression) {
      rows.push({ label: "R²", value: String(findings.regression.r2) });
      rows.push({ label: "Slope", value: String(findings.regression.slope) });
    }
  }

  if (!rows.length) return null;

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{
        fontSize: 11, color: "var(--color-text-tertiary)",
        cursor: "pointer", userSelect: "none", listStyle: "none",
        display: "flex", alignItems: "center", gap: 4,
      }}>
        <ChevronDown style={{ width: 12, height: 12 }} />
        Show raw numbers
      </summary>
      <div style={{
        marginTop: 8, background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 8, overflow: "hidden",
      }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between",
            padding: "5px 10px", fontSize: 11,
            borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none",
          }}>
            <span style={{ color: "var(--color-text-tertiary)" }}>{r.label}</span>
            <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>{r.value}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function GuidedExplorePanel({
  ds,
  studyDatasetIds,
}: {
  ds: UploadResponse;
  studyDatasetIds: string[];
}) {
  const [loadingQ,   setLoadingQ]   = useState(true);
  const [questions,  setQuestions]  = useState<SuggestedQuestion[]>([]);
  const [selected,   setSelected]   = useState<SuggestedQuestion | null>(null);

  // column overrides for selected question
  const [outCol,   setOutCol]   = useState("");
  const [grpCol,   setGrpCol]   = useState("");
  const [predCol,  setPredCol]  = useState("");

  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState<ExploreResult | null>(null);
  const [customQ,  setCustomQ]  = useState("");

  const numCols = ds.numeric_columns ?? [];
  const catCols = ds.categorical_columns ?? [];

  // fetch suggested questions once on mount
  useEffect(() => {
  const ids = studyDatasetIds.length ? studyDatasetIds : [ds.dataset_id];
  void api.suggestQuestions({ dataset_ids: ids })
    .then((r: any) => setQuestions(r.questions ?? []))
    .catch(() => setQuestions([]))
    .finally(() => setLoadingQ(false));
}, [ds.dataset_id]);

  // pre-fill column pickers when a question is selected
  useEffect(() => {
    if (!selected) return;
    setOutCol(selected.suggested_outcome_col ?? "");
    setGrpCol(selected.suggested_group_col ?? "");
    setPredCol(selected.suggested_predictor_col ?? "");
    setResult(null);
  }, [selected]);

  const runExplore = async () => {
    if (!selected) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await api.quickExplore({
      dataset_id:    selected.relevant_dataset_id ?? ds.dataset_id,
      question_type: selected.question_type,
      outcome_col:   outCol   || selected.suggested_outcome_col   || null,
      group_col:     grpCol   || selected.suggested_group_col     || null,
      predictor_col: predCol  || selected.suggested_predictor_col || null,
});
      setResult(r as ExploreResult);
    } finally {
      setRunning(false);
    }
  };

  const groupedQ = questions.reduce<Record<string, SuggestedQuestion[]>>((acc, q) => {
    const k = q.category_label ?? q.question_type;
    if (!acc[k]) acc[k] = [];
    acc[k].push(q);
    return acc;
  }, {});

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 660, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── upload confirmation ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 13px",
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 8, fontSize: 12, color: "var(--color-text-secondary)",
      }}>
        <CheckCircle2 style={{ width: 14, height: 14, color: "#1D9E75", flexShrink: 0 }} />
        <span>
          <strong style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{ds.filename}</strong>
          {" "}— {ds.rows.toLocaleString()} rows · {ds.columns} columns · {numCols.length} numeric · {catCols.length} categorical
        </span>
      </div>

      {/* ── gemini intro ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Avatar />
        <Bubble>
          {loadingQ
            ? "Reading your data…"
            : <>I've read through your data. Here are some questions that look worth exploring — <strong style={{ fontWeight: 500 }}>pick one to start</strong>, or type your own below.</>
          }
        </Bubble>
      </div>

      {/* ── question cards ── */}
      {loadingQ ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 40, color: "var(--color-text-tertiary)", fontSize: 13 }}>
          <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
          Analyzing columns and generating questions…
        </div>
      ) : (
        <div style={{ paddingLeft: 40, display: "flex", flexDirection: "column", gap: 18 }}>
          {Object.entries(groupedQ).map(([category, qs]) => {
            const qtype = qs[0]?.question_type ?? "full_explore";
            const color = CAT_COLOR[qtype] ?? CAT_COLOR.full_explore;
            const Icon  = CAT_ICON[qtype]  ?? Sparkles;
            return (
              <div key={category}>
                {/* category header */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>
                    {category}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {qs.map((q, i) => {
                    const isSelected = selected?.question === q.question;
                    return (
                      <div
                        key={i}
                        onClick={() => setSelected(isSelected ? null : q)}
                        style={{
                          background: isSelected ? "#f4fcf8" : "var(--color-background-primary)",
                          border: isSelected ? "1.5px solid #1D9E75" : "0.5px solid var(--color-border-tertiary)",
                          borderRadius: 12, padding: "13px 15px",
                          cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                          display: "flex", alignItems: "flex-start", gap: 10,
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: "50%",
                          border: isSelected ? "none" : "1.5px solid var(--color-border-secondary)",
                          background: isSelected ? "#1D9E75" : "transparent",
                          flexShrink: 0, marginTop: 2,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {isSelected && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "var(--color-text-primary)", marginBottom: 4 }}>
                            {q.question}
                            {q.beginner_friendly && (
                              <span style={{
                                marginLeft: 7, fontSize: 10, fontWeight: 500,
                                padding: "1px 7px", borderRadius: 99,
                                background: "#e1f5ee", color: "#0f6e56",
                                border: "0.5px solid #b6e8d4",
                              }}>good starting point</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>{q.why}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* custom question */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 7 }}>
              Something else on your mind?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={customQ}
                onChange={e => setCustomQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && customQ.trim()) {
                    setSelected({
                      question: customQ.trim(),
                      question_type: "full_explore",
                      category_label: "Custom",
                      suggested_outcome_col: null,
                      suggested_group_col: null,
                      suggested_predictor_col: null,
                      why: "Your own question",
                      relevant_dataset_id: ds.dataset_id,
                      beginner_friendly: false,
                    });
                    setCustomQ("");
                  }
                }}
                placeholder="Type your own question and press Enter…"
                style={{
                  flex: 1, padding: "8px 12px", fontSize: 13,
                  borderRadius: 8,
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "var(--color-background-primary)",
                  color: "var(--color-text-primary)", outline: "none",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── column picker + run button (appears when a question is selected) ── */}
      {selected && !result && (
        <div style={{
          paddingLeft: 40,
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 12, padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
            "{selected.question}"
          </div>

          {/* column pickers — show relevant ones per question type */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["compare_groups", "predict_outcome", "full_explore"].includes(selected.question_type) && (
              <ColPicker label="Outcome / value" cols={numCols} value={outCol} onChange={setOutCol} />
            )}
            {["compare_groups", "full_explore"].includes(selected.question_type) && (
              <ColPicker label="Group by" cols={catCols} value={grpCol} onChange={setGrpCol} />
            )}
            {["test_correlation"].includes(selected.question_type) && (
              <>
                <ColPicker label="Variable A" cols={numCols} value={predCol} onChange={setPredCol} />
                <ColPicker label="Variable B" cols={numCols} value={outCol}  onChange={setOutCol}  />
              </>
            )}
            {["predict_outcome"].includes(selected.question_type) && (
              <ColPicker label="Outcome to predict" cols={numCols} value={outCol} onChange={setOutCol} />
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={runExplore}
              disabled={running}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 8, cursor: running ? "not-allowed" : "pointer",
                background: "#1D9E75", color: "#fff",
                border: "none", fontSize: 13, fontWeight: 500,
                opacity: running ? 0.7 : 1,
              }}
            >
              {running
                ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />Analyzing…</>
                : <><ArrowRight style={{ width: 14, height: 14 }} />Run this analysis</>
              }
            </button>
            <button
              onClick={() => { setSelected(null); setResult(null); }}
              style={{
                padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                background: "transparent", color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-secondary)", fontSize: 13,
              }}
            >
              ← Change question
            </button>
          </div>
        </div>
      )}

      {/* ── results walkthrough ── */}
      {result && (
        <div style={{ paddingLeft: 40, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* what was run */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 12px",
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 8,
          }}>
            <CheckCircle2 style={{ width: 13, height: 13, color: "#1D9E75", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              Ran: {result.analyses_run.join(" · ")}
            </span>
          </div>

          {/* gemini walkthrough */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Avatar />
            <Bubble>Here's what I found, step by step:</Bubble>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {result.walkthrough.map((step, i) => (
              <WalkthroughCard key={i} step={step} total={result.walkthrough.length} />
            ))}
          </div>

          {/* raw numbers accordion */}
          <FindingsSummary findings={result.findings} questionType={result.question_type} />

          {/* ask a follow-up / try another */}
          <div style={{
            display: "flex", gap: 8, alignItems: "center",
            paddingTop: 4,
          }}>
            <button
              onClick={() => { setSelected(null); setResult(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "7px 14px", borderRadius: 8, cursor: "pointer",
                background: "transparent", border: "0.5px solid var(--color-border-secondary)",
                color: "var(--color-text-secondary)", fontSize: 12,
              }}
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              Try a different question
            </button>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              or go to <strong style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>Full Analysis</strong> for every test
            </span>
          </div>
        </div>
      )}

      {/* ── schema accordion at the bottom ── */}
      <details style={{ paddingLeft: 0 }}>
        <summary style={{
          fontSize: 12, color: "var(--color-text-tertiary)",
          cursor: "pointer", listStyle: "none",
          display: "flex", alignItems: "center", gap: 4, userSelect: "none",
        }}>
          <ChevronDown style={{ width: 13, height: 13 }} />
          View full column schema
        </summary>
        <div style={{ marginTop: 10 }}>
          <SchemaPanel ds={ds} />
        </div>
      </details>

    </div>
  );
}