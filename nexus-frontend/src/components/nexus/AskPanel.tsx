import { useState } from "react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export const AskPanel = ({ ds }: { ds: UploadResponse }) => {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Msg[]>([]);

  const send = async () => {
    if (!q.trim()) return;
    const question = q;
    setQ("");
    setHistory((h) => [...h, { role: "user", text: question }]);
    setBusy(true);
    try {
      const r = await api.ask({ dataset_id: ds.dataset_id, question });
      setHistory((h) => [...h, { role: "assistant", text: r.answer }]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="terminal-panel flex h-[500px] flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-2 text-xs uppercase">
        <Sparkles className="h-3 w-3 text-accent" />
        <span>nexus.ai &mdash; ask anything about {ds.filename}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {history.length === 0 && (
          <div className="text-xs text-muted-foreground">
            <div className="text-primary">// suggestions</div>
            {[
              "what columns are most predictive?",
              "are there any concerning data quality issues?",
              "summarise this dataset in 3 sentences",
            ].map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="mt-1 block text-left text-muted-foreground hover:text-primary"
              >
                &gt; {s}
              </button>
            ))}
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className="text-xs">
            <div className={m.role === "user" ? "text-accent" : "text-primary"}>
              {m.role === "user" ? "user@nexus" : "gemini"} <span className="text-muted-foreground">$</span>
            </div>
            <div className="mt-1 whitespace-pre-wrap font-mono leading-relaxed text-foreground">{m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> processing<span className="blink-caret" />
          </div>
        )}
      </div>
      <div className="flex border-t border-border">
        <span className="flex items-center px-3 text-primary">$</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="type your question..."
          className="flex-1 bg-transparent py-3 font-mono text-xs outline-none placeholder:text-muted-foreground"
        />
        <Button onClick={send} disabled={busy} variant="ghost" className="rounded-none text-primary">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
