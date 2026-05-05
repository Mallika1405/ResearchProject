const KEY = "nexus_api_url";

export const getApiUrl = () =>
  (typeof window !== "undefined" && localStorage.getItem(KEY)) || "http://localhost:8000";

export const setApiUrl = (url: string) => localStorage.setItem(KEY, url);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // ── core ──────────────────────────────────────────────────────────────────
  health: () =>
    request<{ status: string; gemini_available: boolean; datasets_loaded: number; umap_available: boolean }>("/health"),

  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<UploadResponse>("/upload", { method: "POST", body: fd });
  },

  datasets: () => request<{ datasets: DatasetMeta[] }>("/datasets"),
  deleteDataset: (id: string) => request<{ deleted: string }>(`/datasets/${id}`, { method: "DELETE" }),
  auditLog: (limit = 50) =>
    request<{ log: AuditEntry[]; total: number }>(`/audit-log?limit=${limit}`),

  // ── analysis ──────────────────────────────────────────────────────────────
  analyze: (body: { dataset_id: string; goal?: string; kmeans_k?: number; run_pca?: boolean; run_rf?: boolean; run_clustering?: boolean }) =>
    request<any>("/analyze", { method: "POST", body: JSON.stringify(body) }),

  ask: (body: { dataset_id: string; question: string }) =>
    request<{ answer: string; question: string }>("/ask", { method: "POST", body: JSON.stringify(body) }),

  generateReport: (body: { dataset_id: string; goal?: string; findings_json?: string }) =>
    request<{ report: string }>("/generate-report", { method: "POST", body: JSON.stringify(body) }),

  suggestTests: (body: { dataset_id: string; goal?: string }) =>
    request<{ suggestions: string; data_structure: DataStructure }>("/suggest-tests", { method: "POST", body: JSON.stringify(body) }),

  explainInsight: (body: { insight_title: string; insight_summary: string; audience: string }) =>
    request<{ explanation: string; audience: string }>("/explain-insight", { method: "POST", body: JSON.stringify(body) }),

  forecast: (body: { dataset_id: string; date_column: string; value_column: string; periods: number }) =>
    request<any>("/forecast", { method: "POST", body: JSON.stringify(body) }),

  pca: (body: { dataset_id: string; n_components: number }) =>
    request<any>("/pca", { method: "POST", body: JSON.stringify(body) }),

  anova: (body: { dataset_id: string; group_column: string; value_column: string }) =>
    request<any>("/anova", { method: "POST", body: JSON.stringify(body) }),

  chiSquare: (body: { dataset_id: string; column_a: string; column_b: string }) =>
    request<any>("/chi-square", { method: "POST", body: JSON.stringify(body) }),

  compareDatasets: (body: { dataset_id_a: string; dataset_id_b: string; column: string }) =>
    request<any>("/compare-datasets", { method: "POST", body: JSON.stringify(body) }),

  powerAnalysis: (body: { dataset_id: string; group_column: string; value_column: string; alpha?: number }) =>
    request<any>("/power-analysis", { method: "POST", body: JSON.stringify(body) }),

  // ── NEW v3 endpoints ──────────────────────────────────────────────────────
  studyDesign: (body: { dataset_id: string; research_question: string; outcome_variable?: string; exposure_variable?: string }) =>
    request<StudyDesignResponse>("/study-design", { method: "POST", body: JSON.stringify(body) }),

  hypotheses: (body: { dataset_id: string; research_question: string; domain?: string }) =>
    request<HypothesesResponse>("/hypotheses", { method: "POST", body: JSON.stringify(body) }),

  lmm: (body: { dataset_id: string; outcome: string; fixed_effects: string[]; random_effects: string[]; interaction_terms?: string[]; family?: string }) =>
    request<any>("/lmm", { method: "POST", body: JSON.stringify(body) }),

  survival: (body: { dataset_id: string; duration_col: string; event_col: string; group_col?: string; covariates?: string[] }) =>
    request<any>("/survival", { method: "POST", body: JSON.stringify(body) }),

  causalInference: (body: { dataset_id: string; outcome: string; treatment: string; covariates?: string[]; method?: string }) =>
    request<any>("/causal-inference", { method: "POST", body: JSON.stringify(body) }),

  mediation: (body: { dataset_id: string; outcome: string; mediator: string; exposure: string; covariates?: string[] }) =>
    request<any>("/mediation", { method: "POST", body: JSON.stringify(body) }),

  cohortBuilder: (body: { dataset_ids: string[]; join_keys?: Record<string, string>; aggregations?: Record<string, string> }) =>
    request<CohortResponse>("/cohort-builder", { method: "POST", body: JSON.stringify(body) }),

  analyzeJoinStrategy: (body: { dataset_ids: string[] }) =>
    request<any>("/analyze-join-strategy", { method: "POST", body: JSON.stringify(body) }),

  metaAnalysis: (body: { dataset_ids: string[]; outcome_col: string; method?: string }) =>
    request<any>("/meta-analysis", { method: "POST", body: JSON.stringify(body) }),

  sensitivityAnalysis: (body: { dataset_id: string; outcome: string; predictors: string[] }) =>
    request<any>("/sensitivity-analysis", { method: "POST", body: JSON.stringify(body) }),

  peerReview: (body: { dataset_id: string; analysis_json: string; claimed_conclusions: string }) =>
    request<{ peer_review_critique: string; claimed_conclusions: string }>("/peer-review", { method: "POST", body: JSON.stringify(body) }),

  powerPlanning: (body: { effect_size: number; alpha?: number; power?: number; test_type?: string; n_groups?: number }) =>
    request<any>("/power-planning", { method: "POST", body: JSON.stringify(body) }),

  replicationCheck: (body: { analysis_json: string; target_dataset_id: string; outcome: string; predictors: string[] }) =>
    request<any>("/replication-check", { method: "POST", body: JSON.stringify(body) }),

  shapAnalysis: (body: { dataset_id: string; outcome: string; predictors?: string[] }) =>
    request<any>("/shap-analysis", { method: "POST", body: JSON.stringify(body) }),

  networkAnalysis: (body: { dataset_id: string; source_col: string; target_col: string; weight_col?: string }) =>
    request<any>("/network-analysis", { method: "POST", body: JSON.stringify(body) }),

  umap: (body: { dataset_id: string; n_components?: number; n_neighbors?: number }) =>
    request<any>("/umap", { method: "POST", body: JSON.stringify(body) }),

  // workspaces
  createWorkspace: (body: { name: string; description?: string }) =>
    request<{ workspace_id: string; name: string }>("/workspaces", { method: "POST", body: JSON.stringify(body) }),
  listWorkspaces: () => request<{ workspaces: any[] }>("/workspaces"),
  getWorkspace: (id: string) => request<any>(`/workspaces/${id}`),
  addDatasetToWorkspace: (body: { workspace_id: string; dataset_id: string }) =>
    request<any>("/workspaces/add-dataset", { method: "POST", body: JSON.stringify(body) }),

  getHypotheses: (dataset_id: string) =>
    request<HypothesesResponse>(`/hypotheses/${dataset_id}`),
  getStudyPlan: (plan_id: string) =>
    request<StudyDesignResponse>(`/study-plans/${plan_id}`),
  suggestQuestions: (body: { dataset_ids: string[] }) =>
    request<any>("/suggest-questions", { method: "POST", body: JSON.stringify(body) }),

  quickExplore: (body: { dataset_id: string; question_type: string; outcome_col?: string | null; group_col?: string | null; predictor_col?: string | null }) =>
    request<any>("/quick-explore", { method: "POST", body: JSON.stringify(body) }),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface UploadResponse {
  dataset_id: string;
  filename: string;
  rows: number;
  columns: number;
  numeric_columns: string[];
  categorical_columns: string[];
  datetime_columns: string[];
  schema: ColumnSchema[];
  fingerprint: string;
  data_structure: DataStructure;
  model_recommendation: string;
  missing_summary: Record<string, number>;
}

