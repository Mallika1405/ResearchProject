import { useEffect, useState } from "react";
import { api, AuditEntry } from "@/lib/nexus-api";
import { Terminal } from "lucide-react";

export const AuditLog = ({ refreshKey }: { refreshKey: number }) => {
  const [log, setLog] = useState<AuditEntry[]>([]);

  useEffect(() => {
    api.auditLog(30).then((r) => setLog(r.log)).catch(() => {});
  }, [refreshKey]);

  return (
    <div className="terminal-panel">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-2 text-xs uppercase">
        <Terminal className="h-3 w-3 text-primary" />
        <span>audit stream</span>
        <span className="ml-auto text-muted-foreground">{log.length} events</span>
      </div>
      <div className="max-h-64 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
        {log.length === 0 && <div className="text-muted-foreground">// no events yet</div>}
        {log
          .slice()
          .reverse()
          .map((e, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="text-accent">[{e.agent}]</span>
              <span className="text-foreground">{e.action}</span>
              {e.detail && <span className="text-muted-foreground">— {e.detail}</span>}
            </div>
          ))}
      </div>
    </div>
  );
};
