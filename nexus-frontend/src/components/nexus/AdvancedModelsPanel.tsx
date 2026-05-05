import { useState } from "react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Brain } from "lucide-react";

interface Props { ds: UploadResponse; }

// ── multi-select helper ─────────────────────────────────────────────────────
function MultiSelect({ cols, selected, onChange, placeholder }: {
  cols: string[]; selected: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-2 bg-background/50 border border-input rounded min-h-9">
      {selected.map(c => (
        <Badge key={c} variant="secondary" className="cursor-pointer text-[10px]" onClick={() => onChange(selected.filter(x => x !== c))}>
          {c} ×
        </Badge>
      ))}
      <Select value="" onValueChange={v => { if (v && !selected.includes(v)) onChange([...selected, v]); }}>
        <SelectTrigger className="h-5 w-24 border-0 bg-transparent text-xs text-muted-foreground p-0">
          <SelectValue placeholder={placeholder ?? "+ add"} />
        </SelectTrigger>
        <SelectContent>
          {cols.filter(c => !selected.includes(c)).map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── result display ──────────────────────────────────────────────────────────
function ResultBox({ data }: { data: any }) {
  if (!data) return null;
  const { interpretation, ...rest } = data;
  return (
    <div className="space-y-3">
      {interpretation && (
        <div className="terminal-panel p-3 border border-primary/20">
          <div className="text-[10px] uppercase text-primary mb-1">// AI interpretation</div>
          <p className="text-xs text-foreground leading-relaxed">{interpretation}</p>
        </div>
      )}
      <div className="terminal-panel p-3">
        <div className="text-[10px] uppercase text-muted-foreground mb-2">// raw results</div>
        <pre className="text-[10px] text-muted-foreground overflow-auto max-h-64 font-mono whitespace-pre-wrap">
          {JSON.stringify(rest, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ── field helper ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground uppercase">{label}</Label>
      {children}
    </div>
  );
}

// ── sub-panels ──────────────────────────────────────────────────────────────
function LMMPanel({ ds }: Props) {
  const num = ds.numeric_columns; const cat = ds.categorical_columns;
  const [outcome, setOutcome] = useState("");
  const [fixed, setFixed]     = useState<string[]>([]);
  const [random, setRandom]   = useState<string[]>([]);
  const [family, setFamily]   = useState("gaussian");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState("");

  const run = async () => {
    if (!outcome || fixed.length === 0 || random.length === 0) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.lmm({ dataset_id: ds.dataset_id, outcome, fixed_effects: fixed, random_effects: random, family })); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="terminal-panel p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Outcome">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
              <SelectContent>{num.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Model family">
            <Select value={family} onValueChange={setFamily}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["gaussian","binomial","poisson","negativebinomial"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Fixed effects"><MultiSelect cols={[...num,...cat]} selected={fixed} onChange={setFixed} /></Field>
        <Field label="Random effects (grouping variable)"><MultiSelect cols={[...cat,...num]} selected={random} onChange={setRandom} /></Field>
        <Button onClick={run} disabled={loading || !outcome || fixed.length===0 || random.length===0} className="w-full">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />fitting LMM…</> : "run mixed-effects model"}
        </Button>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
      {result?.coefficients && (
        <div className="terminal-panel p-3 space-y-2">
          <div className="text-[10px] text-muted-foreground uppercase">Coefficients</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead><tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1">variable</th>
                <th className="text-right py-1">β</th>
                <th className="text-right py-1">se</th>
                <th className="text-right py-1">p</th>
                <th className="text-right py-1">sig</th>
              </tr></thead>
              <tbody>{result.coefficients.map((c: any, i: number) => (
                <tr key={i} className={`border-b border-border/30 ${c.significant ? "text-foreground" : "text-muted-foreground"}`}>
                  <td className="py-1">{c.variable}</td>
                  <td className="text-right">{c.coefficient?.toFixed(4)}</td>
                  <td className="text-right">{c.std_error?.toFixed(4)}</td>
                  <td className="text-right">{c.p_value?.toFixed(4)}</td>
                  <td className="text-right">{c.significant ? <span className="text-green-400">✓</span> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {result.icc != null && (
            <div className="text-xs mt-2"><span className="text-muted-foreground">ICC: </span>
              <span className="text-primary font-mono">{result.icc}</span>
              <span className="text-muted-foreground ml-2">({result.icc_interpretation})</span>
            </div>
          )}
        </div>
      )}
      <ResultBox data={result ? { interpretation: result.interpretation } : null} />
    </div>
  );
}

function SurvivalPanel({ ds }: Props) {
  const num = ds.numeric_columns; const cat = ds.categorical_columns;
  const [dur, setDur]       = useState("");
  const [event, setEvent]   = useState("");
  const [group, setGroup]   = useState("");
  const [covs, setCovs]     = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState("");

  const run = async () => {
    if (!dur || !event) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.survival({ dataset_id: ds.dataset_id, duration_col: dur, event_col: event, group_col: group || undefined, covariates: covs })); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="terminal-panel p-3 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Duration column">
            <Select value={dur} onValueChange={setDur}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
              <SelectContent>{num.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Event column (0/1)">
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
              <SelectContent>{num.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Group column">
            <Select value={group} onValueChange={v => setGroup(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— none —</SelectItem>
                {cat.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Cox PH covariates"><MultiSelect cols={[...num,...cat]} selected={covs} onChange={setCovs} /></Field>
        <Button onClick={run} disabled={loading || !dur || !event} className="w-full">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />running survival…</> : "kaplan-meier + cox PH"}
        </Button>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
      {result && (
        <div className="space-y-3">
          {result.kaplan_meier && (
            <div className="terminal-panel p-3 grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Median survival</div>
                <div className="text-primary font-mono text-lg">{result.kaplan_meier.median_survival ?? "∞"}</div>
              </div>
              {result.logrank_test && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Log-rank test</div>
                  <div className={`font-mono ${result.logrank_test.significant ? "text-green-400" : "text-muted-foreground"}`}>
                    p = {result.logrank_test.p_value?.toFixed(4)}
                  </div>
                  <div className="text-muted-foreground text-[10px]">{result.logrank_test.group_a} vs {result.logrank_test.group_b}</div>
                </div>
              )}
            </div>
          )}
          {result.cox_ph?.coefficients && (
            <div className="terminal-panel p-3 space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase">Cox PH hazard ratios</div>
              <table className="w-full text-[10px] font-mono">
                <thead><tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1">variable</th>
                  <th className="text-right py-1">HR</th>
                  <th className="text-right py-1">95% CI</th>
                  <th className="text-right py-1">p</th>
                </tr></thead>
                <tbody>{result.cox_ph.coefficients.map((c: any, i: number) => (
                  <tr key={i} className={`border-b border-border/30 ${c.significant ? "text-foreground" : "text-muted-foreground"}`}>
                    <td className="py-1">{c.variable}</td>
                    <td className="text-right">{c.exp_coef?.toFixed(3)}</td>
                    <td className="text-right">[{c.ci_lower?.toFixed(3)}, {c.ci_upper?.toFixed(3)}]</td>
                    <td className="text-right">{c.p_value?.toFixed(4)}</td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="text-[10px] text-muted-foreground">Concordance: {result.cox_ph.concordance?.toFixed(3)}</div>
            </div>
          )}
          <ResultBox data={{ interpretation: result.interpretation }} />
        </div>
      )}
    </div>
  );
}

function CausalPanel({ ds }: Props) {
  const num = ds.numeric_columns; const cat = ds.categorical_columns;
  const [outcome, setOutcome] = useState("");
  const [treatment, setTreatment] = useState("");
  const [covs, setCovs] = useState<string[]>([]);
  const [method, setMethod] = useState("propensity_matching");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState("");

  const run = async () => {
    if (!outcome || !treatment) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.causalInference({ dataset_id: ds.dataset_id, outcome, treatment, covariates: covs, method })); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="terminal-panel p-3 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Outcome">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
              <SelectContent>{[...num,...cat].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Treatment (binary)">
            <Select value={treatment} onValueChange={setTreatment}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
              <SelectContent>{[...num,...cat].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="propensity_matching">propensity matching</SelectItem>
                <SelectItem value="ipw">IPW</SelectItem>
                <SelectItem value="regression_adjustment">regression adjustment</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Covariates to control"><MultiSelect cols={[...num,...cat].filter(c => c!==outcome&&c!==treatment)} selected={covs} onChange={setCovs} /></Field>
        <Button onClick={run} disabled={loading || !outcome || !treatment} className="w-full">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />running causal inference…</> : `run ${method.replace(/_/g," ")}`}
        </Button>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="text-[10px] text-yellow-400">⚠ Observational causal inference requires strong untestable assumptions.</div>
      </div>
      <ResultBox data={result} />
    </div>
  );
}

function MediationPanel({ ds }: Props) {
  const num = ds.numeric_columns; const cat = ds.categorical_columns;
  const [outcome, setOutcome]   = useState("");
  const [mediator, setMediator] = useState("");
  const [exposure, setExposure] = useState("");
  const [covs, setCovs]         = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<any>(null);
  const [error, setError]       = useState("");

  const run = async () => {
    if (!outcome || !mediator || !exposure) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.mediation({ dataset_id: ds.dataset_id, outcome, mediator, exposure, covariates: covs })); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="terminal-panel p-3 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {[["Exposure (X)", exposure, setExposure], ["Mediator (M)", mediator, setMediator], ["Outcome (Y)", outcome, setOutcome]].map(([label, val, set]) => (
            <Field key={label as string} label={label as string}>
              <Select value={val as string} onValueChange={set as (v: string) => void}>
                <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
                <SelectContent>{[...num,...cat].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          ))}
        </div>
        <Field label="Covariates"><MultiSelect cols={[...num,...cat]} selected={covs} onChange={setCovs} /></Field>
        <Button onClick={run} disabled={loading || !outcome || !mediator || !exposure} className="w-full">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />running…</> : "baron-kenny mediation + sobel test"}
        </Button>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
      {result && !result.error && (
        <div className="space-y-3">
          <div className="terminal-panel p-3">
            <div className="text-[10px] text-muted-foreground uppercase mb-3">Mediation paths  X → M → Y</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                ["Path a (X→M)", result.path_a],
                ["Path b (M→Y|X)", result.path_b],
                ["Direct effect c'", result.path_c_direct],
                ["Total effect c", result.path_c_total],
              ].map(([label, p]: any) => (
                <div key={label} className="space-y-0.5">
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="font-mono">β = <span className="text-primary">{p?.coef?.toFixed(4)}</span> <span className="text-muted-foreground">(p={p?.p?.toFixed(4)})</span></div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-[10px] text-muted-foreground">Indirect effect</div>
                <div className="font-mono text-accent">{result.indirect_effect?.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Sobel p</div>
                <div className={`font-mono ${result.mediation_significant ? "text-green-400" : "text-muted-foreground"}`}>{result.sobel_p?.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Mediation type</div>
                <div className="font-mono text-primary">{result.mediation_type}</div>
              </div>
            </div>
          </div>
          <ResultBox data={{ interpretation: result.interpretation }} />
        </div>
      )}
    </div>
  );
}

function SHAPPanel({ ds }: Props) {
  const num = ds.numeric_columns;
  const [outcome, setOutcome] = useState("");
  const [preds, setPreds]     = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState("");

  const run = async () => {
    if (!outcome) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.shapAnalysis({ dataset_id: ds.dataset_id, outcome, predictors: preds })); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const maxVal = result ? Math.max(...Object.values(result.shap_mean_abs ?? {}) as number[]) : 1;

  return (
    <div className="space-y-3">
      <div className="terminal-panel p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Outcome (target)">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
              <SelectContent>{num.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Predictors (optional, default = all)">
            <MultiSelect cols={num.filter(c => c!==outcome)} selected={preds} onChange={setPreds} />
          </Field>
        </div>
        <Button onClick={run} disabled={loading || !outcome} className="w-full">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />computing SHAP…</> : "run SHAP explainability"}
        </Button>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
      {result?.shap_mean_abs && (
        <div className="terminal-panel p-3 space-y-3">
          <div className="text-[10px] text-muted-foreground uppercase">Mean |SHAP| values → {result.outcome}</div>
          <div className="space-y-2">
            {Object.entries(result.shap_mean_abs as Record<string,number>).map(([feat, val]) => (
              <div key={feat} className="space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="font-mono text-foreground">{feat}</span>
                  <span className="text-primary">{val.toFixed(4)}</span>
                </div>
                <div className="h-1.5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary rounded transition-all" style={{ width: `${(val/maxVal)*100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground">{result.note}</div>
        </div>
      )}
    </div>
  );
}

function SensitivityPanel({ ds }: Props) {
  const num = ds.numeric_columns;
  const [outcome, setOutcome] = useState("");
  const [preds, setPreds]     = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState("");

  const run = async () => {
    if (!outcome || preds.length === 0) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.sensitivityAnalysis({ dataset_id: ds.dataset_id, outcome, predictors: preds })); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="terminal-panel p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Outcome">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue placeholder="select…" /></SelectTrigger>
              <SelectContent>{num.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Predictors"><MultiSelect cols={num.filter(c=>c!==outcome)} selected={preds} onChange={setPreds} /></Field>
        </div>
        <Button onClick={run} disabled={loading || !outcome || preds.length===0} className="w-full">
          {loading ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />running…</> : "OLS + Ridge + Lasso + bootstrap"}
        </Button>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
      {result?.stability && (
        <div className="terminal-panel p-3 space-y-3">
          <div className="text-[10px] text-muted-foreground uppercase">Coefficient stability across models</div>
          <table className="w-full text-[10px] font-mono">
            <thead><tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-1">predictor</th>
              <th className="text-right py-1">OLS β</th>
              <th className="text-right py-1">Ridge β</th>
              <th className="text-right py-1">boot 95% CI</th>
              <th className="text-right py-1">verdict</th>
            </tr></thead>
            <tbody>{preds.map(p => {
              const s = result.stability?.[p];
              const ols = result.models?.ols?.[p]?.coef;
              const ridge = result.models?.ridge_alpha1?.[p]?.coef;
              const boot = result.bootstrap_cis?.[p];
              return (
                <tr key={p} className="border-b border-border/30">
                  <td className="py-1 text-foreground">{p}</td>
                  <td className="text-right">{ols?.toFixed(4) ?? "—"}</td>
                  <td className="text-right">{ridge?.toFixed(4) ?? "—"}</td>
                  <td className="text-right">[{boot?.ci_lower?.toFixed(3)}, {boot?.ci_upper?.toFixed(3)}]</td>
                  <td className={`text-right ${s?.verdict?.includes("stable") ? "text-green-400" : "text-yellow-400"}`}>
                    {s?.verdict?.includes("stable") ? "stable" : "unstable"}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          <ResultBox data={{ interpretation: result.interpretation }} />
        </div>
      )}
    </div>
  );
}

// ── main export ─────────────────────────────────────────────────────────────
export function AdvancedModelsPanel({ ds }: Props) {
  return (
    <Section title="advanced.models" icon="🧠">
      <Tabs defaultValue="lmm">
        <TabsList className="border border-border bg-card/40">
          <TabsTrigger value="lmm">LMM</TabsTrigger>
          <TabsTrigger value="survival">survival</TabsTrigger>
          <TabsTrigger value="causal">causal</TabsTrigger>
          <TabsTrigger value="mediation">mediation</TabsTrigger>
          <TabsTrigger value="shap">SHAP</TabsTrigger>
          <TabsTrigger value="sensitivity">sensitivity</TabsTrigger>
        </TabsList>

        <div className="mt-1 p-2 terminal-panel text-[10px] text-muted-foreground border-b border-border">
          <Brain className="h-3 w-3 inline mr-1 text-primary" />
          Detected structure: <span className="text-primary font-mono">{ds.data_structure?.recommended_model_family}</span>
          {ds.data_structure?.has_repeated_measures && <span className="text-yellow-400 ml-2">· repeated measures detected → LMM recommended</span>}
          {ds.data_structure?.hierarchy_variable && <span className="text-accent ml-2">· hierarchy: {ds.data_structure.hierarchy_variable}</span>}
        </div>

        <TabsContent value="lmm"        className="mt-4"><LMMPanel ds={ds} /></TabsContent>
        <TabsContent value="survival"   className="mt-4"><SurvivalPanel ds={ds} /></TabsContent>
        <TabsContent value="causal"     className="mt-4"><CausalPanel ds={ds} /></TabsContent>
        <TabsContent value="mediation"  className="mt-4"><MediationPanel ds={ds} /></TabsContent>
        <TabsContent value="shap"       className="mt-4"><SHAPPanel ds={ds} /></TabsContent>
        <TabsContent value="sensitivity" className="mt-4"><SensitivityPanel ds={ds} /></TabsContent>
      </Tabs>
    </Section>
  );
}