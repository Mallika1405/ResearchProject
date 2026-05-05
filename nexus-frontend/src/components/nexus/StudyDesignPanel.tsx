import { useState } from "react";
import { api, UploadResponse, StudyDesign } from "@/lib/nexus-api";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FlaskConical, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface Props { ds: UploadResponse; }

const STRENGTH_CONFIG = {
  strong:   { color: "text-green-400",  icon: CheckCircle2,   label: "Strong evidence" },
  moderate: { color: "text-yellow-400", icon: AlertTriangle,   label: "Moderate evidence" },
  weak:     { color: "text-red-400",    icon: XCircle,        label: "Weak evidence" },
};

export function StudyDesignPanel({ ds }: Props) {
  const [question, setQuestion]   = useState("");
  const [outcome,  setOutcome]    = useState("");
  const [exposure, setExposure]   = useState("");
  const [loading,  setLoading]    = useState(false);
  const [result,   setResult]     = useState<any>(null);
  const [error,    setError]      = useState("");
  const [selected, setSelected]   = useState(0);

  const run = async () => {
    if (!question.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await api.studyDesign({
        dataset_id: ds.dataset_id,
        research_question: question,
        outcome_variable: outcome || undefined,
        exposure_variable: exposure || undefined,
      });
      setResult(r);
      setSelected(0);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const designs: StudyDesign[] = result?.study_designs ?? [];
  const active = designs[selected];

  return (
    <Section title="study.design" icon="📐">
      <div className="space-y-4">
        {/* inputs */}
        <div className="terminal-panel p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase">Research question *</Label>
            <Input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. Does drug X reduce depression scores over time?"
              className="bg-background/50 font-mono text-sm"
              onKeyDown={e => e.key === "Enter" && run()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">Outcome variable</Label>
              <Select value={outcome || "__none__"} onValueChange={v => setOutcome(v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-background/50 font-mono text-xs">
                  <SelectValue placeholder="select column…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {[...ds.numeric_columns, ...ds.categorical_columns].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">Exposure / treatment</Label>
              <Select value={exposure || "__none__"} onValueChange={v => setExposure(v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-background/50 font-mono text-xs">
                  <SelectValue placeholder="select column…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {[...ds.numeric_columns, ...ds.categorical_columns].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={run} disabled={loading || !question.trim()} className="w-full">
            {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />generating designs…</> : <><FlaskConical className="h-3 w-3 mr-2" />generate study designs</>}
          </Button>
        </div>

        {error && <div className="text-xs text-red-400 terminal-panel p-3">{error}</div>}

        {result && (
          <div className="space-y-4">
            {/* data structure summary */}
            <div className="terminal-panel p-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">structure</div>
                <div className="text-primary font-mono">{result.data_structure?.recommended_model_family}</div>
              </div>
              <div>
                <div className="text-muted-foreground">repeated measures</div>
                <div className={result.data_structure?.has_repeated_measures ? "text-yellow-400" : "text-muted-foreground"}>
                  {result.data_structure?.has_repeated_measures ? "yes" : "no"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">hierarchy</div>
                <div className="text-accent font-mono">{result.data_structure?.hierarchy_variable ?? "none detected"}</div>
              </div>
            </div>

            {/* design selector */}
            <div className="flex gap-2">
              {designs.map((d, i) => {
                const cfg = STRENGTH_CONFIG[d.strength] ?? STRENGTH_CONFIG.moderate;
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(i)}
                    className={`flex-1 terminal-panel p-3 text-left transition-all text-xs border ${
                      selected === i ? "border-primary" : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <div className="font-mono text-foreground truncate">{d.name}</div>
                    <div className={`mt-1 ${cfg.color}`}>{cfg.label}</div>
                    <div className="text-muted-foreground mt-0.5">{d.design_type.replace(/_/g," ")}</div>
                  </button>
                );
              })}
            </div>

            {/* active design detail */}
            {active && (
              <div className="terminal-panel p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono text-primary">{active.name}</h3>
                  <Badge variant="outline" className={
                    active.causal_inference_possible ? "border-green-500/40 text-green-400" : "border-yellow-500/40 text-yellow-400"
                  }>
                    {active.causal_inference_possible ? "causal inference possible" : "association only"}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase">Model formula</div>
                  <code className="block bg-background/60 rounded p-2 text-xs text-accent font-mono">{active.formula}</code>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground uppercase">Specific model</div>
                  <div className="text-xs font-mono text-foreground">{active.model}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground uppercase">Assumptions to check</div>
                    <ul className="space-y-1">
                      {active.assumptions?.map((a, i) => (
                        <li key={i} className="text-xs text-foreground flex gap-2">
                          <span className="text-yellow-400 shrink-0">⚠</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground uppercase">Limitations</div>
                    <ul className="space-y-1">
                      {active.limitations?.map((l, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-2">
                          <span className="text-red-400 shrink-0">✗</span>{l}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase">Implementation steps</div>
                  <ol className="space-y-1">
                    {active.implementation_steps?.map((s, i) => (
                      <li key={i} className="text-xs text-foreground">
                        <span className="text-primary font-mono">{String(i+1).padStart(2,"0")}.</span> {s}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {result.recommendation && (
              <div className="terminal-panel p-3 border border-primary/20 text-xs text-muted-foreground">
                <span className="text-primary">▸ recommendation: </span>{result.recommendation}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}