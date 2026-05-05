import { useState } from "react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Loader2, Lightbulb, Download } from "lucide-react";
import { toast } from "sonner";

export const ReportPanel = ({ ds, findings }: { ds: UploadResponse; findings: any }) => {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState<"report" | "tests" | null>(null);
  const [report, setReport] = useState("");
  const [suggestions, setSuggestions] = useState("");

  const gen = async () => {
    setBusy("report");
    try {
      const r = await api.generateReport({
        dataset_id: ds.dataset_id,
        goal,
        findings_json: findings ? JSON.stringify(findings).slice(0, 5000) : "",
      });
      setReport(r.report);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const sug = async () => {
    setBusy("tests");
    try {
      const r = await api.suggestTests({ dataset_id: ds.dataset_id, goal });
      setSuggestions(r.suggestions);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ds.filename.replace(/\.csv$/, "")}_report.md`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="terminal-panel flex flex-col gap-3 p-4 md:flex-row">
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="research goal..."
          className="flex-1 font-mono"
        />
        <Button onClick={sug} disabled={busy !== null} variant="outline" className="border-accent/40 text-accent">
          {busy === "tests" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-2 h-4 w-4" />}
          suggest tests
        </Button>
        <Button onClick={gen} disabled={busy !== null} className="bg-primary text-primary-foreground">
          {busy === "report" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          generate report
        </Button>
      </div>

      {suggestions && (
        <div className="terminal-panel">
          <div className="border-b border-border bg-secondary/40 px-4 py-2 text-xs uppercase text-accent">
            // recommended tests
          </div>
          <div className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {suggestions}
          </div>
        </div>
      )}

      {report && (
        <div className="terminal-panel">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2">
            <span className="text-xs uppercase text-primary">// publication report</span>
            <Button size="sm" variant="ghost" onClick={download}>
              <Download className="mr-1 h-3 w-3" /> .md
            </Button>
          </div>
          <div className="max-h-[600px] overflow-auto whitespace-pre-wrap p-6 font-mono text-xs leading-relaxed">
            {report}
          </div>
        </div>
      )}
    </div>
  );
};
