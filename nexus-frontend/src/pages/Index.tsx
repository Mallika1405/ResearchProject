import { useState, useEffect, useRef } from "react";
import { api, UploadResponse, DatasetMeta } from "@/lib/nexus-api";
import { StatusBar } from "@/components/nexus/StatusBar";
import { UploadPanel } from "@/components/nexus/UploadPanel";
import { SchemaPanel } from "@/components/nexus/SchemaPanel";
import { AnalysisPanel } from "@/components/nexus/AnalysisPanel";
import { AskPanel } from "@/components/nexus/AskPanel";
import { ReportPanel } from "@/components/nexus/ReportPanel";
import { AuditLog } from "@/components/nexus/AuditLog";
import { StudyDesignPanel } from "@/components/nexus/StudyDesignPanel";
import { HypothesisPanel } from "@/components/nexus/HypothesisPanel";
import { AdvancedModelsPanel } from "@/components/nexus/AdvancedModelsPanel";
import { CohortBuilderPanel } from "@/components/nexus/CohortBuilderPanel";
import { PeerReviewPanel } from "@/components/nexus/PeerReviewPanel";
import { PowerPlanningPanel } from "@/components/nexus/PowerPlanningPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FlaskConical, Plus, ChevronRight, Trash2, Database,
  BarChart3, Brain, GitMerge, Zap, MessageSquare,
  FileText, ScrollText, ArrowLeft, X, ChevronDown,
  TestTube, Search, Shield, Activity, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudyDataset {
  dataset_id: string;
  filename: string;
  rows: number;
  columns: number;
  model_recommendation: string;
  uploaded_at: string;
  full?: UploadResponse;
}

interface Study {
  id: string;
  name: string;
  description: string;
  created_at: string;
  datasets: StudyDataset[];
  last_opened: string | null;
}

type WorkspaceTab =
  | "overview" | "analyze" | "study-design" | "hypotheses"
  | "advanced" | "cohort" | "power" | "peer-review"
  | "ask" | "report" | "audit";