export interface ColumnSchema {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "text" | "unknown";
  stats: Record<string, any>;
}

export interface DataStructure {
  n_rows: number;
  n_cols: number;
  numeric_cols: string[];
  categorical_cols: string[];
  datetime_cols: string[];
  id_cols: string[];
  time_cols: string[];
  has_repeated_measures: boolean;
  avg_obs_per_subject: number | null;
  hierarchy_variable: string | null;
  has_datetime: boolean;
  missingness_pct: number;
  recommended_model_family: string;
}

export interface DatasetMeta {
  dataset_id: string;
  filename: string;
  rows: number;
  columns: number;
  uploaded_at: string;
  fingerprint: string;
  model_recommendation: string;
}

export interface AuditEntry {
  ts: string;
  agent: string;
  action: string;
  detail: string;
  status: string;
}

export interface StudyDesign {
  name: string;
  design_type: string;
  model: string;
  formula: string;
  assumptions: string[];
  limitations: string[];
  causal_inference_possible: boolean;
  strength: "weak" | "moderate" | "strong";
  implementation_steps: string[];
}

export interface StudyDesignResponse {
  plan_id: string;
  research_question: string;
  data_structure: DataStructure;
  study_designs: StudyDesign[];
  recommendation: string;
}

export interface Hypothesis {
  h_number: string;
  null_hypothesis: string;
  alternative_hypothesis: string;
  direction: string;
  outcome_variable: string;
  predictor_variable: string;
  covariates: string[];
  appropriate_test: string;
  effect_size_measure: string;
  sample_size_adequate: boolean;
  priority: "primary" | "secondary" | "exploratory";
}

export interface HypothesesResponse {
  dataset_id: string;
  research_question: string;
  hypotheses: Hypothesis[];
  n_hypotheses: number;
}

export interface CohortResponse {
  cohort_dataset_id: string;
  source_datasets: string[];
  join_key_used: Record<string, string>;
  n_rows: number;
  n_columns: number;
  columns: string[];
  schema: ColumnSchema[];
  data_structure: DataStructure;
  warnings: string[];
  missing_after_merge: Record<string, number>;
  next_step: string;
}