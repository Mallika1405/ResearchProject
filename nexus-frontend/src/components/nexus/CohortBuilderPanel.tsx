import { useState } from "react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Button } from "@/components/ui/button";
import { Loader2, GitMerge, AlertTriangle, CheckCircle2, Zap, Sparkles, ChevronDown } from "lucide-react";

interface StudyDataset {
  dataset_id: string;
  filename: string;
  rows: number;
  columns: number;
  model_recommendation: string;
}

interface Props {
  currentDs: UploadResponse;
  studyDatasets: StudyDataset[];   // ← only datasets in this study
  onCohortBuilt: (ds: UploadResponse) => void;
}

export function CohortBuilderPanel({ currentDs, studyDatasets, onCohortBuilt }: Props) {
  const [selected, setSelected]   = useState<string[]>(studyDatasets.map(d => d.dataset_id));
  const [aiLoading, setAiLoading] = useState(false);
  const [plan, setPlan]           = useState<any>(null);
  const [building, setBuilding]   = useState(false);
  const [result, setResult]       = useState<any>(null);
  const [error, setError]         = useState("");
  const [showMissing, setShowMissing] = useState(false);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const analyze = async () => {
    if (selected.length < 2) return;
    setAiLoading(true); setError(""); setPlan(null); setResult(null);
    try {
      const r = await api.analyzeJoinStrategy({ dataset_ids: selected });
      setPlan(r.plan);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const build = async () => {
    if (!plan) return;
    setBuilding(true); setError("");

    // Build join_keys from AI plan
    const joinKeys: Record<string, string> = {};
    for (const pair of plan.join_pairs ?? []) {
      if (pair.key_a) joinKeys[pair.dataset_a_id] = pair.key_a;
      if (pair.key_b) joinKeys[pair.dataset_b_id] = pair.key_b;
    }

    const joinableIds = selected.filter(id => !(plan.cannot_join_ids ?? []).includes(id));

    if (joinableIds.length < 2) {
      setError("AI determined these datasets cannot be directly joined. Analyze them separately via the switch in the sidebar.");
      setBuilding(false);
      return;
    }

    try {
      const r = await api.cohortBuilder({ dataset_ids: joinableIds, join_keys: joinKeys });
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBuilding(false);
    }
  };

  const useCohort = () => {
    if (!result) return;
    onCohortBuilt({
      dataset_id: result.cohort_dataset_id,
      filename: `cohort_${selected.length}datasets.csv`,
      rows: result.n_rows,
      columns: result.n_columns,
      numeric_columns: result.schema?.filter((c: any) => c.type === "numeric").map((c: any) => c.name) ?? [],
      categorical_columns: result.schema?.filter((c: any) => c.type === "categorical").map((c: any) => c.name) ?? [],
      datetime_columns: result.schema?.filter((c: any) => c.type === "datetime").map((c: any) => c.name) ?? [],
      schema: result.schema ?? [],
      fingerprint: result.cohort_dataset_id,
      data_structure: result.data_structure,
      model_recommendation: result.data_structure?.recommended_model_family ?? "OLS",
      missing_summary: result.missing_after_merge ?? {},
    });
  };

  const cannotJoinIds: string[] = plan?.cannot_join_ids ?? [];

  return (
    <div className="space-y-4 animate-slide-up">

      {/* dataset selector — study datasets only */}
      <div className="nx-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Datasets in this study</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select which to merge. AI will analyze the schemas and figure out how to join them safely.
          </p>
        </div>

        {studyDatasets.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No other datasets in this study. Upload more via the Studies page.
          </p>
        )}

        <div className="space-y-2">
          {studyDatasets.map(d => {
            const isCantJoin = cannotJoinIds.includes(d.dataset_id);
            const isSelected = selected.includes(d.dataset_id);
            return (
              <div
                key={d.dataset_id}
                onClick={() => toggle(d.dataset_id)}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? isCantJoin
                      ? "border-amber-300 bg-amber-50"
                      : "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-secondary/40"
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  isSelected ? (isCantJoin ? "bg-amber-400" : "bg-primary") : "bg-border"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono truncate text-foreground">{d.filename}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {d.rows.toLocaleString()} rows · {d.columns} cols
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[10px]">
                  {d.dataset_id === currentDs.dataset_id && (
                    <span className="nx-badge-primary">current</span>
                  )}
                  {isCantJoin && (
                    <span className="nx-badge-warning">wide format</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button
          onClick={analyze}
          disabled={aiLoading || selected.length < 2}
          variant="outline"
          className="w-full"
        >
          {aiLoading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Analyzing with Gemini…</>
            : <><Sparkles className="h-3.5 w-3.5 mr-2" />Analyze schemas — find join keys</>}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* AI plan */}
      {plan && !plan.error && (
        <div className="nx-card p-5 space-y-4 animate-slide-up">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Gemini join strategy</span>
            <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full ${
              plan.strategy === "join" ? "bg-green-50 text-green-700" :
              plan.strategy === "analyze_separately" ? "bg-amber-50 text-amber-700" :
              "bg-primary/10 text-primary"
            }`}>
              {(plan.strategy ?? "unknown").replace(/_/g, " ")}
            </span>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">{plan.reasoning}</p>

          {/* join pairs */}
          {(plan.join_pairs ?? []).length > 0 && (
            <div className="space-y-2">
              <div className="nx-label">Join keys</div>
              {plan.join_pairs.map((pair: any, i: number) => {
                const dsA = studyDatasets.find(d => d.dataset_id === pair.dataset_a_id);
                const dsB = studyDatasets.find(d => d.dataset_id === pair.dataset_b_id);
                return (
                  <div key={i} className="p-3 bg-secondary/40 rounded-lg text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-foreground truncate">{dsA?.filename ?? pair.dataset_a_id}</div>
                        <div className="text-muted-foreground mt-0.5">key: <span className="text-primary font-mono font-semibold">{pair.key_a}</span></div>
                      </div>
                      <GitMerge className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0 text-right">
                        <div className="font-mono text-foreground truncate">{dsB?.filename ?? pair.dataset_b_id}</div>
                        <div className="text-muted-foreground mt-0.5">key: <span className="text-primary font-mono font-semibold">{pair.key_b}</span></div>
                      </div>
                    </div>
                    {pair.join_type && (
                      <div className="text-muted-foreground">join type: <span className="font-medium">{pair.join_type}</span></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* cannot join */}
          {cannotJoinIds.length > 0 && (
            <div className="space-y-1.5">
              <div className="nx-label text-amber-600">Cannot join directly — analyze separately</div>
              {cannotJoinIds.map(id => {
                const ds = studyDatasets.find(d => d.dataset_id === id);
                return (
                  <div key={id} className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs">
                    <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="font-mono text-amber-800 truncate flex-1">{ds?.filename ?? id}</span>
                    <span className="text-amber-600 shrink-0">switch to this dataset in the sidebar</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* warnings */}
          {(plan.warnings ?? []).length > 0 && (
            <div className="space-y-1.5">
              <div className="nx-label">Warnings</div>
              {plan.warnings.map((w: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />{w}
                </div>
              ))}
            </div>
          )}

          {plan.next_steps && (
            <div className="text-xs text-muted-foreground p-3 bg-secondary/40 rounded-lg">
              <span className="font-medium text-foreground">Next: </span>{plan.next_steps}
            </div>
          )}

          {(plan.join_pairs ?? []).length > 0 && (
            <Button onClick={build} disabled={building} className="w-full">
              {building
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Building cohort…</>
                : <><GitMerge className="h-3.5 w-3.5 mr-2" />Build cohort with these keys</>}
            </Button>
          )}
        </div>
      )}

      {plan?.error && (
        <div className="nx-card p-4 text-xs text-muted-foreground space-y-2">
          <div className="font-medium text-foreground">Raw AI response</div>
          <pre className="whitespace-pre-wrap">{plan.raw_response}</pre>
        </div>
      )}

      {/* result */}
      {result && (
        <div className="nx-card p-5 space-y-4 animate-slide-up">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="font-semibold text-sm">Cohort built</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Rows",    value: result.n_rows?.toLocaleString() },
              { label: "Columns", value: result.n_columns },
              { label: "Sources", value: result.source_datasets?.length },
            ].map(s => (
              <div key={s.label} className="nx-stat">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                <span className="text-lg font-semibold font-mono text-foreground">{s.value}</span>
              </div>
            ))}
          </div>

          {(result.warnings ?? []).length > 0 && result.warnings.map((w: string, i: number) => (
            <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />{w}
            </div>
          ))}

          {Object.keys(result.missing_after_merge ?? {}).length > 0 && (
            <div>
              <button onClick={() => setShowMissing(v => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-3 w-3 transition-transform ${showMissing ? "rotate-180" : ""}`} />
                Missing values after merge ({Object.keys(result.missing_after_merge).length} columns)
              </button>
              {showMissing && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(result.missing_after_merge as Record<string, number>).map(([col, n]) => (
                    <span key={col} className="nx-badge-warning font-mono text-[10px]">{col}: {n}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button onClick={useCohort} className="w-full">
            <Zap className="h-3.5 w-3.5 mr-2" />Use this cohort for analysis
          </Button>
        </div>
      )}
    </div>
  );
}