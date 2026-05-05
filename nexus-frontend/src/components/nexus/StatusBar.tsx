import { useEffect, useState } from "react";
import { api, getApiUrl, setApiUrl } from "@/lib/nexus-api";
import { Activity, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const StatusBar = () => {
  const [status, setStatus] = useState<"online" | "offline" | "checking">("checking");
  const [gemini, setGemini] = useState(false);
  const [count, setCount] = useState(0);
  const [url, setUrl] = useState(getApiUrl());

  const ping = async () => {
    try {
      const h = await api.health();
      setStatus("online");
      setGemini(h.gemini_available);
      setCount(h.datasets_loaded);
    } catch {
      setStatus("offline");
    }
  };

  useEffect(() => {
    ping();
    const i = setInterval(ping, 8000);
    return () => clearInterval(i);
  }, []);

  const dot =
    status === "online" ? "bg-primary pulse-dot" : status === "offline" ? "bg-destructive" : "bg-warning";

  return (
    <div className="flex items-center gap-4 border-b border-border bg-card/40 px-6 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Activity className="h-3 w-3 text-primary" />
        <span className="text-muted-foreground">NEXUS</span>
        <span className="text-primary glow-text">v2.0.0</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="uppercase tracking-wider">
          {status === "online" ? "backend connected" : status === "offline" ? "backend offline" : "..."}
        </span>
      </div>
      <div className="text-muted-foreground">
        gemini: <span className={gemini ? "text-primary" : "text-destructive"}>{gemini ? "ready" : "unavailable"}</span>
      </div>
      <div className="text-muted-foreground">
        datasets: <span className="text-accent">{count}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-muted-foreground hidden md:inline">{getApiUrl()}</span>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
              <Settings2 className="h-3 w-3" /> endpoint
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card font-mono">
            <DialogHeader>
              <DialogTitle className="text-primary glow-text">// configure backend</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label className="text-xs uppercase text-muted-foreground">api base url</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono" />
              <Button
                onClick={() => {
                  setApiUrl(url);
                  ping();
                }}
                className="w-full"
              >
                save & reconnect
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
