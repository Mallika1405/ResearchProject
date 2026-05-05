import { useState } from "react";
import { api, UploadResponse, Hypothesis } from "@/lib/nexus-api";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TestTube } from "lucide-react";

interface Props { ds: UploadResponse; }

const PRIORITY_COLOR: Record<string, string> = {
  primary:     "border-primary/50 text-primary",
  secondary:   "border-yellow-500/50 text-yellow-400",
  exploratory: "border-muted-foreground/50 text-muted-foreground",
};

export function HypothesisPanel({ ds }: Props) {
  const [question, setQuestion] = useState("");
  const [domain,   setDomain]   = useState("biomedical");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState("");
  const [expanded, setExpanded] = useState<number | null>(0);

  const run = async () => {
    if (!question.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await api.hypotheses({ dataset_id: ds.dataset_id, research_question: question, domain });
      setResult(r);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const hyps: Hypothesis[] = result?.hypotheses ?? [];

  return (
    <Section title="hypothesis.engine" icon="🔬">
      <div className="space-y-4">
        <div className="terminal-panel p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase">Research question *</Label>
            <Input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. What are the predictors of 30-day hospital readmission?"
              className="bg-background/50 font-mono text-sm"
              onKeyDown={e => e.key === "Enter" && run()}
            />
          </div>
          <div className="flex gap-3 items-end">
            <div className="space-y-1 w-48">
              <Label className="text-xs text-muted-foreground uppercase">Domain</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger className="bg-background/50 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["biomedical","clinical","epidemiology","psychology","ecology","economics","social science"].map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={run} disabled={loading || !question.trim()} className="flex-1">
              {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />generating…</> : <><TestTube className="h-3 w-3 mr-2" />generate hypotheses</>}
            </Button>
          </div>
        </div>

        {error && <div className="text-xs text-red-400 terminal-panel p-3">{error}</div>}

        {result && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground px-1">
              {hyps.length} hypotheses generated · primary hypotheses should be pre-registered before analysis
            </div>

            {hyps.map((h, i) => (
              <div
                key={i}
                className={`terminal-panel border transition-all ${
                  expanded === i ? "border-primary/40" : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <button
                  className="w-full p-3 text-left"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-mono text-sm font-bold">{h.h_number}</span>
                    <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLOR[h.priority] ?? ""}`}>
                      {h.priority}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">
                      {h.direction}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {h.outcome_variable} ← {h.predictor_variable}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-foreground line-clamp-1">{h.alternative_hypothesis}</div>
                </button>

                {expanded === i && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-[10px] text-muted-foreground uppercase">H₀ (null)</div>
                        <div className="text-xs text-muted-foreground">{h.null_hypothesis}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] text-muted-foreground uppercase">H₁ (alternative)</div>
                        <div className="text-xs text-foreground">{h.alternative_hypothesis}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Statistical test</div>
                        <div className="font-mono text-primary">{h.appropriate_test}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Effect size</div>
                        <div className="font-mono text-accent">{h.effect_size_measure}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Sample adequate?</div>
                        <div className={h.sample_size_adequate ? "text-green-400" : "text-red-400"}>
                          {h.sample_size_adequate ? "yes" : "no — check power"}
                        </div>
                      </div>
                    </div>

                    {h.covariates?.length > 0 && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase mb-1">Control for</div>
                        <div className="flex flex-wrap gap-1">
                          {h.covariates.map(c => (
                            <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="terminal-panel p-3 text-[10px] text-muted-foreground border border-yellow-500/20">
              <span className="text-yellow-400">⚠ </span>
              Pre-register primary hypotheses before collecting or analyzing data to prevent p-hacking and HARKing.
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}