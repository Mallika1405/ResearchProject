import { useRef, useState } from "react";
import { Loader2, CheckCircle2, XCircle, File, FileUp } from "lucide-react";
import { api, UploadResponse } from "@/lib/nexus-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  onUploaded: (r: UploadResponse) => void;
  /** If true, waits for ALL files to finish before calling onUploaded.
   *  Calls onUploaded once per file after the full batch completes.
   *  Default: false (calls onUploaded immediately after each file). */
  batchMode?: boolean;
}

interface FileStatus {
  file: File;
  state: "pending" | "uploading" | "done" | "error";
  result?: UploadResponse;
  error?: string;
}

const ACCEPTED = ".csv,.tsv,.xlsx,.xls,.parquet";
const ACCEPTED_SET = new Set(["csv", "tsv", "xlsx", "xls", "parquet"]);
const ext = (f: File) => f.name.split(".").pop()?.toLowerCase() ?? "";

export const UploadPanel = ({ onUploaded, batchMode = true }: Props) => {
  const inputRef                  = useRef<HTMLInputElement>(null);
  const [drag, setDrag]           = useState(false);
  const [queue, setQueue]         = useState<FileStatus[]>([]);
  const [running, setRunning]     = useState(false);

  const setItemState = (file: File, patch: Partial<FileStatus>) =>
    setQueue(prev => prev.map(q => q.file === file ? { ...q, ...patch } : q));

  const enqueue = (files: File[]) => {
    const valid   = files.filter(f => ACCEPTED_SET.has(ext(f)));
    const invalid = files.filter(f => !ACCEPTED_SET.has(ext(f)));
    if (invalid.length) toast.error(`Skipped unsupported: ${invalid.map(f => f.name).join(", ")}`);
    if (!valid.length) return;
    const newItems: FileStatus[] = valid.map(f => ({ file: f, state: "pending" }));
    setQueue(prev => {
      const merged = [...prev, ...newItems];
      // kick off after state update
      setTimeout(() => startQueue(merged), 0);
      return merged;
    });
  };

  const startQueue = async (items: FileStatus[]) => {
    if (running) return;
    setRunning(true);
    const completed: UploadResponse[] = [];

    for (const item of items) {
      if (item.state !== "pending") continue;
      setItemState(item.file, { state: "uploading" });
      try {
        const res = await api.upload(item.file);
        setItemState(item.file, { state: "done", result: res });
        toast.success(`✓ ${res.filename} — ${res.rows.toLocaleString()} × ${res.columns}`);
        completed.push(res);
        if (!batchMode) onUploaded(res);
      } catch (e: any) {
        const msg = e.message || "upload failed";
        setItemState(item.file, { state: "error", error: msg });
        toast.error(`✗ ${item.file.name}: ${msg}`);
      }
    }

    setRunning(false);

    // In batch mode, notify parent once for each completed file
    // after the whole batch is done — so navigation only happens after all uploads
    if (batchMode) {
      completed.forEach(r => onUploaded(r));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    enqueue(Array.from(e.dataTransfer.files));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) { enqueue(Array.from(e.target.files)); e.target.value = ""; }
  };

  const pending = queue.filter(q => q.state === "pending").length;
  const done    = queue.filter(q => q.state === "done").length;
  const errors  = queue.filter(q => q.state === "error").length;
  const hasQueue = queue.length > 0;

  return (
    <div className="space-y-2">
      {/* drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3 p-8
          border-2 border-dashed rounded-xl cursor-pointer transition-all
          ${drag
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/40 bg-secondary/20"
          }
        `}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handleChange} />
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${drag ? "bg-primary/15" : "bg-secondary"}`}>
          {running
            ? <Loader2 className="h-5 w-5 text-primary animate-spin" />
            : <FileUp className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="text-center pointer-events-none">
          <div className="text-sm font-medium text-foreground">
            {drag ? "Drop to upload" : "Drop files or click to browse"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            CSV · TSV · XLSX · Parquet — multiple files supported
          </div>
        </div>
      </div>

      {/* queue */}
      {hasQueue && (
        <div className="nx-card divide-y divide-border overflow-hidden">
          {/* summary row */}
          {queue.length > 1 && (
            <div className="px-3 py-2 bg-secondary/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{queue.length} files</span>
              <div className="flex items-center gap-3 text-xs">
                {running && <span className="text-primary flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />uploading…</span>}
                {done > 0 && <span className="text-green-600">{done} done</span>}
                {errors > 0 && <span className="text-destructive">{errors} failed</span>}
                {pending > 0 && !running && <span className="text-muted-foreground">{pending} queued</span>}
              </div>
            </div>
          )}

          {queue.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
              {/* state icon */}
              {item.state === "uploading" && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />}
              {item.state === "done"      && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
              {item.state === "error"     && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
              {item.state === "pending"   && <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

              {/* name */}
              <span className={`text-xs font-mono flex-1 truncate ${
                item.state === "done"      ? "text-foreground" :
                item.state === "error"     ? "text-destructive" :
                item.state === "uploading" ? "text-primary" :
                "text-muted-foreground"
              }`}>
                {item.file.name}
              </span>

              {/* right label */}
              <span className="text-xs shrink-0 text-right">
                {item.state === "done" && item.result &&
                  <span className="text-muted-foreground">{item.result.rows.toLocaleString()}r × {item.result.columns}c</span>}
                {item.state === "uploading" && <span className="text-primary">uploading…</span>}
                {item.state === "pending"   && <span className="text-muted-foreground">queued</span>}
                {item.state === "error"     && <span className="text-destructive">{item.error}</span>}
              </span>
            </div>
          ))}

          {/* add more */}
          <div className="px-3 py-2">
            <button onClick={() => inputRef.current?.click()} disabled={running}
              className="text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-40">
              + add more files
            </button>
          </div>
        </div>
      )}

      {/* batch hint */}
      {done >= 2 && !running && (
        <div className="flex items-center gap-2 text-xs p-2.5 bg-primary/5 border border-primary/20 rounded-lg text-primary">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {done} datasets uploaded — use Cohort Builder to merge them before analysis.
        </div>
      )}
    </div>
  );
};