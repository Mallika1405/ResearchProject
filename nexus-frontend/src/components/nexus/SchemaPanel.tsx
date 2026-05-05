import { UploadResponse } from "@/lib/nexus-api";
import { Database, Hash, Tag, Calendar, Type } from "lucide-react";

const typeIcon: Record<string, any> = {
  numeric: Hash,
  categorical: Tag,
  datetime: Calendar,
  text: Type,
};

const typeColor: Record<string, string> = {
  numeric: "text-primary",
  categorical: "text-accent",
  datetime: "text-info",
  text: "text-muted-foreground",
};

export const SchemaPanel = ({ ds }: { ds: UploadResponse }) => {
  return (
    <div className="terminal-panel">
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2">
        <div className="flex items-center gap-2 text-xs">
          <Database className="h-3 w-3 text-primary" />
          <span className="text-primary glow-text">DATASET</span>
          <span className="text-muted-foreground">/</span>
          <span>{ds.filename}</span>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>
            <span className="text-accent">{ds.rows.toLocaleString()}</span> rows
          </span>
          <span>
            <span className="text-accent">{ds.columns}</span> cols
          </span>
          <span className="hidden md:inline">
            fingerprint: <span className="text-primary">{ds.fingerprint}</span>
          </span>
        </div>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card/95 text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-normal">column</th>
              <th className="px-4 py-2 text-left font-normal">type</th>
              <th className="px-4 py-2 text-left font-normal">missing</th>
              <th className="px-4 py-2 text-left font-normal">summary</th>
            </tr>
          </thead>
          <tbody>
            {ds.schema.map((c) => {
              const Icon = typeIcon[c.type] || Type;
              const color = typeColor[c.type] || "text-muted-foreground";
              const summary =
                c.type === "numeric"
                  ? `μ=${c.stats.mean ?? "—"} σ=${c.stats.std ?? "—"} [${c.stats.min}, ${c.stats.max}]`
                  : c.type === "categorical"
                    ? `${c.stats.unique} unique · mode=${c.stats.mode}`
                    : "—";
              return (
                <tr key={c.name} className="border-b border-border/50 hover:bg-secondary/40">
                  <td className="px-4 py-1.5">{c.name}</td>
                  <td className={`px-4 py-1.5 ${color}`}>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-muted-foreground">
                    {c.stats.missing} ({c.stats.missing_pct}%)
                  </td>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground">{summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
