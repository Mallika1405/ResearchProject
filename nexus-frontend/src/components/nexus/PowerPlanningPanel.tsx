import { useState } from "react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, BarChart3 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props { ds: UploadResponse; }

const EFFECT_PRESETS = [
  { label: "small",  d: "0.2", hint: "Cohen's d = 0.2" },
  { label: "medium", d: "0.5", hint: "Cohen's d = 0.5" },
  { label: "large",  d: "0.8", hint: "Cohen's d = 0.8" },
];

export function PowerPlanningPanel({ ds }: Props) {
  const [effectSize, setEffectSize] = useState("0.5");
  const [alpha,      setAlpha]      = useState("0.05");
  const [power,      setPower]      = useState("0.80");
  const [testType,   setTestType]   = useState("two_sample_t");
  const [nGroups,    setNGroups]    = useState("2");
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<any>(null);
  const [error,      setError]      = useState("");

  const run = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      setResult(await api.powerPlanning({
        effect_size: parseFloat(effectSize),
        alpha: parseFloat(alpha),
        power: parseFloat(power),
        test_type: testType,
        n_groups: parseInt(nGroups),
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const powerCurveData = result?.power_curve
    ? Object.entries(result.power_curve as Record<string, number>).map(([n, p]) => ({
        n: parseInt(n),
        power: Math.round((p as number) * 100),
      }))
    : [];

  const requiredN = result?.total_n ?? result?.n_required ?? 0;
  const adequatelyPowered = ds.rows >= requiredN;

  return (
    <Section title="power.planning" icon="⚡">
      <div className="space-y-4">
        <div className="terminal-panel p-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            Prospective power analysis — calculate required sample size before data collection.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Test type</Label>
              <Select value={testType} onValueChange={setTestType}>
                <SelectTrigger className="bg-background/50 font-mono text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="two_sample_t">two-sample t-test</SelectItem>
                  <SelectItem value="one_sample_t">one-sample t-test</SelectItem>
                  <SelectItem value="anova">ANOVA</SelectItem>
                  <SelectItem value="correlation">correlation</SelectItem>
                  <SelectItem value="chi_square">chi-square</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {testType === "anova" && (
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Number of groups</Label>
                <Input
                  value={nGroups}
                  onChange={e => setNGroups(e.target.value)}
                  className="bg-background/50 font-mono text-xs"
                  type="number" min="2"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {([
              ["Effect size (d)", effectSize, setEffectSize],
              ["α (significance)", alpha,      setAlpha],
              ["Target power",    power,       setPower],
            ] as const).map(([label, val, set]) => (
              <div key={label} className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
                <Input
                  value={val}
                  onChange={e => set(e.target.value)}
                  className="bg-background/50 font-mono text-xs"
                  type="number" step="0.01"
                />
              </div>
            ))}
          </div>

          {/* quick presets */}
          <div className="flex gap-2">
            {EFFECT_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setEffectSize(p.d)}
                className={`flex-1 terminal-panel px-2 py-1.5 text-[10px] transition-colors hover:text-primary hover:border-primary/40 ${
                  effectSize === p.d ? "border-primary/60 text-primary" : "text-muted-foreground"
                }`}
              >
                {p.label} · {p.hint}
              </button>
            ))}
          </div>

          <Button onClick={run} disabled={loading} className="w-full">
            {loading
              ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />calculating…</>
              : <><BarChart3 className="h-3 w-3 mr-2" />calculate required sample size</>}
          </Button>
          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>

        {result && (
          <div className="space-y-4">
            {/* big numbers */}
            <div className="terminal-panel p-4 grid grid-cols-3 gap-4 text-center">
              {result.n_per_group != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">per group</div>
                  <div className="text-3xl font-mono font-bold text-primary">{result.n_per_group}</div>
                </div>
              )}
              {result.total_n != null && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">total N needed</div>
                  <div className="text-3xl font-mono font-bold text-accent">{result.total_n}</div>
                </div>
              )}
              {result.n_required != null && !result.total_n && (
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">N required</div>
                  <div className="text-3xl font-mono font-bold text-primary">{result.n_required}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">your dataset</div>
                <div className={`text-3xl font-mono font-bold ${adequatelyPowered ? "text-green-400" : "text-red-400"}`}>
                  {ds.rows.toLocaleString()}
                </div>
              </div>
            </div>

            {/* verdict */}
            <div className="terminal-panel p-3 text-xs space-y-1">
              <div className={`font-mono ${adequatelyPowered ? "text-green-400" : "text-red-400"}`}>
                {adequatelyPowered
                  ? `✓ Your dataset (n=${ds.rows}) is adequately powered for this analysis.`
                  : `✗ Your dataset (n=${ds.rows}) is underpowered. Need ~${requiredN} total.`}
              </div>
              <div className="text-muted-foreground">{result.recommendation}</div>
            </div>

            {/* power curve */}
            {powerCurveData.length > 0 && (
              <div className="terminal-panel p-3">
                <div className="text-[10px] text-muted-foreground uppercase mb-3">
                  Power curve — d = {effectSize}, α = {alpha}
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={powerCurveData} margin={{ top: 5, right: 20, left: 0, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="n"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      label={{ value: "N per group", position: "insideBottom", offset: -8, fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip
                      formatter={(v) => [`${v}%`, "power"]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                    />
                    <Line
                      type="monotone" dataKey="power"
                      stroke="hsl(var(--primary))" strokeWidth={2} dot={false}
                    />
                    {/* 80% reference line */}
                    <Line
                      type="monotone" dataKey={() => 80}
                      stroke="hsl(var(--muted-foreground))" strokeWidth={1}
                      strokeDasharray="4 4" dot={false} name="80% threshold"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}