// ── Persistence ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "nexus_studies_v1";
const loadStudies = (): Study[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
};
const saveStudies = (s: Study[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
const cacheDs = (r: UploadResponse) => sessionStorage.setItem(`ds_${r.dataset_id}`, JSON.stringify(r));
const getCachedDs = (id: string): UploadResponse | null => {
  const s = sessionStorage.getItem(`ds_${id}`);
  return s ? JSON.parse(s) : null;
};

// ── Sidebar nav config ─────────────────────────────────────────────────────────

const NAV: { id: WorkspaceTab; label: string; icon: React.ElementType; group: string }[] = [
  { id: "overview",     label: "Overview",       icon: Activity,       group: "dataset" },
  { id: "analyze",      label: "Full Analysis",  icon: BarChart3,      group: "analysis" },
  { id: "study-design", label: "Study Design",   icon: FlaskConical,   group: "analysis" },
  { id: "hypotheses",   label: "Hypotheses",     icon: TestTube,       group: "analysis" },
  { id: "advanced",     label: "Advanced Models",icon: Brain,          group: "analysis" },
  { id: "cohort",       label: "Cohort Builder", icon: GitMerge,       group: "analysis" },
  { id: "power",        label: "Power Planning", icon: Zap,            group: "analysis" },
  { id: "peer-review",  label: "Peer Review",    icon: Shield,         group: "review" },
  { id: "ask",          label: "Ask AI",         icon: MessageSquare,  group: "review" },
  { id: "report",       label: "Generate Report",icon: FileText,       group: "review" },
  { id: "audit",        label: "Audit Log",      icon: ScrollText,     group: "meta" },
];

// ── Create Study Modal ─────────────────────────────────────────────────────────

function CreateStudyModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (s: Study) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onCreate({
      id: crypto.randomUUID(), name: name.trim(), description: desc.trim(),
      created_at: new Date().toISOString(), datasets: [], last_opened: null,
    });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-md mx-4 p-6 space-y-5 animate-slide-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FlaskConical className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground">New study</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded-md p-1 hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="nx-label">Study name *</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="e.g. Terasaki BAL Proteomics 2025"
              className="nx-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="nx-label">Description <span className="text-muted-foreground normal-case font-normal tracking-normal">(optional)</span></Label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Brief description of your research question or study context…"
              className="nx-input h-20 resize-none" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={!name.trim()} className="flex-1">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Create study
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Study Landing ──────────────────────────────────────────────────────────────

function StudyLanding({ onOpen }: { onOpen: (study: Study, ds?: UploadResponse) => void }) {
  const [studies, setStudies]       = useState<Study[]>(loadStudies);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const save = (updated: Study[]) => { saveStudies(updated); setStudies(updated); };

  // Track uploads per study so we only navigate after the LAST file in a batch
  const pendingUploads = useRef<Record<string, UploadResponse[]>>({});

  const onUploaded = (studyId: string, r: UploadResponse) => {
    cacheDs(r);
    const ds: StudyDataset = {
      dataset_id: r.dataset_id, filename: r.filename, rows: r.rows,
      columns: r.columns, model_recommendation: r.model_recommendation,
      uploaded_at: new Date().toISOString(), full: r,
    };
    // Add dataset to study
    setStudies(prev => {
      const updated = prev.map(s => s.id === studyId ? { ...s, datasets: [...s.datasets, ds] } : s);
      saveStudies(updated);
      return updated;
    });
    // Collect into batch — navigate to the LAST uploaded dataset
    if (!pendingUploads.current[studyId]) pendingUploads.current[studyId] = [];
    pendingUploads.current[studyId].push(r);
    // Use a small timeout: if no more uploads arrive in 300ms, navigate
    clearTimeout((pendingUploads.current as any)[`${studyId}_timer`]);
    (pendingUploads.current as any)[`${studyId}_timer`] = setTimeout(() => {
      const batch = pendingUploads.current[studyId] ?? [];
      const last = batch[batch.length - 1];
      pendingUploads.current[studyId] = [];
      if (last) {
        setStudies(prev => {
          const study = prev.find(s => s.id === studyId);
          if (study) onOpen(study, last);
          return prev;
        });
      }
    }, 400);
  };

  const openDataset = (study: Study, ds: StudyDataset) => {
    const updated = studies.map(s => s.id === study.id ? { ...s, last_opened: new Date().toISOString() } : s);
    save(updated);
    const full = ds.full ?? getCachedDs(ds.dataset_id) ?? undefined;
    onOpen(updated.find(s => s.id === study.id)!, full);
  };

  const removeDs = (studyId: string, dsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    save(studies.map(s => s.id === studyId ? { ...s, datasets: s.datasets.filter(d => d.dataset_id !== dsId) } : s));
  };

  const deleteStudy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this study? This cannot be undone.")) return;
    save(studies.filter(s => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {showCreate && <CreateStudyModal onClose={() => setShowCreate(false)} onCreate={s => { save([s, ...studies]); setExpandedId(s.id); }} />}

      {/* top bar */}
      <div className="border-b border-border bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <FlaskConical className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-foreground text-sm">Nexus Research</span>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" />New study
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* hero */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Your studies</h1>
          <p className="text-muted-foreground text-sm">Organize datasets, run analyses, and generate publication-ready results.</p>
        </div>

        {/* empty */}
        {studies.length === 0 && (
          <div className="nx-card p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <FlaskConical className="h-6 w-6 text-primary" />
            </div>
            <div className="text-sm font-medium text-foreground">No studies yet</div>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Create a study to organize your datasets and track your analyses in one place.
            </p>
            <Button onClick={() => setShowCreate(true)} variant="outline" size="sm" className="mt-2">
              <Plus className="h-3 w-3 mr-1.5" />Create your first study
            </Button>
          </div>
        )}

        {/* study cards */}
        <div className="space-y-3">
          {studies.map(study => (
            <div key={study.id} className="nx-card overflow-hidden">
              {/* card header */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${study.datasets.length > 0 ? "bg-primary" : "bg-border"}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground">{study.name}</div>
                  {study.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{study.description}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {study.datasets.length} dataset{study.datasets.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(study.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Open study button — goes to first dataset or prompts to add one */}
                  {study.datasets.length > 0 ? (
                    <button
                      onClick={e => { e.stopPropagation(); openDataset(study, study.datasets[0]); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      Open lab →
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setExpandedId(study.id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      Add dataset
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === study.id ? null : study.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expandedId === study.id ? "rotate-180" : ""}`} />
                  </button>
                  <button onClick={e => deleteStudy(study.id, e)}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/5 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* expanded body */}
              {expandedId === study.id && (
                <div className="border-t border-border animate-slide-up">
                  {/* datasets */}
                  {study.datasets.length > 0 && (
                    <div className="divide-y divide-border/60">
                      {study.datasets.map(ds => (
                        <div key={ds.dataset_id} onClick={() => openDataset(study, ds)}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/40 cursor-pointer transition-colors group">
                          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Database className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-foreground truncate font-mono text-xs">{ds.filename}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {ds.rows.toLocaleString()} rows · {ds.columns} cols ·{" "}
                              <span className="text-primary font-medium">{ds.model_recommendation}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
                            <button onClick={e => removeDs(study.id, ds.dataset_id, e)}
                              className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors opacity-0 group-hover:opacity-100">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* upload zone */}
                  <div className="p-5 bg-secondary/20 space-y-2">
                    <div className="nx-label">Add dataset to this study</div>
                    <UploadPanel onUploaded={r => onUploaded(study.id, r)} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Dataset Overview card ──────────────────────────────────────────────────────

function DatasetOverview({ ds, study }: { ds: UploadResponse; study: Study }) {
  const struct = ds.data_structure;
  const stats = [
    { label: "Rows",       value: ds.rows.toLocaleString() },
    { label: "Columns",    value: ds.columns },
    { label: "Numeric",    value: ds.numeric_columns.length },
    { label: "Categorical",value: ds.categorical_columns.length },
    { label: "Missing",    value: `${struct?.missingness_pct ?? 0}%` },
    { label: "Model",      value: struct?.recommended_model_family ?? "—" },
  ];
  return (
    <div className="space-y-5 animate-slide-up">
      <div className="nx-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-foreground">{ds.filename}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{study.name}</p>
          </div>
          {struct?.recommended_model_family && (
            <span className="nx-badge-primary">{struct.recommended_model_family}</span>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {stats.map(s => (
            <div key={s.label} className="nx-stat">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</span>
              <span className="text-sm font-semibold text-foreground font-mono">{s.value}</span>
            </div>
          ))}
        </div>
        {struct?.has_repeated_measures && (
          <div className="flex items-center gap-2 text-xs p-3 bg-amber-50 text-amber-800 rounded-lg border border-amber-100">
            <Activity className="h-3.5 w-3.5 shrink-0" />
            Repeated measures detected (avg {struct.avg_obs_per_subject} obs/subject) — LMM recommended over OLS
          </div>
        )}
        {struct?.hierarchy_variable && (
          <div className="flex items-center gap-2 text-xs p-3 bg-blue-50 text-blue-800 rounded-lg border border-blue-100">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            Hierarchical variable detected: <span className="font-mono font-medium">{struct.hierarchy_variable}</span> — consider multilevel model
          </div>
        )}
      </div>
      <SchemaPanel ds={ds} />
    </div>
  );
}

// ── Workspace (sidebar + content) ─────────────────────────────────────────────

function Workspace({ study, ds, onBack, onSwitchDs }: {
  study: Study;
  ds: UploadResponse;
  onBack: () => void;
  onSwitchDs: (ds: UploadResponse) => void;
}) {
  const [tab, setTab]         = useState<WorkspaceTab>("overview");
  const [results, setResults] = useState<any>(null);
  const [refresh, setRefresh] = useState(0);
  const onResults = (r: any) => { setResults(r); setRefresh(x => x + 1); };

  const groups = [
    { id: "dataset",   label: "Dataset" },
    { id: "analysis",  label: "Analysis" },
    { id: "review",    label: "Review & Output" },
    { id: "meta",      label: "System" },
  ];

  const CONTENT: Record<WorkspaceTab, React.ReactNode> = {
    overview:      <DatasetOverview ds={ds} study={study} />,
    analyze:       <AnalysisPanel ds={ds} onResults={onResults} results={results} />,
    "study-design": <StudyDesignPanel ds={ds} />,
    hypotheses:    <HypothesisPanel ds={ds} />,
    advanced:      <AdvancedModelsPanel ds={ds} />,
    cohort:        <CohortBuilderPanel currentDs={ds} studyDatasets={study.datasets} onCohortBuilt={onSwitchDs} />,
    power:         <PowerPlanningPanel ds={ds} />,
    "peer-review": <PeerReviewPanel ds={ds} results={results} />,
    ask:           <AskPanel ds={ds} />,
    report:        <ReportPanel ds={ds} findings={results} />,
    audit:         <AuditLog refreshKey={refresh} />,
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 flex flex-col bg-sidebar-background border-r border-sidebar-border">
        {/* logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <FlaskConical className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-sidebar-accent-foreground">Nexus</span>
        </div>

        {/* back + breadcrumb */}
        <div className="px-3 py-3 border-b border-sidebar-border space-y-0.5">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-sidebar-muted hover:text-sidebar-accent-foreground transition-colors w-full px-2 py-1 rounded hover:bg-sidebar-accent">
            <ArrowLeft className="h-3 w-3" />Studies
          </button>
          <div className="px-2 py-1">
            <div className="text-xs font-medium text-sidebar-accent-foreground truncate">{study.name}</div>
            <div className="text-[10px] text-sidebar-muted truncate font-mono mt-0.5">{ds.filename}</div>
          </div>
          {/* other datasets in study */}
          {study.datasets.length > 1 && (
            <div className="px-2 pt-1 space-y-0.5">
              <div className="text-[10px] text-sidebar-muted uppercase tracking-wider">Switch dataset</div>
              {study.datasets.filter(d => d.dataset_id !== ds.dataset_id).map(d => (
                <button key={d.dataset_id}
                  onClick={() => { const full = d.full ?? getCachedDs(d.dataset_id); if (full) onSwitchDs(full); }}
                  className="w-full text-left text-[10px] font-mono text-sidebar-muted hover:text-sidebar-accent-foreground px-2 py-1 rounded hover:bg-sidebar-accent transition-colors truncate block">
                  {d.filename}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {groups.map(g => {
            const items = NAV.filter(n => n.group === g.id);
            return (
              <div key={g.id} className="space-y-0.5">
                <div className="px-2 pb-1 text-[10px] uppercase tracking-widest font-semibold text-sidebar-muted">{g.label}</div>
                {items.map(item => (
                  <button key={item.id} onClick={() => setTab(item.id)}
                    className={`nx-nav-item w-full ${tab === item.id ? "active" : ""}`}>
                    <item.icon className="nx-nav-icon" />
                    <span className="truncate">{item.label}</span>
                    {item.id === "analyze" && results && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        {/* topbar */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-border h-14 flex items-center px-6 gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            {NAV.find(n => n.id === tab)?.label ?? "Overview"}
          </h2>
          {results && tab !== "analyze" && (
            <button onClick={() => setTab("analyze")}
              className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />View analysis results
            </button>
          )}
        </div>

        <div className="p-6 max-w-5xl">
          {CONTENT[tab]}
        </div>
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

const Index = () => {
  const [activeStudy, setActiveStudy] = useState<Study | null>(null);
  const [activeDs,    setActiveDs]    = useState<UploadResponse | null>(null);

  const openStudy = (study: Study, ds?: UploadResponse) => {
    setActiveStudy(study);
    setActiveDs(ds ?? null);
  };

  if (activeStudy && activeDs) {
    return (
      <Workspace
        study={activeStudy}
        ds={activeDs}
        onBack={() => { setActiveStudy(null); setActiveDs(null); }}
        onSwitchDs={setActiveDs}
      />
    );
  }

  return <StudyLanding onOpen={openStudy} />;
};

export default Index;