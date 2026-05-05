import { useState } from "react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Play } from "lucide-react";
import { Section } from "./Section";
import { CorrelationHeatmap } from "./CorrelationHeatmap";
import { toast } from "sonner";

interface Props {
  ds: UploadResponse;
  onResults: (r: any) => void;
  results: any;
}

const Stat = ({ label, value, accent = false }: { label: string; value: any; accent?: boolean }) => (
  <div className="flex flex-col gap-0.5 rounded border border-border/50 bg-secondary/30 px-3 py-2">
    <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
    <span className={`font-mono text-sm ${accent ? "text-primary glow-text" : ""}`}>{value ?? "—"}</span>
  </div>
);

const sigBadge = (sig: boolean) => (
  <span
    className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${
      sig ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"
    }`}
  >
    {sig ? "significant" : "n.s."}
  </span>
);

export const AnalysisPanel = ({ ds, onResults, results }: Props) => {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.analyze({ dataset_id: ds.dataset_id, goal });
      onResults(r);
      toast.success("analysis complete");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="terminal-panel flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <span className="text-xs text-muted-foreground">$ nexus analyze --goal</span>
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="describe your research question (optional)"
          className="flex-1 border-border bg-input font-mono"
        />
        <Button onClick={run} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          execute pipeline
        </Button>
      </div>

      {!results && (
        <div className="terminal-panel scan-line relative p-12 text-center text-sm text-muted-foreground">
          <div className="text-primary">// awaiting execution</div>
          <div className="mt-2">12 statistical agents will run: correlation · regression · normality · outliers · isolation forest · t-tests · ANOVA · chi-square · K-means · PCA · feature importance · AI methods</div>
        </div>
      )}

      {results && (
        <div className="grid gap-4 lg:grid-cols-2">
          {results.strongest_correlation && (
            <Section title="strongest correlation" badge="pearson">
              <div className="space-y-2">
                <div className="font-mono text-sm">
                  <span className="text-accent">{results.strongest_correlation.col_a}</span>
                  <span className="text-muted-foreground"> ↔ </span>
                  <span className="text-accent">{results.strongest_correlation.col_b}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="r" value={results.strongest_correlation.r} accent />
                  <Stat label="p-value" value={results.strongest_correlation.p} />
                </div>
              </div>
            </Section>
          )}

          {results.regression && (
            <Section title="linear regression" badge="OLS">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {results.regression.outcome} ~ {results.regression.predictor}
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Stat label="R²" value={results.regression.r2} accent />
                  <Stat label="adj R²" value={results.regression.adj_r2} />
                  <Stat label="slope" value={results.regression.slope} />
                  <Stat label="rmse" value={results.regression.rmse} />
                </div>
              </div>
            </Section>
          )}

          {results.correlation_matrix && (
            <Section title="correlation matrix" badge={`${results.correlation_matrix.labels.length} vars`}>
              <CorrelationHeatmap {...results.correlation_matrix} />
            </Section>
          )}

          {results.anova && !results.anova.error && (
            <Section title="one-way ANOVA" badge={results.anova.effect_size}>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {results.anova.value_column} ~ {results.anova.group_column}
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Stat label="F" value={results.anova.f_statistic} accent />
                  <Stat label="p" value={results.anova.p_value} />
                  <Stat label="η²" value={results.anova.eta_squared} />
                  <Stat label="groups" value={results.anova.n_groups} />
                </div>
                {sigBadge(results.anova.significant)}
              </div>
            </Section>
          )}

          {results.chi_square && (
            <Section title="chi-square independence" badge={results.chi_square.effect_size}>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {results.chi_square.column_a} × {results.chi_square.column_b}
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Stat label="χ²" value={results.chi_square.chi2_statistic} accent />
                  <Stat label="p" value={results.chi_square.p_value} />
                  <Stat label="df" value={results.chi_square.degrees_of_freedom} />
                  <Stat label="cramér v" value={results.chi_square.cramers_v} />
                </div>
                {sigBadge(results.chi_square.significant)}
              </div>
            </Section>
          )}

          {results.clustering && (
            <Section title="K-means clustering" badge={`k=${results.clustering.k}`}>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="silhouette" value={results.clustering.silhouette_score} accent />
                  <Stat label="inertia" value={results.clustering.inertia} />
                </div>
                <div className="space-y-1">
                  {results.clustering.cluster_stats?.map((c: any) => (
                    <div key={c.cluster} className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-primary/20 px-2 py-0.5 text-primary">cluster {c.cluster}</span>
                      <span className="text-muted-foreground">n={c.n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {results.pca && (
            <Section title="principal components" badge={`${results.pca.n_components} dims`}>
              <div className="space-y-2">
                {results.pca.explained_variance_ratio.map((v: number, i: number) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-accent">PC{i + 1}</span>
                      <span className="text-muted-foreground">{(v * 100).toFixed(1)}% variance</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-secondary">
                      <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${v * 100}%` }} />
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-muted-foreground">
                  cumulative: {(results.pca.cumulative_variance.at(-1) * 100).toFixed(1)}%
                </div>
              </div>
            </Section>
          )}

          {results.feature_importance && (
            <Section title="feature importance" badge="random forest">
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">target: {results.feature_importance.target}</div>
                {Object.entries(results.feature_importance.gini_importance).map(([k, v]: any) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs">
                      <span>{k}</span>
                      <span className="text-primary">{v.toFixed(3)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded bg-secondary">
                      <div className="h-full bg-primary" style={{ width: `${v * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {results.isolation_forest && (
            <Section title="anomaly detection" badge="isolation forest">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="anomalies" value={results.isolation_forest.n_anomalies} accent />
                <Stat label="rate" value={`${results.isolation_forest.anomaly_pct}%`} />
              </div>
            </Section>
          )}

          {results.group_comparisons?.length > 0 && (
            <Section title="t-tests" badge="welch">
              <div className="space-y-2">
                {results.group_comparisons.slice(0, 4).map((t: any, i: number) => (
                  <div key={i} className="rounded border border-border/50 bg-secondary/30 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span>
                        <span className="text-accent">{t.group_a}</span> vs <span className="text-accent">{t.group_b}</span>
                      </span>
                      {sigBadge(t.significant)}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      t={t.t_stat} · p={t.p_value} · d={t.cohens_d} ({t.effect_size})
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {results.ai_methods_section && (
            <div className="lg:col-span-2">
              <Section title="AI-generated methods section" badge="gemini" badgeColor="text-accent">
                <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                  {results.ai_methods_section}
                </div>
              </Section>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
