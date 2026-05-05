import { useState } from "react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Section } from "./Section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Props {
  ds: UploadResponse;
  results: any;
}

export function PeerReviewPanel({ ds, results }: Props) {
  const [conclusions, setConclusions] = useState("");
  const [loading, setLoading]         = useState(false);
  const [critique, setCritique]       = useState("");
  const [error, setError]             = useState("");

  const run = async () => {
    if (!conclusions.trim()) return;
    setLoading(true); setError(""); setCritique("");
    try {
      const r = await api.peerReview({
        dataset_id: ds.dataset_id,
        analysis_json: results ? JSON.stringify(results).slice(0, 3000) : "{}",
        claimed_conclusions: conclusions,
      });
      setCritique(r.peer_review_critique);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section title="peer.reviewer" icon="🔍">
      <div className="space-y-4">
        <div className="terminal-panel p-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            Enter your claimed conclusions. The adversarial peer reviewer critiques your analysis like a hostile
            Reviewer 2 — checks assumptions, flags causal overclaims, identifies confounders and limitations.
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Your claimed conclusions *</Label>
            <textarea
              value={conclusions}
              onChange={e => setConclusions(e.target.value)}
              placeholder={
                "e.g. Drug X significantly reduces depression scores over 6 months (β = −4.2, p = 0.03). " +
                "This effect is causal because..."
              }
              className="w-full h-28 bg-background/50 border border-input rounded p-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {!results && (
            <div className="text-[10px] text-yellow-400">
              ⚠ Run an analysis first (Analyze tab) to give the reviewer your actual results.
            </div>
          )}

          <Button onClick={run} disabled={loading || !conclusions.trim()} className="w-full">
            {loading
              ? <><Loader2 className="h-3 w-3 animate-spin mr-2" />reviewing…</>
              : "submit for adversarial peer review"}
          </Button>
        </div>

        {error && <div className="text-xs text-red-400 terminal-panel p-3">{error}</div>}

        {critique && (
          <div className="terminal-panel p-4 space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <div className="text-xs font-mono text-red-400">REVIEWER 2 — Adversarial Critique</div>
            </div>
            <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{critique}</div>
            <div className="pt-2 text-[10px] text-muted-foreground border-t border-border">
              AI-generated critique to identify weaknesses before human peer review. Address all points before submission.
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}