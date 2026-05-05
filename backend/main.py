"""
╔══════════════════════════════════════════════════════════════════════════════╗
║              NEXUS RESEARCH ENGINE  v3.0  — Full Backend                    ║
║                                                                              ║
║  Install:                                                                    ║
║    pip install fastapi uvicorn pandas scipy scikit-learn statsmodels         ║
║        google-generativeai python-multipart aiofiles httpx python-dotenv    ║
║        pingouin lifelines pyarrow openpyxl networkx umap-learn shap         ║
║                                                                              ║
║  Run:                                                                        ║
║    GEMINI_API_KEY=your_key uvicorn main:app --reload --port 8000             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

# ─── stdlib ──────────────────────────────────────────────────────────────────
import io, os, math, hashlib, json, warnings, traceback, asyncio
from datetime import datetime, timezone
from typing import Any, Optional, List, Dict
from pathlib import Path

warnings.filterwarnings("ignore")

# ─── env ─────────────────────────────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()

# ─── data ────────────────────────────────────────────────────────────────────
import numpy as np
import pandas as pd
import networkx as nx

# ─── stats ───────────────────────────────────────────────────────────────────
from scipy import stats as scipy_stats
from scipy.stats import (
    chi2_contingency, f_oneway, shapiro, kstest,
    mannwhitneyu, kruskal, spearmanr, kendalltau,
    levene, bartlett, jarque_bera
)
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.multicomp import pairwise_tukeyhsd
from statsmodels.stats.stattools import durbin_watson
from statsmodels.tsa.stattools import adfuller, acf, pacf
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.arima.model import ARIMA
import pingouin as pg

# ─── survival ────────────────────────────────────────────────────────────────
from lifelines import KaplanMeierFitter, CoxPHFitter
from lifelines.statistics import logrank_test

# ─── ml ──────────────────────────────────────────────────────────────────────
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.decomposition import PCA, FactorAnalysis, NMF
from sklearn.ensemble import (
    RandomForestRegressor, RandomForestClassifier,
    GradientBoostingRegressor, IsolationForest
)
from sklearn.linear_model import (
    LinearRegression, LogisticRegression, Ridge, Lasso, ElasticNet
)
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import cross_val_score, KFold
from sklearn.metrics import (
    silhouette_score, calinski_harabasz_score,
    r2_score, mean_squared_error, roc_auc_score,
    confusion_matrix, classification_report
)
from sklearn.inspection import permutation_importance
import shap

# ─── umap ────────────────────────────────────────────────────────────────────
try:
    import umap
    _HAS_UMAP = True
except ImportError:
    _HAS_UMAP = False

# ─── web ─────────────────────────────────────────────────────────────────────
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─── Gemini ──────────────────────────────────────────────────────────────────
try:
    import google.generativeai as genai
    _API_KEY = os.environ.get("GEMINI_API_KEY", "")
    genai.configure(api_key=_API_KEY)
    _GEMINI = genai.GenerativeModel("gemini-2.5-flash")
    _HAS_GEMINI = bool(_API_KEY)
except ImportError:
    _HAS_GEMINI = False
    _GEMINI = None


async def gemini(prompt: str, fallback: str = "", system: str = "") -> str:
    if not _HAS_GEMINI or not _GEMINI:
        return fallback or "[Gemini unavailable — set GEMINI_API_KEY]"
    try:
        full = f"{system}\n\n{prompt}" if system else prompt
        resp = _GEMINI.generate_content(full)
        return resp.text.strip()
    except Exception as exc:
        return f"[Gemini error: {exc}]"


RESEARCH_SYSTEM = """You are a senior biostatistician and research scientist with expertise in
clinical trials, epidemiology, genomics, and machine learning. You produce rigorous,
publication-quality analysis. You are honest about limitations, never overclaim causality
from observational data, and always recommend appropriate methods for the data structure.
You know when to suggest mixed-effects models, survival analysis, causal inference methods,
and how to interpret effect sizes beyond p-values."""


# ══════════════════════════════════════════════════════════════════════════════
#  APP
# ══════════════════════════════════════════════════════════════════════════════

app = FastAPI(title="Nexus Research Engine", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════════════
#  STATE
# ══════════════════════════════════════════════════════════════════════════════

_DATASETS: Dict[str, Dict] = {}          # dataset_id → {df, name, schema, ...}
_WORKSPACES: Dict[str, Dict] = {}        # workspace_id → {datasets, analyses, ...}
_AUDIT: List[Dict] = []
_HYPOTHESES: Dict[str, List] = {}        # dataset_id → [hypothesis, ...]
_STUDY_PLANS: Dict[str, Dict] = {}       # plan_id → plan


def _log(agent: str, action: str, detail: str = "", status: str = "done"):
    _AUDIT.append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "agent": agent, "action": action,
        "detail": detail, "status": status,
    })


# ══════════════════════════════════════════════════════════════════════════════
#  PYDANTIC MODELS
# ══════════════════════════════════════════════════════════════════════════════

class AnalyzeRequest(BaseModel):
    dataset_id: str
    goal: Optional[str] = ""
    max_correlations: int = 10
    kmeans_k: int = 3
    outlier_zscore_threshold: float = 3.0
    run_pca: bool = True
    run_rf: bool = True
    run_clustering: bool = True
    run_regression: bool = True
    run_normality: bool = True
    run_isolation_forest: bool = True
    run_power_analysis: bool = True

class StudyDesignRequest(BaseModel):
    dataset_id: str
    research_question: str
    outcome_variable: Optional[str] = None
    exposure_variable: Optional[str] = None
    covariates: Optional[List[str]] = []
    study_type: Optional[str] = None  # observational|experimental|longitudinal

class HypothesisRequest(BaseModel):
    dataset_id: str
    research_question: str
    domain: Optional[str] = "biomedical"

class LMMRequest(BaseModel):
    dataset_id: str
    outcome: str
    fixed_effects: List[str]
    random_effects: List[str]   # e.g. ["subject_id"]
    interaction_terms: Optional[List[str]] = []
    family: str = "gaussian"    # gaussian|binomial|poisson|negativebinomial

class SurvivalRequest(BaseModel):
    dataset_id: str
    duration_col: str
    event_col: str
    group_col: Optional[str] = None
    covariates: Optional[List[str]] = []

class CausalRequest(BaseModel):
    dataset_id: str
    outcome: str
    treatment: str
    covariates: Optional[List[str]] = []
    method: str = "propensity_matching"  # propensity_matching|ipw|did|regression_adjustment

class MultiDatasetRequest(BaseModel):
    dataset_ids: List[str]
    outcome_col: str
    method: str = "fixed_effects"   # fixed_effects|random_effects

class CohortRequest(BaseModel):
    dataset_ids: List[str]
    join_keys: Optional[Dict[str, str]] = {}   # {dataset_id: key_col}
    unit_of_analysis: Optional[str] = None
    aggregations: Optional[Dict[str, str]] = {}  # {col: "mean"|"sum"|"last"|"first"|"count"}

class PowerPlanRequest(BaseModel):
    effect_size: float
    alpha: float = 0.05
    power: float = 0.80
    test_type: str = "two_sample_t"   # two_sample_t|one_sample_t|anova|chi_square|correlation
    n_groups: int = 2

class SensitivityRequest(BaseModel):
    dataset_id: str
    outcome: str
    predictors: List[str]
    base_model: str = "ols"

class MediationRequest(BaseModel):
    dataset_id: str
    outcome: str
    mediator: str
    exposure: str
    covariates: Optional[List[str]] = []

class NetworkRequest(BaseModel):
    dataset_id: str
    source_col: str
    target_col: str
    weight_col: Optional[str] = None

class PCARequest(BaseModel):
    dataset_id: str
    n_components: int = 3

class AnovaRequest(BaseModel):
    dataset_id: str
    group_column: str
    value_column: str

class ChiSquareRequest(BaseModel):
    dataset_id: str
    column_a: str
    column_b: str

class PowerRequest(BaseModel):
    dataset_id: str
    group_column: str
    value_column: str
    alpha: float = 0.05

class ForecastRequest(BaseModel):
    dataset_id: str
    date_column: str
    value_column: str
    periods: int = 12

class CompareRequest(BaseModel):
    dataset_id_a: str
    dataset_id_b: str
    column: str

class AskRequest(BaseModel):
    dataset_id: str
    question: str

class ReportRequest(BaseModel):
    dataset_id: str
    goal: Optional[str] = ""
    findings_json: Optional[str] = ""

class SuggestTestsRequest(BaseModel):
    dataset_id: str
    goal: Optional[str] = ""

class ExplainInsightRequest(BaseModel):
    insight_title: str
    insight_summary: str
    audience: str = "layman"

class ReviewRequest(BaseModel):
    dataset_id: str
    analysis_json: str
    claimed_conclusions: str

class UMAPRequest(BaseModel):
    dataset_id: str
    n_components: int = 2
    n_neighbors: int = 15

class SHAPRequest(BaseModel):
    dataset_id: str
    outcome: str
    predictors: Optional[List[str]] = []

class WorkspaceCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""

class WorkspaceAddDatasetRequest(BaseModel):
    workspace_id: str
    dataset_id: str

class ReplicationRequest(BaseModel):
    analysis_json: str
    target_dataset_id: str
    outcome: str
    predictors: List[str]

class QuickExploreRequest(BaseModel):
    dataset_id: str
    question_type: str   # compare_groups | find_patterns | predict_outcome |
                         # test_correlation | full_explore
    outcome_col:   Optional[str] = None   # user-picked from dropdown
    group_col:     Optional[str] = None   # user-picked from dropdown
    predictor_col: Optional[str] = None   # user-picked from dropdown
 
class SuggestQuestionsRequest(BaseModel):
    dataset_ids: List[str]   # all datasets just uploaded in this batch
# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _fp(df: pd.DataFrame, name: str) -> str:
    return hashlib.sha256((name + str(df.shape) + str(list(df.columns))).encode()).hexdigest()[:16]

def _infer_type(s: pd.Series) -> str:
    nn = s.dropna()
    if len(nn) == 0: return "unknown"
    if pd.to_numeric(nn, errors="coerce").notna().mean() > 0.85: return "numeric"
    if nn.nunique() <= min(12, int(len(nn)*0.3)+1): return "categorical"
    try:
        pd.to_datetime(nn.iloc[:20])
        return "datetime"
    except: pass
    return "text"

def _col_stats(s: pd.Series, t: str) -> dict:
    nn = s.dropna()
    base = {"missing": int(s.isna().sum()), "missing_pct": round(s.isna().mean()*100, 2)}
    if t == "numeric":
        nums = pd.to_numeric(nn, errors="coerce").dropna().astype(float)
        if len(nums) == 0: return base
        return {**base, "mean": round(float(nums.mean()),4), "std": round(float(nums.std()),4),
                "min": round(float(nums.min()),4), "max": round(float(nums.max()),4),
                "median": round(float(nums.median()),4),
                "q1": round(float(nums.quantile(0.25)),4), "q3": round(float(nums.quantile(0.75)),4),
                "skewness": round(float(nums.skew()),4), "kurtosis": round(float(nums.kurtosis()),4)}
    return {**base, "unique": int(nn.nunique()),
            "top_values": {str(k): int(v) for k,v in nn.value_counts().head(5).items()},
            "mode": str(nn.mode().iloc[0]) if len(nn) > 0 else None}

def _schema(df: pd.DataFrame) -> list:
    return [{"name": c, "type": _infer_type(df[c]), "stats": _col_stats(df[c], _infer_type(df[c]))} for c in df.columns]

def _get_df(dataset_id: str) -> pd.DataFrame:
    if dataset_id not in _DATASETS:
        raise HTTPException(404, f"Dataset '{dataset_id}' not found. Upload first via POST /upload")
    return _DATASETS[dataset_id]["df"]

def _num_cols(df: pd.DataFrame) -> List[str]:
    return [c for c in df.columns if _infer_type(df[c]) == "numeric"]

def _cat_cols(df: pd.DataFrame) -> List[str]:
    return [c for c in df.columns if _infer_type(df[c]) == "categorical"]

def _sf(v) -> Optional[float]:
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 6)
    except: return None

def _detect_data_structure(df: pd.DataFrame, meta: dict) -> dict:
    """Detect repeated measures, hierarchy, time components."""
    schema = meta["schema"]
    num = [c["name"] for c in schema if c["type"] == "numeric"]
    cat = [c["name"] for c in schema if c["type"] == "categorical"]
    dt  = [c["name"] for c in schema if c["type"] == "datetime"]

    id_cols = [c for c in cat if any(kw in c.lower() for kw in ["id","subject","patient","participant","person","individual","user"])]
    time_cols = [c for c in df.columns if any(kw in c.lower() for kw in ["time","visit","wave","session","week","month","day","year","date"])]

    repeated = len(id_cols) > 0 and len(time_cols) > 0
    n_obs_per_id = None
    if id_cols:
        n_obs_per_id = round(float(df.groupby(id_cols[0]).size().mean()), 2)

    # Detect hierarchical
    hierarchy_hint = None
    for c in cat:
        if any(kw in c.lower() for kw in ["site","hospital","clinic","school","cluster","group","center"]):
            hierarchy_hint = c
            break

    return {
        "n_rows": len(df), "n_cols": len(df.columns),
        "numeric_cols": num, "categorical_cols": cat, "datetime_cols": dt,
        "id_cols": id_cols, "time_cols": time_cols,
        "has_repeated_measures": repeated,
        "avg_obs_per_subject": n_obs_per_id,
        "hierarchy_variable": hierarchy_hint,
        "has_datetime": len(dt) > 0,
        "missingness_pct": round(float(df.isna().mean().mean() * 100), 2),
        "recommended_model_family": (
            "LMM/GLMM" if repeated
            else "multilevel" if hierarchy_hint
            else "survival" if any("event" in c.lower() or "death" in c.lower() or "censor" in c.lower() for c in df.columns)
            else "OLS/GLM"
        )
    }


# ══════════════════════════════════════════════════════════════════════════════
#  STATISTICAL ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def _pearson_matrix(df, cols):
    sub = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    mat = sub.corr("pearson")
    pv = pd.DataFrame(index=cols, columns=cols, dtype=float)
    for c1 in cols:
        for c2 in cols:
            if c1==c2: pv.loc[c1,c2]=0.0
            else:
                _, p = scipy_stats.pearsonr(sub[c1], sub[c2])
                pv.loc[c1,c2] = round(p, 6)
    # Spearman
    sp = sub.corr("spearman")
    return {
        "pearson": [[_sf(mat.loc[r,c]) for c in cols] for r in cols],
        "spearman": [[_sf(sp.loc[r,c]) for c in cols] for r in cols],
        "pvalues": [[_sf(pv.loc[r,c]) for c in cols] for r in cols],
        "labels": cols,
    }

def _welch_ttest(a, b, la, lb):
    t, p = scipy_stats.ttest_ind(a, b, equal_var=False)
    u, pu = mannwhitneyu(a, b, alternative="two-sided")
    d = (a.mean()-b.mean()) / math.sqrt((a.std()**2+b.std()**2)/2 + 1e-10)
    effect = "large" if abs(d)>0.8 else "medium" if abs(d)>0.5 else "small"
    # Confidence interval
    se = math.sqrt(a.std()**2/len(a) + b.std()**2/len(b))
    df_val = len(a)+len(b)-2
    ci = scipy_stats.t.ppf(0.975, df_val) * se
    diff = float(a.mean()-b.mean())
    return {
        "test": "Welch t-test", "group_a": la, "group_b": lb,
        "mean_a": round(float(a.mean()),4), "std_a": round(float(a.std()),4), "n_a": int(len(a)),
        "mean_b": round(float(b.mean()),4), "std_b": round(float(b.std()),4), "n_b": int(len(b)),
        "t_stat": _sf(t), "p_value": _sf(p), "significant": bool(p<0.05),
        "cohens_d": round(float(d),4), "effect_size": effect,
        "mean_difference": round(diff, 4),
        "ci_95_lower": round(diff-ci, 4), "ci_95_upper": round(diff+ci, 4),
        "mann_whitney_u": _sf(u), "mann_whitney_p": _sf(pu),
        "non_parametric_significant": bool(pu<0.05),
    }

def _linear_regression(x, y, xn, yn):
    X2 = sm.add_constant(x.reshape(-1,1))
    model = sm.OLS(y, X2).fit()
    dw = durbin_watson(model.resid)
    _, p_norm = shapiro(model.resid[:5000]) if len(model.resid)<=5000 else (None, None)
    return {
        "predictor": xn, "outcome": yn,
        "slope": _sf(model.params[1]), "intercept": _sf(model.params[0]),
        "r2": round(float(model.rsquared),4), "adj_r2": round(float(model.rsquared_adj),4),
        "rmse": round(float(np.sqrt(model.mse_resid)),4),
        "p_value_slope": _sf(model.pvalues[1]),
        "ci_slope_lower": _sf(pd.DataFrame(model.conf_int()).iloc[1,0]),
        "ci_slope_upper": _sf(pd.DataFrame(model.conf_int()).iloc[1,1]),
        "f_statistic": _sf(model.fvalue), "f_pvalue": _sf(model.f_pvalue),
        "durbin_watson": round(float(dw),4),
        "residuals_normal_p": _sf(p_norm),
        "aic": round(float(model.aic),2), "bic": round(float(model.bic),2),
        "n": int(len(y)),
    }

def _normality(s, col):
    vals = pd.to_numeric(s, errors="coerce").dropna().values
    r: Dict = {"column": col, "n": int(len(vals))}
    if len(vals)<3: return {**r, "error": "too few observations"}
    sw, swp = shapiro(vals[:5000])
    jb_res = jarque_bera(vals); jb, jbp = jb_res[0], jb_res[1]
    ks, ksp = kstest(vals, "norm", args=(vals.mean(), vals.std()))
    r.update({
        "shapiro_wilk": {"stat": _sf(sw), "p": _sf(swp), "normal": bool(swp>0.05)},
        "kolmogorov_smirnov": {"stat": _sf(ks), "p": _sf(ksp), "normal": bool(ksp>0.05)},
        "jarque_bera": {"stat": _sf(jb), "p": _sf(jbp), "normal": bool(jbp>0.05)},
        "skewness": _sf(scipy_stats.skew(vals)),
        "excess_kurtosis": _sf(scipy_stats.kurtosis(vals)),
        "verdict": "approximately normal" if swp>0.05 else "non-normal — consider Wilcoxon/Mann-Whitney or transform"
    })
    return r

def _outlier_full(s, col, threshold=3.0):
    vals = pd.to_numeric(s, errors="coerce").dropna()
    z = np.abs(scipy_stats.zscore(vals))
    q1, q3 = vals.quantile(0.25), vals.quantile(0.75)
    iqr = q3-q3  # intentional: iqr = q3-q1
    iqr = q3-q1
    iqr_mask = (vals<q1-1.5*iqr)|(vals>q3+1.5*iqr)
    return {
        "column": col, "zscore_threshold": threshold,
        "zscore_count": int((z>threshold).sum()),
        "zscore_pct": round(float((z>threshold).mean()*100),2),
        "iqr_count": int(iqr_mask.sum()),
        "iqr_pct": round(float(iqr_mask.mean()*100),2),
        "iqr_bounds": {"lower": round(float(q1-1.5*iqr),4), "upper": round(float(q3+1.5*iqr),4)},
    }

def _kmeans_full(df, cols, k):
    sub = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    X = StandardScaler().fit_transform(sub)
    km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(X)
    labels = km.labels_
    sil = _sf(silhouette_score(X, labels)) if len(set(labels))>1 else None
    ch = _sf(calinski_harabasz_score(X, labels)) if len(set(labels))>1 else None
    elbow = {ki: round(float(KMeans(n_clusters=ki,random_state=42,n_init=5).fit(X).inertia_),2) for ki in range(2,min(9,len(sub)))}
    stats = [{"cluster": int(ci), "n": int((labels==ci).sum()),
              "means": {c: round(float(sub[labels==ci][c].mean()),3) for c in cols}} for ci in range(k)]
    return {"k": k, "columns_used": cols, "n_samples": len(sub),
            "labels": labels.tolist(), "inertia": round(float(km.inertia_),2),
            "silhouette_score": sil, "calinski_harabasz": ch,
            "elbow_data": elbow, "cluster_stats": stats}

def _isolation_forest(df, cols):
    sub = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    pred = IsolationForest(contamination=0.05, random_state=42).fit_predict(sub)
    return {"n_anomalies": int((pred==-1).sum()),
            "anomaly_pct": round(float((pred==-1).mean()*100),2),
            "anomaly_row_indices": np.where(pred==-1)[0].tolist()[:50],
            "method": "Isolation Forest (contamination=0.05)"}

def _rf_importance(df, num_cols):
    if len(num_cols)<2: return {}
    sub = df[num_cols].apply(pd.to_numeric, errors="coerce").dropna()
    target = num_cols[0]; feats = num_cols[1:]
    X, y = sub[feats].values, sub[target].values
    rf = RandomForestRegressor(n_estimators=200, max_depth=8, random_state=42).fit(X, y)
    gini = dict(sorted(zip(feats, rf.feature_importances_), key=lambda x:-x[1]))
    perm = permutation_importance(rf, X, y, n_repeats=5, random_state=42)
    pi = dict(sorted(zip(feats, perm.importances_mean), key=lambda x:-x[1]))
    cv = cross_val_score(rf, X, y, cv=5, scoring="r2")
    return {"target": target, "features": feats,
            "gini_importance": {k: round(float(v),4) for k,v in gini.items()},
            "permutation_importance": {k: round(float(v),4) for k,v in pi.items()},
            "r2_train": round(float(rf.score(X,y)),4),
            "r2_cv_mean": round(float(cv.mean()),4),
            "r2_cv_std": round(float(cv.std()),4),
            "n_estimators": 200}

def _pca_full(df, cols, n):
    sub = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    nc = min(n, len(cols), len(sub))
    X = StandardScaler().fit_transform(sub)
    pca = PCA(n_components=nc, random_state=42).fit_transform(X)
    p = PCA(n_components=nc, random_state=42).fit(StandardScaler().fit_transform(sub))
    return {"n_components": nc,
            "explained_variance_ratio": [round(v,4) for v in p.explained_variance_ratio_],
            "cumulative_variance": [round(v,4) for v in np.cumsum(p.explained_variance_ratio_)],
            "loadings": {f"PC{i+1}": {col: round(float(p.components_[i][j]),4) for j,col in enumerate(cols)} for i in range(nc)},
            "scores_sample": pca[:50].tolist(), "columns_used": cols}

def _anova(df, gc, vc):
    groups = {str(g): pd.to_numeric(grp[vc],errors="coerce").dropna().values for g,grp in df.groupby(gc) if len(grp)>=3}
    if len(groups)<2: return {"error": "Need ≥2 groups with n≥3"}
    f, p = f_oneway(*groups.values())
    H, pk = kruskal(*groups.values())
    gm = np.concatenate(list(groups.values())).mean()
    ssb = sum(len(g)*(g.mean()-gm)**2 for g in groups.values())
    sst = sum(((v-gm)**2).sum() for v in groups.values())
    eta2 = ssb/sst if sst>0 else 0
    # Tukey HSD
    all_vals = np.concatenate(list(groups.values()))
    all_labs = np.concatenate([[k]*len(v) for k,v in groups.items()])
    try:
        tukey = pairwise_tukeyhsd(all_vals, all_labs)
        tukey_res = [{"group1": str(r[0]), "group2": str(r[1]),
                      "meandiff": round(float(r[2]),4), "reject": bool(r[5])} for r in tukey.summary().data[1:]]
    except: tukey_res = []
    return {"test": "One-Way ANOVA + Kruskal-Wallis", "group_column": gc, "value_column": vc,
            "f_statistic": _sf(f), "p_value": _sf(p), "significant": bool(p<0.05),
            "kruskal_h": _sf(H), "kruskal_p": _sf(pk),
            "eta_squared": round(float(eta2),4),
            "effect_size": "large" if eta2>0.14 else "medium" if eta2>0.06 else "small",
            "n_groups": len(groups),
            "group_stats": {g: {"mean": round(float(v.mean()),4), "std": round(float(v.std()),4), "n": int(len(v))} for g,v in groups.items()},
            "tukey_hsd": tukey_res}

def _chi_square(df, ca, cb):
    ct = pd.crosstab(df[ca].astype(str), df[cb].astype(str))
    chi2, p, dof, _ = chi2_contingency(ct)
    n = ct.values.sum()
    v = math.sqrt(chi2/(n*(min(ct.shape)-1))) if n>0 else 0
    return {"test": "Chi-Square Test of Independence",
            "column_a": ca, "column_b": cb,
            "chi2_statistic": _sf(chi2), "p_value": _sf(p),
            "degrees_of_freedom": int(dof), "significant": bool(p<0.05),
            "cramers_v": round(float(v),4),
            "effect_size": "large" if v>0.5 else "medium" if v>0.3 else "small",
            "contingency_table": ct.to_dict(), "n": int(n)}

def _power_analysis_posthoc(a, b, alpha=0.05):
    d = abs(a.mean()-b.mean())/(math.sqrt((a.std()**2+b.std()**2)/2)+1e-10)
    n = min(len(a),len(b))
    za = scipy_stats.norm.ppf(1-alpha/2)
    zb = d*math.sqrt(n/2)-za
    power = float(scipy_stats.norm.cdf(zb))
    needed = {}
    for tgt in [0.80, 0.90, 0.95]:
        zbt = scipy_stats.norm.ppf(tgt)
        needed[str(tgt)] = math.ceil(2*((za+zbt)/(d+1e-10))**2)
    return {"cohens_d": round(float(d),4), "n_per_group": n,
            "observed_power": round(max(0.,min(1.,power)),4),
            "alpha": alpha, "n_needed_for_power": needed,
            "underpowered": power<0.80}

def _forecast_arima(series, periods):
    vals = series.dropna().values.astype(float)
    # ADF test
    adf_stat, adf_p, *_ = adfuller(vals)
    stationary = bool(adf_p < 0.05)
    # Fit ARIMA
    try:
        model = ARIMA(vals, order=(1,1,1)).fit()
        forecast = model.forecast(steps=periods)
        ci = model.get_forecast(steps=periods).conf_int()
        method = "ARIMA(1,1,1)"
        lower = ci.iloc[:,0].tolist()
        upper = ci.iloc[:,1].tolist()
        aic = round(float(model.aic),2)
    except Exception:
        # Fallback: linear trend
        x = np.arange(len(vals))
        slope, intercept, *_ = scipy_stats.linregress(x, vals)
        fx = np.arange(len(vals), len(vals)+periods)
        forecast = slope*fx+intercept
        resid_std = float(np.std(vals-(slope*x+intercept)))
        lower = (forecast-1.96*resid_std).tolist()
        upper = (forecast+1.96*resid_std).tolist()
        method = "Linear trend (ARIMA fallback)"
        aic = None
    return {"method": method, "stationary": stationary, "adf_p": _sf(adf_p),
            "forecast": [round(float(v),4) for v in forecast],
            "lower_95": [round(float(v),4) for v in lower],
            "upper_95": [round(float(v),4) for v in upper],
            "periods": periods, "aic": aic}


# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — UPLOAD & CORE
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "gemini_available": _HAS_GEMINI,
            "umap_available": _HAS_UMAP,
            "datasets_loaded": len(_DATASETS),
            "workspaces": len(_WORKSPACES),
            "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    fn = file.filename or ""
    if not fn.lower().endswith((".csv",".tsv",".xlsx",".xls",".parquet")):
        raise HTTPException(400, "Unsupported file type. Upload .csv .tsv .xlsx .xls or .parquet")
    content = await file.read()
    buf = io.BytesIO(content)
    try:
        if fn.lower().endswith(".csv"): df = pd.read_csv(buf, low_memory=False)
        elif fn.lower().endswith(".tsv"): df = pd.read_csv(buf, sep="\t", low_memory=False)
        elif fn.lower().endswith((".xlsx",".xls")): df = pd.read_excel(buf)
        else: df = pd.read_parquet(buf)
    except Exception as e:
        raise HTTPException(400, f"Parse error: {e}")

    did = hashlib.md5((fn+str(datetime.now())).encode()).hexdigest()[:12]
    s = _schema(df)
    for ci in s:
        if ci["type"]=="datetime":
            try: df[ci["name"]] = pd.to_datetime(df[ci["name"]])
            except: pass

    structure = _detect_data_structure(df, {"schema": s})
    _DATASETS[did] = {"df": df, "name": fn, "uploaded_at": datetime.now(timezone.utc).isoformat(),
                      "schema": s, "fingerprint": _fp(df, fn), "structure": structure}
    _log("Upload Agent", f"Loaded {fn}", f"{len(df)}r × {len(df.columns)}c")

    num = [c["name"] for c in s if c["type"]=="numeric"]
    cat = [c["name"] for c in s if c["type"]=="categorical"]
    dt  = [c["name"] for c in s if c["type"]=="datetime"]

    return {"dataset_id": did, "filename": fn, "rows": len(df), "columns": len(df.columns),
            "numeric_columns": num, "categorical_columns": cat, "datetime_columns": dt,
            "schema": s, "fingerprint": _DATASETS[did]["fingerprint"],
            "data_structure": structure,
            "missing_summary": {c: int(df[c].isna().sum()) for c in df.columns if df[c].isna().any()},
            "model_recommendation": structure["recommended_model_family"]}


# ══════════════════════════════════════════════════════════════════════════════
#  STUDY DESIGN + HYPOTHESIS GENERATION  ← KEY DIFFERENTIATORS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/study-design")
async def generate_study_design(req: StudyDesignRequest):
    """Generate 2-3 valid study designs given data structure + question."""
    df = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    struct = meta["structure"]
    schema = meta["schema"]

    col_summary = "\n".join(f"  - {c['name']} ({c['type']}): {c['stats']}" for c in schema[:20])
    struct_summary = json.dumps(struct, indent=2)

    prompt = f"""A researcher is asking this question: "{req.research_question}"

Dataset structure:
{struct_summary}

Columns available:
{col_summary}

{"Outcome variable: " + req.outcome_variable if req.outcome_variable else ""}
{"Exposure/predictor: " + req.exposure_variable if req.exposure_variable else ""}

Generate exactly 3 valid study designs as a JSON array. Each design must have:
- "name": short name (e.g. "Cross-Sectional Regression")
- "design_type": one of [cross_sectional, longitudinal, case_control, matched_cohort, quasi_experimental, survival, repeated_measures, factorial]
- "model": specific statistical model to use (e.g. "Linear Mixed Model with random intercept for subject_id")
- "formula": R-style formula (e.g. "outcome ~ exposure + covariate + (1|subject_id)")
- "assumptions": list of assumptions to check
- "limitations": list of limitations and threats to validity
- "causal_inference_possible": true/false with reason
- "strength": "weak"|"moderate"|"strong" — strength of evidence this design produces
- "implementation_steps": ordered list of steps to implement this analysis

Be specific. Reference actual column names from the dataset. Return only valid JSON array, no other text."""

    raw = await gemini(prompt, system=RESEARCH_SYSTEM)
    try:
        designs = json.loads(raw.strip().strip("```json").strip("```").strip())
    except:
        designs = [{"raw_suggestion": raw}]

    plan_id = hashlib.md5((req.dataset_id+req.research_question+str(datetime.now())).encode()).hexdigest()[:10]
    _STUDY_PLANS[plan_id] = {"dataset_id": req.dataset_id, "question": req.research_question,
                              "designs": designs, "created_at": datetime.now(timezone.utc).isoformat()}
    _log("Study Design Agent", req.research_question[:80])

    return {"plan_id": plan_id, "research_question": req.research_question,
            "data_structure": struct, "study_designs": designs,
            "recommendation": "Use the design with strength='strong' if sample size permits. Check assumptions before proceeding."}


@app.post("/hypotheses")
async def generate_hypotheses(req: HypothesisRequest):
    """Generate structured, testable hypotheses from research question + data."""
    df = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    schema = meta["schema"]
    struct = meta["structure"]

    col_summary = "\n".join(f"  - {c['name']} ({c['type']})" for c in schema[:20])

    prompt = f"""Research question: "{req.research_question}"
Domain: {req.domain}
Dataset columns:
{col_summary}

Data structure: {json.dumps(struct, indent=2)}

Generate 4-6 specific, testable hypotheses. Return a JSON array where each item has:
- "h_number": H1, H2, etc.
- "null_hypothesis": precise null hypothesis (H0)
- "alternative_hypothesis": precise alternative hypothesis (H1)
- "direction": "two_sided"|"positive"|"negative"
- "outcome_variable": exact column name from dataset
- "predictor_variable": exact column name from dataset
- "covariates": list of column names to control for
- "appropriate_test": specific statistical test to use
- "effect_size_measure": e.g. "Cohen's d", "OR", "HR", "β coefficient"
- "sample_size_adequate": true/false with brief note
- "priority": "primary"|"secondary"|"exploratory"

Be concrete. Use actual column names. Return only valid JSON array."""

    raw = await gemini(prompt, system=RESEARCH_SYSTEM)
    try:
        hyps = json.loads(raw.strip().strip("```json").strip("```").strip())
    except:
        hyps = [{"raw": raw}]

    _HYPOTHESES[req.dataset_id] = hyps
    _log("Hypothesis Agent", req.research_question[:80], f"Generated {len(hyps)} hypotheses")
    return {"dataset_id": req.dataset_id, "research_question": req.research_question,
            "hypotheses": hyps, "n_hypotheses": len(hyps),
            "note": "Primary hypotheses should be pre-registered before analysis to avoid p-hacking."}


# ══════════════════════════════════════════════════════════════════════════════
#  ADVANCED STATISTICAL MODELS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/lmm")
async def run_lmm(req: LMMRequest):
    """Linear / Generalized Linear Mixed-Effects Model."""
    df = _get_df(req.dataset_id)

    # Build formula
    fe = " + ".join(req.fixed_effects)
    if req.interaction_terms:
        fe += " + " + " + ".join(req.interaction_terms)
    re = " + ".join(f"(1|{r})" for r in req.random_effects)
    formula = f"{req.outcome} ~ {fe}"

    result: Dict = {"formula": formula, "random_effects": req.random_effects,
                    "family": req.family, "dataset_id": req.dataset_id}

    try:
        # Use pingouin for mixed models when possible (cleaner interface)
        if req.family == "gaussian" and len(req.random_effects) == 1:
            sub = df[[req.outcome] + req.fixed_effects + req.random_effects].dropna()
            sub[req.outcome] = pd.to_numeric(sub[req.outcome], errors="coerce")
            for fe_col in req.fixed_effects:
                sub[fe_col] = pd.to_numeric(sub[fe_col], errors="coerce")
            sub = sub.dropna()

            # statsmodels MixedLM
            md = smf.mixedlm(formula, sub, groups=sub[req.random_effects[0]])
            mdf = md.fit(method="lbfgs", warn_convergence=False)

            coefs = []
            for i, name in enumerate(mdf.params.index):
                coefs.append({
                    "variable": str(name),
                    "coefficient": _sf(mdf.params[i]),
                    "std_error": _sf(mdf.bse[i]),
                    "z_stat": _sf(mdf.tvalues[i]),
                    "p_value": _sf(mdf.pvalues[i]),
                    "ci_lower": _sf(mdf.conf_int().iloc[i,0]),
                    "ci_upper": _sf(mdf.conf_int().iloc[i,1]),
                    "significant": bool(mdf.pvalues[i] < 0.05),
                })

            result.update({
                "coefficients": coefs,
                "log_likelihood": _sf(mdf.llf),
                "aic": _sf(mdf.aic),
                "bic": _sf(mdf.bic),
                "n_obs": int(mdf.nobs),
                "n_groups": int(mdf.ngroups),
                "convergence": str(mdf.converged),
                "random_effects_variance": _sf(float(mdf.cov_re.values[0][0])) if mdf.cov_re is not None else None,
                "residual_variance": _sf(mdf.scale),
                "icc": None,  # Intraclass correlation
            })
            # ICC
            try:
                re_var = float(mdf.cov_re.values[0][0])
                res_var = float(mdf.scale)
                icc = re_var / (re_var + res_var)
                result["icc"] = round(icc, 4)
                result["icc_interpretation"] = "high clustering" if icc>0.3 else "moderate" if icc>0.1 else "low clustering"
            except: pass

        else:
            result["warning"] = f"GLMM with family='{req.family}' requires glm fitting. Using OLS approximation."
            sub = df[[req.outcome]+req.fixed_effects].dropna()
            X = sm.add_constant(sub[req.fixed_effects].apply(pd.to_numeric, errors="coerce"))
            y = pd.to_numeric(sub[req.outcome], errors="coerce")
            m = sm.OLS(y, X).fit()
            result["ols_fallback"] = {
                "params": {k: _sf(v) for k,v in m.params.items()},
                "pvalues": {k: _sf(v) for k,v in m.pvalues.items()},
                "r2": _sf(m.rsquared), "aic": _sf(m.aic)
            }
    except Exception as e:
        result["error"] = str(e)
        result["traceback"] = traceback.format_exc()[-500:]

    # AI interpretation
    prompt = f"""A Linear Mixed-Effects Model was run with formula: {formula}
Random effects grouping: {req.random_effects}
Results: {json.dumps({k:v for k,v in result.items() if k not in ['dataset_id']}, default=str)[:1500]}

In 3-4 sentences, interpret these results for a researcher. Explain:
1. Which fixed effects are significant and what the effect sizes mean
2. The ICC and what it tells us about clustering
3. Any concerns about the model specification or convergence
4. Whether causality can be claimed"""

    result["interpretation"] = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("LMM Agent", formula, f"Groups: {req.random_effects}")
    return result


@app.post("/survival")
async def run_survival(req: SurvivalRequest):
    """Kaplan-Meier + Cox PH survival analysis."""
    df = _get_df(req.dataset_id)

    if req.duration_col not in df.columns or req.event_col not in df.columns:
        raise HTTPException(400, "Duration and event columns must exist in dataset")

    sub = df[[req.duration_col, req.event_col]+(req.covariates or [])+(([req.group_col] if req.group_col else []))].dropna()
    sub[req.duration_col] = pd.to_numeric(sub[req.duration_col], errors="coerce")
    sub[req.event_col] = pd.to_numeric(sub[req.event_col], errors="coerce")
    sub = sub.dropna()

    result: Dict = {"duration_col": req.duration_col, "event_col": req.event_col, "n": len(sub)}

    # Kaplan-Meier (overall)
    kmf = KaplanMeierFitter()
    kmf.fit(sub[req.duration_col], sub[req.event_col])
    result["kaplan_meier"] = {
        "median_survival": _sf(kmf.median_survival_time_),
        "timeline": kmf.timeline.tolist(),
        "survival_probs": kmf.survival_function_.iloc[:,0].round(4).tolist(),
        "ci_lower": kmf.confidence_interval_.iloc[:,0].round(4).tolist(),
        "ci_upper": kmf.confidence_interval_.iloc[:,1].round(4).tolist(),
    }

    # Group comparison (log-rank)
    if req.group_col and req.group_col in sub.columns:
        groups = sub[req.group_col].unique()
        if len(groups) == 2:
            g1, g2 = groups[0], groups[1]
            mask1 = sub[req.group_col]==g1
            mask2 = sub[req.group_col]==g2
            lr = logrank_test(sub[mask1][req.duration_col], sub[mask2][req.duration_col],
                              sub[mask1][req.event_col], sub[mask2][req.event_col])
            result["logrank_test"] = {
                "group_a": str(g1), "group_b": str(g2),
                "test_statistic": _sf(lr.test_statistic),
                "p_value": _sf(lr.p_value),
                "significant": bool(lr.p_value<0.05)
            }
            # KM per group
            km_groups = {}
            for g in groups:
                kmf_g = KaplanMeierFitter()
                mask = sub[req.group_col]==g
                kmf_g.fit(sub[mask][req.duration_col], sub[mask][req.event_col], label=str(g))
                km_groups[str(g)] = {
                    "median_survival": _sf(kmf_g.median_survival_time_),
                    "survival_probs": kmf_g.survival_function_.iloc[:,0].round(4).tolist(),
                    "timeline": kmf_g.timeline.tolist(),
                }
            result["km_by_group"] = km_groups

    # Cox PH (if covariates provided)
    if req.covariates:
        try:
            cox_df = sub.copy()
            # Encode categorical cols
            for c in req.covariates:
                if cox_df[c].dtype == object:
                    le = LabelEncoder()
                    cox_df[c] = le.fit_transform(cox_df[c].astype(str))
            cox_cols = [req.duration_col, req.event_col] + req.covariates
            cox_df = cox_df[cox_cols].dropna()
            cph = CoxPHFitter()
            cph.fit(cox_df, duration_col=req.duration_col, event_col=req.event_col)
            summ = cph.summary
            result["cox_ph"] = {
                "coefficients": [{"variable": str(idx),
                                   "coef": _sf(summ.loc[idx,"coef"]),
                                   "exp_coef": _sf(summ.loc[idx,"exp(coef)"]),
                                   "se": _sf(summ.loc[idx,"se(coef)"]),
                                   "p_value": _sf(summ.loc[idx,"p"]),
                                   "ci_lower": _sf(summ.loc[idx,"exp(coef) lower 95%"]),
                                   "ci_upper": _sf(summ.loc[idx,"exp(coef) upper 95%"]),
                                   "significant": bool(summ.loc[idx,"p"]<0.05)}
                                  for idx in summ.index],
                "concordance": _sf(cph.concordance_index_),
                "partial_aic": _sf(cph.AIC_partial_),
                "log_likelihood": _sf(cph.log_likelihood_),
                "proportional_hazards_test": "not run — check schoenfeld residuals manually"
            }
        except Exception as e:
            result["cox_error"] = str(e)

    prompt = f"""A survival analysis was conducted:
- Duration column: {req.duration_col}, Event column: {req.event_col}
- N = {len(sub)}, Median survival: {result['kaplan_meier']['median_survival']}
- {'Log-rank p = '+str(result.get('logrank_test',{}).get('p_value','N/A')) if 'logrank_test' in result else 'No group comparison'}
- {'Concordance index: '+str(result.get('cox_ph',{}).get('concordance','N/A')) if 'cox_ph' in result else 'No Cox model'}

Interpret these survival results in 3-4 sentences. Explain median survival, any group differences, hazard ratios, and limitations."""
    result["interpretation"] = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("Survival Agent", f"KM + Cox: {req.duration_col} ~ {req.event_col}")
    return result


@app.post("/causal-inference")
async def run_causal(req: CausalRequest):
    """Propensity score matching, IPW, or DiD causal inference."""
    df = _get_df(req.dataset_id)
    result: Dict = {"method": req.method, "outcome": req.outcome,
                    "treatment": req.treatment, "covariates": req.covariates}

    cols_needed = [req.outcome, req.treatment] + (req.covariates or [])
    sub = df[cols_needed].dropna().copy()
    sub[req.outcome] = pd.to_numeric(sub[req.outcome], errors="coerce")
    sub[req.treatment] = pd.to_numeric(sub[req.treatment], errors="coerce")
    for c in (req.covariates or []):
        sub[c] = pd.to_numeric(sub[c], errors="coerce")
    sub = sub.dropna()

    if req.method == "propensity_matching":
        try:
            cov_str = " + ".join(req.covariates) if req.covariates else "1"
            ps_model = smf.logit(f"{req.treatment} ~ {cov_str}", data=sub).fit(disp=0)
            ps = ps_model.predict(sub)
            sub["propensity_score"] = ps

            treated = sub[sub[req.treatment]==1].copy()
            control = sub[sub[req.treatment]==0].copy()

            matched_pairs = []
            used_control = set()
            for i, t_row in treated.iterrows():
                dists = abs(control["propensity_score"] - t_row["propensity_score"])
                dists = dists[~dists.index.isin(used_control)]
                if len(dists)==0: continue
                best = dists.idxmin()
                if dists[best] < 0.05:
                    matched_pairs.append((i, best))
                    used_control.add(best)

            n_matched = len(matched_pairs)
            if n_matched > 0:
                t_outcomes = [sub.loc[t, req.outcome] for t,_ in matched_pairs]
                c_outcomes = [sub.loc[c, req.outcome] for _,c in matched_pairs]
                ate = float(np.mean(t_outcomes) - np.mean(c_outcomes))
                t_stat, p_val = scipy_stats.ttest_rel(t_outcomes, c_outcomes)
                result["propensity_matching"] = {
                    "n_matched_pairs": n_matched,
                    "n_unmatched": len(treated)-n_matched,
                    "ate": round(ate, 4),
                    "p_value": _sf(p_val),
                    "significant": bool(p_val<0.05),
                    "ps_range_treated": [round(float(treated["propensity_score"].min()),4),
                                         round(float(treated["propensity_score"].max()),4)],
                    "ps_range_control":  [round(float(control["propensity_score"].min()),4),
                                         round(float(control["propensity_score"].max()),4)],
                }
        except Exception as e:
            result["error"] = str(e)

    elif req.method == "ipw":
        try:
            cov_str = " + ".join(req.covariates) if req.covariates else "1"
            ps_model = smf.logit(f"{req.treatment} ~ {cov_str}", data=sub).fit(disp=0)
            ps = ps_model.predict(sub).clip(0.01, 0.99)
            T = sub[req.treatment]
            Y = sub[req.outcome]
            weights = T/ps + (1-T)/(1-ps)
            ate = float((weights * T * Y).sum()/(weights*T).sum()) - float((weights*(1-T)*Y).sum()/(weights*(1-T)).sum())
            result["ipw"] = {
                "ate": round(ate, 4),
                "n_treated": int(T.sum()),
                "n_control": int((1-T).sum()),
                "ps_mean_treated": round(float(ps[T==1].mean()),4),
                "ps_mean_control": round(float(ps[T==0].mean()),4),
            }
        except Exception as e:
            result["error"] = str(e)

    elif req.method == "regression_adjustment":
        try:
            cov_str = " + ".join(req.covariates) if req.covariates else ""
            formula = f"{req.outcome} ~ {req.treatment}" + (f" + {cov_str}" if cov_str else "")
            m = smf.ols(formula, data=sub).fit()
            result["regression_adjustment"] = {
                "treatment_effect": _sf(m.params.get(req.treatment)),
                "treatment_pvalue": _sf(m.pvalues.get(req.treatment)),
                "significant": bool(m.pvalues.get(req.treatment,1.0)<0.05),
                "ci_lower": _sf(m.conf_int().loc[req.treatment,0]) if req.treatment in m.conf_int().index else None,
                "ci_upper": _sf(m.conf_int().loc[req.treatment,1]) if req.treatment in m.conf_int().index else None,
                "r2": _sf(m.rsquared), "n": int(m.nobs),
                "covariates_controlled": req.covariates,
                "formula": formula,
            }
        except Exception as e:
            result["error"] = str(e)

    prompt = f"""Causal inference analysis using {req.method}:
Outcome: {req.outcome}, Treatment: {req.treatment}
Covariates controlled: {req.covariates}
Results: {json.dumps({k:v for k,v in result.items() if k not in ['method','covariates','dataset_id']}, default=str)[:1000]}

In 3-4 sentences, interpret the causal estimate. IMPORTANT:
1. State clearly whether this is a causal effect or an associational estimate
2. Explain what confounders might remain
3. Describe what assumptions are required for this to be causal
4. Note the limitations of {req.method} in this context"""
    result["interpretation"] = await gemini(prompt, system=RESEARCH_SYSTEM)
    result["causal_warning"] = "Observational causal inference requires untestable assumptions. Results should be interpreted cautiously."
    _log("Causal Inference Agent", req.method, f"{req.outcome} ~ {req.treatment}")
    return result


@app.post("/mediation")
async def run_mediation(req: MediationRequest):
    """Baron-Kenny mediation analysis + Sobel test."""
    df = _get_df(req.dataset_id)
    cols = [req.outcome, req.mediator, req.exposure] + (req.covariates or [])
    sub = df[cols].apply(pd.to_numeric, errors="coerce").dropna()

    cov_str = " + ".join(req.covariates) if req.covariates else ""
    add_cov = f" + {cov_str}" if cov_str else ""

    # Path a: X → M
    m_a = smf.ols(f"{req.mediator} ~ {req.exposure}{add_cov}", data=sub).fit()
    a = m_a.params[req.exposure]; se_a = m_a.bse[req.exposure]

    # Path b + c': X + M → Y
    m_bc = smf.ols(f"{req.outcome} ~ {req.exposure} + {req.mediator}{add_cov}", data=sub).fit()
    b = m_bc.params[req.mediator]; se_b = m_bc.bse[req.mediator]
    c_prime = m_bc.params[req.exposure]

    # Path c: X → Y (total)
    m_c = smf.ols(f"{req.outcome} ~ {req.exposure}{add_cov}", data=sub).fit()
    c = m_c.params[req.exposure]

    # Indirect effect + Sobel
    indirect = float(a * b)
    se_indirect = math.sqrt(b**2 * se_a**2 + a**2 * se_b**2)
    z_sobel = indirect / (se_indirect + 1e-10)
    p_sobel = 2*(1 - scipy_stats.norm.cdf(abs(z_sobel)))
    prop_mediated = indirect / (c + 1e-10) if abs(c) > 0.001 else None

    result = {
        "exposure": req.exposure, "mediator": req.mediator, "outcome": req.outcome,
        "path_a": {"coef": round(float(a),4), "se": round(float(se_a),4), "p": _sf(m_a.pvalues[req.exposure])},
        "path_b": {"coef": round(float(b),4), "se": round(float(se_b),4), "p": _sf(m_bc.pvalues[req.mediator])},
        "path_c_direct": {"coef": round(float(c_prime),4), "p": _sf(m_bc.pvalues[req.exposure])},
        "path_c_total": {"coef": round(float(c),4), "p": _sf(m_c.pvalues[req.exposure])},
        "indirect_effect": round(indirect, 4),
        "indirect_effect_se": round(float(se_indirect),4),
        "sobel_z": _sf(z_sobel), "sobel_p": _sf(p_sobel),
        "mediation_significant": bool(p_sobel<0.05),
        "proportion_mediated": round(float(prop_mediated),4) if prop_mediated else None,
        "mediation_type": (
            "full mediation" if abs(c_prime)<0.05 and p_sobel<0.05
            else "partial mediation" if p_sobel<0.05
            else "no mediation"
        )
    }

    prompt = f"""Mediation analysis: {req.exposure} → {req.mediator} → {req.outcome}
Path a (X→M): β={a:.4f}, p={m_a.pvalues[req.exposure]:.4f}
Path b (M→Y|X): β={b:.4f}, p={m_bc.pvalues[req.mediator]:.4f}
Total effect (c): {c:.4f}, Direct effect (c'): {c_prime:.4f}
Indirect effect: {indirect:.4f} (Sobel p={p_sobel:.4f})
Mediation type: {result['mediation_type']}

Interpret these results in 3-4 sentences."""
    result["interpretation"] = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("Mediation Agent", f"{req.exposure} → {req.mediator} → {req.outcome}")
    return result


# ══════════════════════════════════════════════════════════════════════════════
#  MULTI-DATASET + COHORT BUILDER
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/cohort-builder")
async def build_cohort(req: CohortRequest):
    """Intelligently join multiple datasets into analysis-ready cohort."""
    if len(req.dataset_ids) < 2:
        raise HTTPException(400, "Provide at least 2 dataset IDs")
    for did in req.dataset_ids:
        if did not in _DATASETS:
            raise HTTPException(404, f"Dataset '{did}' not found")

    dfs = {did: _DATASETS[did]["df"].copy() for did in req.dataset_ids}
    names = {did: _DATASETS[did]["name"] for did in req.dataset_ids}

    # Auto-detect join keys if not provided
    join_keys = dict(req.join_keys or {})
    if not join_keys:
        # Find common columns across datasets
        all_cols = [set(df.columns) for df in dfs.values()]
        common = all_cols[0].intersection(*all_cols[1:])
        id_candidates = [c for c in common if any(kw in c.lower() for kw in ["id","key","subject","patient","participant"])]
        if id_candidates:
            key = id_candidates[0]
            join_keys = {did: key for did in req.dataset_ids}
        elif common:
            key = list(common)[0]
            join_keys = {did: key for did in req.dataset_ids}

    if not join_keys:
        raise HTTPException(400, "No common join keys found. Provide join_keys explicitly.")

    # Check for duplication risk before merging
    warnings_list = []
    base_did = req.dataset_ids[0]
    base_df = dfs[base_did].copy()
    base_key = join_keys.get(base_did, list(join_keys.values())[0])

    for did in req.dataset_ids[1:]:
        other_df = dfs[did].copy()
        other_key = join_keys.get(did, base_key)

        if other_key in other_df.columns:
            counts = other_df[other_key].value_counts()
            if counts.max() > 1:
                warnings_list.append(f"Dataset '{names[did]}': column '{other_key}' has repeated values (max={int(counts.max())}). Will aggregate to prevent row duplication.")
                # Aggregate repeated rows
                num_cols = [c for c in other_df.columns if c != other_key and _infer_type(other_df[c])=="numeric"]
                agg_dict: Dict = {}
                for c in other_df.columns:
                    if c == other_key: continue
                    op = req.aggregations.get(c, "mean") if req.aggregations else "mean"
                    if _infer_type(other_df[c]) == "numeric":
                        agg_dict[c] = op
                    else:
                        agg_dict[c] = "first"
                other_df = other_df.groupby(other_key).agg(agg_dict).reset_index()

        if base_key != other_key:
            other_df = other_df.rename(columns={other_key: base_key})

        n_before = len(base_df)
        base_df = base_df.merge(other_df, on=base_key, how="left", suffixes=("","_dup"))
        dup_cols = [c for c in base_df.columns if c.endswith("_dup")]
        base_df = base_df.drop(columns=dup_cols)
        n_after = len(base_df)
        if n_after != n_before:
            warnings_list.append(f"Row count changed from {n_before} to {n_after} after merging '{names[did]}'. Check join key quality.")

    # Register the merged cohort
    cohort_id = hashlib.md5(("cohort"+str(datetime.now())).encode()).hexdigest()[:12]
    s = _schema(base_df)
    structure = _detect_data_structure(base_df, {"schema": s})
    _DATASETS[cohort_id] = {"df": base_df, "name": f"cohort_{'_'.join(req.dataset_ids[:3])}",
                             "uploaded_at": datetime.now(timezone.utc).isoformat(),
                             "schema": s, "fingerprint": _fp(base_df, cohort_id), "structure": structure}

    _log("Cohort Builder Agent", f"Merged {len(req.dataset_ids)} datasets", f"Result: {len(base_df)}r × {len(base_df.columns)}c")
    return {"cohort_dataset_id": cohort_id,
            "source_datasets": req.dataset_ids,
            "join_key_used": join_keys,
            "n_rows": len(base_df), "n_columns": len(base_df.columns),
            "columns": list(base_df.columns),
            "schema": s, "data_structure": structure,
            "warnings": warnings_list,
            "missing_after_merge": {c: int(base_df[c].isna().sum()) for c in base_df.columns if base_df[c].isna().any()},
            "next_step": f"Use dataset_id='{cohort_id}' for all subsequent analyses."}


@app.post("/meta-analysis")
async def run_meta_analysis(req: MultiDatasetRequest):
    """Run the same analysis across multiple datasets and synthesize."""
    results_per_dataset = []
    for did in req.dataset_ids:
        if did not in _DATASETS: continue
        df = _DATASETS[did]["df"]
        meta = _DATASETS[did]
        if req.outcome_col not in df.columns: continue
        num = _num_cols(df)
        predictors = [c for c in num if c != req.outcome_col][:3]
        dataset_results: Dict = {"dataset_id": did, "name": meta["name"], "n": len(df)}
        for pred in predictors:
            sub = df[[req.outcome_col, pred]].apply(pd.to_numeric, errors="coerce").dropna()
            if len(sub) < 10: continue
            X = sm.add_constant(sub[pred].values)
            m = sm.OLS(sub[req.outcome_col].values, X).fit()
            dataset_results[pred] = {
                "beta": _sf(m.params[1]), "se": _sf(m.bse[1]),
                "p": _sf(m.pvalues[1]), "r2": _sf(m.rsquared), "n": int(m.nobs)
            }
        results_per_dataset.append(dataset_results)

    # Simple fixed-effects meta-analysis on first predictor
    pooled: Dict = {}
    all_preds = set()
    for r in results_per_dataset:
        all_preds.update([k for k in r.keys() if k not in ["dataset_id","name","n"]])

    for pred in all_preds:
        betas = [r[pred]["beta"] for r in results_per_dataset if pred in r and r[pred]["beta"] is not None]
        ses   = [r[pred]["se"]   for r in results_per_dataset if pred in r and r[pred]["se"] is not None]
        if not betas: continue
        weights = [1/(s**2+1e-10) for s in ses]
        w_sum = sum(weights)
        pooled_beta = sum(w*b for w,b in zip(weights,betas))/w_sum
        pooled_se = math.sqrt(1/w_sum)
        z = pooled_beta / pooled_se
        p = 2*(1-scipy_stats.norm.cdf(abs(z)))
        # Heterogeneity (Q test)
        Q = sum(w*(b-pooled_beta)**2 for w,b in zip(weights,betas))
        df_q = len(betas)-1
        p_Q = 1 - scipy_stats.chi2.cdf(Q, df_q) if df_q>0 else None
        I2 = max(0, (Q-df_q)/Q*100) if Q>0 else 0
        pooled[pred] = {
            "pooled_beta": round(float(pooled_beta),4),
            "pooled_se": round(float(pooled_se),4),
            "z": _sf(z), "p": _sf(p),
            "ci_lower": round(float(pooled_beta-1.96*pooled_se),4),
            "ci_upper": round(float(pooled_beta+1.96*pooled_se),4),
            "Q_stat": _sf(Q), "Q_p": _sf(p_Q),
            "I2_pct": round(float(I2),1),
            "heterogeneity": "high" if I2>75 else "moderate" if I2>25 else "low",
            "n_studies": len(betas),
        }

    prompt = f"""A meta-analysis was run across {len(req.dataset_ids)} datasets for outcome '{req.outcome_col}'.
Pooled estimates: {json.dumps(pooled, default=str)[:1000]}
Individual dataset results: {json.dumps([{k:v for k,v in r.items() if k!="dataset_id"} for r in results_per_dataset], default=str)[:1000]}

Interpret the meta-analytic findings in 4-5 sentences. Address heterogeneity (I²), replication, and overall conclusions."""
    _log("Meta-Analysis Agent", f"{len(req.dataset_ids)} datasets", req.outcome_col)
    return {"outcome": req.outcome_col, "n_datasets": len(req.dataset_ids),
            "individual_results": results_per_dataset, "pooled_estimates": pooled,
            "interpretation": await gemini(prompt, system=RESEARCH_SYSTEM)}


# ══════════════════════════════════════════════════════════════════════════════
#  DIMENSIONALITY + NETWORK
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/umap")
async def run_umap(req: UMAPRequest):
    if not _HAS_UMAP:
        raise HTTPException(503, "umap-learn not installed")
    df = _get_df(req.dataset_id)
    num = _num_cols(df)[:20]
    sub = df[num].apply(pd.to_numeric, errors="coerce").dropna()
    X = StandardScaler().fit_transform(sub)
    reducer = umap.UMAP(n_components=req.n_components, n_neighbors=req.n_neighbors, random_state=42)
    embedding = reducer.fit_transform(X)
    return {"n_components": req.n_components, "n_samples": len(sub),
            "columns_used": num, "embedding": embedding.tolist()[:200]}


@app.post("/shap-analysis")
async def run_shap(req: SHAPRequest):
    """SHAP explainability for random forest model."""
    df = _get_df(req.dataset_id)
    num = _num_cols(df)
    preds = req.predictors if req.predictors else [c for c in num if c != req.outcome][:8]
    sub = df[[req.outcome]+preds].apply(pd.to_numeric, errors="coerce").dropna()
    X = sub[preds].values
    y = sub[req.outcome].values
    rf = RandomForestRegressor(n_estimators=100, random_state=42).fit(X, y)
    explainer = shap.TreeExplainer(rf)
    shap_vals = explainer.shap_values(X[:min(200, len(X))])
    mean_abs = {preds[i]: round(float(np.abs(shap_vals[:,i]).mean()),4) for i in range(len(preds))}
    mean_abs = dict(sorted(mean_abs.items(), key=lambda x:-x[1]))
    return {"outcome": req.outcome, "predictors": preds,
            "shap_mean_abs": mean_abs,
            "shap_values_sample": shap_vals[:10].tolist(),
            "feature_ranking": list(mean_abs.keys()),
            "top_feature": list(mean_abs.keys())[0],
            "note": "SHAP values explain model predictions, not causal effects."}


@app.post("/network-analysis")
async def run_network(req: NetworkRequest):
    """Build and analyze a network/graph from dataset."""
    df = _get_df(req.dataset_id)
    if req.source_col not in df.columns or req.target_col not in df.columns:
        raise HTTPException(400, "Source and target columns must exist")
    G = nx.from_pandas_edgelist(df, req.source_col, req.target_col,
                                 edge_attr=req.weight_col if req.weight_col else None)
    deg = dict(G.degree())
    centrality = nx.degree_centrality(G)
    try: between = nx.betweenness_centrality(G, normalized=True)
    except: between = {}
    try: clust = nx.clustering(G)
    except: clust = {}
    top_nodes = sorted(centrality.items(), key=lambda x:-x[1])[:10]
    return {"n_nodes": G.number_of_nodes(), "n_edges": G.number_of_edges(),
            "density": round(float(nx.density(G)),4),
            "is_connected": nx.is_connected(G),
            "n_components": nx.number_connected_components(G),
            "avg_degree": round(float(np.mean(list(deg.values()))),4),
            "top_nodes_by_centrality": [{"node": str(n), "centrality": round(float(c),4)} for n,c in top_nodes],
            "avg_clustering": round(float(np.mean(list(clust.values()))),4) if clust else None,
            "top_betweenness": sorted(between.items(), key=lambda x:-x[1])[:5] if between else []}


# ══════════════════════════════════════════════════════════════════════════════
#  POWER + SENSITIVITY + REPLICATION
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/power-planning")
async def power_planning(req: PowerPlanRequest):
    """Prospective power analysis — how many subjects do I need?"""
    za = scipy_stats.norm.ppf(1-req.alpha/2)
    zb = scipy_stats.norm.ppf(req.power)
    d = req.effect_size

    if req.test_type == "two_sample_t":
        n = math.ceil(2 * ((za+zb)/d)**2)
        result = {"n_per_group": n, "total_n": n*2}
    elif req.test_type == "one_sample_t":
        n = math.ceil(((za+zb)/d)**2)
        result = {"n_required": n}
    elif req.test_type == "correlation":
        n = math.ceil(((za+zb)/np.arctanh(d))**2 + 3)
        result = {"n_required": n}
    elif req.test_type == "anova":
        n_per = math.ceil(((za+zb)/d)**2 * 2)
        result = {"n_per_group": n_per, "total_n": n_per*req.n_groups, "n_groups": req.n_groups}
    else:
        n = math.ceil(2*((za+zb)/d)**2)
        result = {"n_required": n}

    # Power curve
    power_curve = {}
    for n_test in [20,30,50,80,100,150,200,300,500]:
        if req.test_type in ["two_sample_t","anova"]:
            zb_n = d*math.sqrt(n_test/2) - za
        else:
            zb_n = d*math.sqrt(n_test) - za
        power_curve[n_test] = round(max(0.,min(1.,float(scipy_stats.norm.cdf(zb_n)))),3)

    return {**result, "effect_size": d, "alpha": req.alpha, "target_power": req.power,
            "test_type": req.test_type, "power_curve": power_curve,
            "recommendation": f"Recruit at least {result.get('total_n', result.get('n_required','N/A'))} participants for {req.power*100:.0f}% power."}


@app.post("/sensitivity-analysis")
async def run_sensitivity(req: SensitivityRequest):
    """Run analysis under different model specifications + assumption violations."""
    df = _get_df(req.dataset_id)
    sub = df[[req.outcome]+req.predictors].apply(pd.to_numeric, errors="coerce").dropna()
    X = sub[req.predictors]; y = sub[req.outcome]

    results: Dict = {"outcome": req.outcome, "predictors": req.predictors, "models": {}}

    # OLS base
    Xc = sm.add_constant(X)
    m_ols = sm.OLS(y, Xc).fit()
    results["models"]["ols"] = {p: {"coef": _sf(m_ols.params[p]), "p": _sf(m_ols.pvalues[p])} for p in req.predictors if p in m_ols.params}

    # Ridge
    ridge = Ridge(alpha=1.0).fit(X, y)
    results["models"]["ridge_alpha1"] = {req.predictors[i]: {"coef": round(float(ridge.coef_[i]),4)} for i in range(len(req.predictors))}

    # Lasso
    try:
        lasso = Lasso(alpha=0.1, max_iter=5000).fit(X, y)
        results["models"]["lasso_alpha01"] = {req.predictors[i]: {"coef": round(float(lasso.coef_[i]),4)} for i in range(len(req.predictors))}
    except: pass

    # Outlier-removed
    z = np.abs(scipy_stats.zscore(sub))
    clean = sub[(z<3).all(axis=1)]
    Xc2 = sm.add_constant(clean[req.predictors])
    try:
        m_clean = sm.OLS(clean[req.outcome], Xc2).fit()
        results["models"]["ols_no_outliers"] = {p: {"coef": _sf(m_clean.params[p]), "p": _sf(m_clean.pvalues[p])} for p in req.predictors if p in m_clean.params}
        results["n_removed"] = len(sub)-len(clean)
    except: pass

    # Bootstrapped CIs
    boot_coefs = {p: [] for p in req.predictors}
    for _ in range(500):
        idx = np.random.choice(len(sub), len(sub), replace=True)
        bs = sub.iloc[idx]
        Xb = sm.add_constant(bs[req.predictors])
        try:
            mb = sm.OLS(bs[req.outcome], Xb).fit()
            for p in req.predictors:
                if p in mb.params:
                    boot_coefs[p].append(float(mb.params[p]))
        except: pass
    results["bootstrap_cis"] = {p: {
        "ci_lower": round(float(np.percentile(boot_coefs[p],2.5)),4) if boot_coefs[p] else None,
        "ci_upper": round(float(np.percentile(boot_coefs[p],97.5)),4) if boot_coefs[p] else None,
    } for p in req.predictors}

    # Stability check
    stable = {}
    for p in req.predictors:
        ols_coef = results["models"]["ols"].get(p,{}).get("coef")
        ridge_coef = results["models"].get("ridge_alpha1",{}).get(p,{}).get("coef")
        lasso_coef = results["models"].get("lasso_alpha01",{}).get(p,{}).get("coef")
        clean_coef = results["models"].get("ols_no_outliers",{}).get(p,{}).get("coef")
        coefs = [c for c in [ols_coef,ridge_coef,lasso_coef,clean_coef] if c is not None]
        if len(coefs)>1:
            consistent_sign = len(set([1 if c>0 else -1 for c in coefs]))==1
            cv_pct = float(np.std(coefs)/(abs(np.mean(coefs))+1e-10)*100)
            stable[p] = {"sign_consistent": consistent_sign, "coef_cv_pct": round(cv_pct,1),
                          "verdict": "stable" if consistent_sign and cv_pct<50 else "unstable — interpret with caution"}
    results["stability"] = stable

    prompt = f"""Sensitivity analysis for predicting '{req.outcome}' with {req.predictors}.
Stability results: {json.dumps(stable, default=str)}
Bootstrap CIs: {json.dumps(results['bootstrap_cis'], default=str)}
Models compared: OLS, Ridge, Lasso, OLS without outliers.

In 3-4 sentences, tell the researcher which results are robust vs fragile, and what this means for interpretation."""
    results["interpretation"] = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("Sensitivity Agent", f"{req.outcome} ~ {req.predictors}")
    return results


@app.post("/replication-check")
async def replication_check(req: ReplicationRequest):
    """Run the same analysis on a new dataset and compare results."""
    df = _get_df(req.target_dataset_id)
    sub = df[[req.outcome]+req.predictors].apply(pd.to_numeric, errors="coerce").dropna()
    Xc = sm.add_constant(sub[req.predictors])
    m = sm.OLS(sub[req.outcome], Xc).fit()

    try: original = json.loads(req.analysis_json)
    except: original = {}

    new_results = {p: {"coef": _sf(m.params[p]), "p": _sf(m.pvalues[p]),
                        "significant": bool(m.pvalues[p]<0.05)} for p in req.predictors if p in m.params}

    comparison = {}
    for p in req.predictors:
        orig_coef = original.get(p,{}).get("coef") or original.get("coefficients",{}).get(p)
        new_coef = new_results.get(p,{}).get("coef")
        if orig_coef and new_coef:
            same_sign = (orig_coef>0)==(new_coef>0)
            pct_diff = abs(new_coef-orig_coef)/(abs(orig_coef)+1e-10)*100
            comparison[p] = {"original_coef": orig_coef, "replication_coef": new_coef,
                              "same_sign": same_sign, "pct_diff": round(pct_diff,1),
                              "replicates": same_sign and pct_diff<50}

    prompt = f"""Replication check for predicting '{req.outcome}' in a new dataset.
Original analysis: {req.analysis_json[:500]}
New dataset (n={len(sub)}) results: {json.dumps(new_results, default=str)}
Comparison: {json.dumps(comparison, default=str)}

In 3-4 sentences, assess how well the findings replicate. What does this tell us about generalizability?"""
    _log("Replication Agent", req.target_dataset_id, req.outcome)
    return {"target_dataset_id": req.target_dataset_id, "outcome": req.outcome,
            "new_n": int(len(sub)), "new_results": new_results,
            "replication_comparison": comparison,
            "interpretation": await gemini(prompt, system=RESEARCH_SYSTEM)}


# ══════════════════════════════════════════════════════════════════════════════
#  ADVERSARIAL PEER REVIEWER  ← KEY DIFFERENTIATOR
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/peer-review")
async def adversarial_peer_review(req: ReviewRequest):
    """Adversarial peer reviewer that critiques analysis like a hostile reviewer."""
    df = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    struct = meta["structure"]

    prompt = f"""You are a hostile but fair peer reviewer at a top statistics journal.
A researcher has run an analysis and claims the following conclusions:

"{req.claimed_conclusions}"

Their analysis details:
{req.analysis_json[:3000]}

Dataset structure:
- N = {len(df)}, columns = {len(df.columns)}
- Repeated measures: {struct.get('has_repeated_measures')}
- Data hierarchy: {struct.get('hierarchy_variable')}
- Missing data: {struct.get('missingness_pct')}%
- Recommended model: {struct.get('recommended_model_family')}

Write a detailed peer review critique in the style of a tough but fair Reviewer 2. Cover:

1. **Statistical validity** — Are the chosen tests appropriate? Are assumptions checked?
2. **Model specification** — Is the model correctly specified for the data structure?
3. **Causal claims** — Is the researcher overclaiming causality? What confounders are unaddressed?
4. **Effect sizes and power** — Are effect sizes meaningful? Is the study adequately powered?
5. **Missing data** — How might missing data bias results?
6. **Multiple comparisons** — Is there a multiple testing problem?
7. **Generalizability** — Can these results generalize beyond this sample?
8. **Required revisions** — List 3-5 specific changes required before publication.

Be specific. Reference actual numbers and column names where possible. Do not be sycophantic."""

    critique = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("Peer Review Agent", "Adversarial review", req.claimed_conclusions[:80])
    return {"dataset_id": req.dataset_id, "claimed_conclusions": req.claimed_conclusions,
            "peer_review_critique": critique,
            "disclaimer": "This is an AI-generated critique to help identify weaknesses before human peer review."}


# ══════════════════════════════════════════════════════════════════════════════
#  FULL ANALYSIS PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    df = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    schema = meta["schema"]
    struct = meta["structure"]
    num = [c["name"] for c in schema if c["type"]=="numeric"]
    cat = [c["name"] for c in schema if c["type"]=="categorical"]

    out: Dict = {"dataset_id": req.dataset_id, "filename": meta["name"], "goal": req.goal,
                  "n_rows": len(df), "n_cols": len(df.columns),
                  "data_structure": struct,
                  "analysis_timestamp": datetime.now(timezone.utc).isoformat()}

    best_pair = (num[0], num[1]) if len(num)>=2 else (None, None)

    if len(num) >= 2:
        top_n = min(req.max_correlations, len(num))
        corr = _pearson_matrix(df, num[:top_n])
        out["correlation_matrix"] = corr
        mat = np.array(corr["pearson"])
        np.fill_diagonal(mat, 0)
        idx = np.unravel_index(np.argmax(np.abs(mat)), mat.shape)
        best_pair = (num[idx[0]], num[idx[1]])
        out["strongest_correlation"] = {"col_a": best_pair[0], "col_b": best_pair[1],
                                         "r_pearson": round(float(mat[idx]),4),
                                         "p": corr["pvalues"][idx[0]][idx[1]]}
        _log("Correlation Agent", f"Pearson+Spearman matrix {top_n} cols")

    if req.run_regression and best_pair[0]:
        x = pd.to_numeric(df[best_pair[0]], errors="coerce").dropna()
        y = pd.to_numeric(df[best_pair[1]], errors="coerce").dropna()
        n = min(len(x),len(y))
        out["regression"] = _linear_regression(x.values[:n], y.values[:n], best_pair[0], best_pair[1])
        _log("Regression Agent", f"OLS {best_pair[1]} ~ {best_pair[0]}")

    if req.run_normality and num:
        out["normality_tests"] = [_normality(df[c], c) for c in num[:5]]
        _log("Normality Agent", f"SW+KS+JB {min(5,len(num))} cols")

    if num:
        out["outlier_detection"] = [_outlier_full(df[c], c, req.outlier_zscore_threshold) for c in num[:5]]
        _log("Outlier Agent", f"Z-score+IQR {min(5,len(num))} cols")

    if req.run_isolation_forest and len(num)>=2:
        out["isolation_forest"] = _isolation_forest(df, num[:8])
        _log("Isolation Forest", "Multivariate anomaly detection")

    if cat and num:
        ttests = []
        for cc in cat[:2]:
            for nc in num[:2]:
                groups = {str(g): pd.to_numeric(grp[nc],errors="coerce").dropna().values for g,grp in df.groupby(cc)}
                gkeys = [k for k,v in groups.items() if len(v)>=5]
                if len(gkeys)>=2:
                    t = _welch_ttest(groups[gkeys[0]], groups[gkeys[1]], gkeys[0], gkeys[1])
                    if req.run_power_analysis:
                        t["power_analysis"] = _power_analysis_posthoc(groups[gkeys[0]], groups[gkeys[1]])
                    ttests.append(t)
        out["group_comparisons"] = ttests
        _log("T-Test Agent", f"{len(ttests)} group comparisons")

    if cat and num:
        out["anova"] = _anova(df, cat[0], num[0])
        _log("ANOVA Agent", f"ANOVA {num[0]} by {cat[0]}")

    if len(cat)>=2:
        out["chi_square"] = _chi_square(df, cat[0], cat[1])
        _log("Chi-Square Agent", f"{cat[0]} × {cat[1]}")

    if req.run_clustering and len(num)>=2:
        out["clustering"] = _kmeans_full(df, num[:6], req.kmeans_k)
        _log("Clustering Agent", f"K-Means k={req.kmeans_k}")

    if req.run_pca and len(num)>=2:
        out["pca"] = _pca_full(df, num[:10], 3)
        _log("PCA Agent", f"PCA {min(10,len(num))} cols")

    if req.run_rf and len(num)>=3:
        out["feature_importance"] = _rf_importance(df, num[:8])
        _log("RF Agent", "Random Forest + permutation importance")

    # Model recommendation based on structure
    out["model_recommendation"] = {
        "recommended": struct["recommended_model_family"],
        "reason": (
            f"Repeated measures detected (avg {struct['avg_obs_per_subject']} obs/subject). Use LMM via POST /lmm"
            if struct["has_repeated_measures"]
            else f"Hierarchical variable '{struct['hierarchy_variable']}' detected. Consider multilevel model."
            if struct["hierarchy_variable"]
            else "Cross-sectional data. OLS/GLM appropriate if assumptions met."
        )
    }

    schema_summary = ", ".join(f"{c['name']} ({c['type']})" for c in schema[:10])
    methods_prompt = f"""Write a concise academic Methods section (4-5 sentences) for:
Dataset: {meta['name']}, N={len(df)}, Columns: {schema_summary}
Goal: "{req.goal or 'exploratory data analysis'}"
Tests run: Pearson+Spearman correlation, Welch t-test+Mann-Whitney, One-way ANOVA+Kruskal-Wallis,
Tukey HSD post-hoc, Chi-square, OLS regression (with Durbin-Watson, residual normality),
Random Forest + permutation importance (5-fold CV), K-Means clustering (silhouette+CH index),
Isolation Forest anomaly detection, PCA. Significance: α=0.05. Software: Python 3.12, scipy, scikit-learn, statsmodels, pandas.
Use passive voice. Be publication-ready."""
    out["ai_methods_section"] = await gemini(methods_prompt, system=RESEARCH_SYSTEM)
    out["audit_log"] = _AUDIT[-30:]
    return out


# ══════════════════════════════════════════════════════════════════════════════
#  AI LAYERS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/ask")
async def ask_question(req: AskRequest):
    df = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    ctx = f"""Dataset: {meta['name']}, N={len(df)}, {len(df.columns)} columns
Columns: {', '.join(f"{c['name']} ({c['type']})" for c in meta['schema'])}
Sample (first 3 rows):
{df.head(3).to_string()}
Summary statistics:
{df.describe(include='all').to_string()[:2000]}"""

    prompt = f"""{ctx}

Researcher question: {req.question}

Answer as a senior biostatistician. Reference actual column names. If statistical analysis would help, specify exactly which test and why. Flag any concerns about the data or question."""
    answer = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("AI Q&A", req.question[:80])
    return {"question": req.question, "answer": answer}


@app.post("/generate-report")
async def generate_report(req: ReportRequest):
    df = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    struct = meta["structure"]
    prompt = f"""Write a complete, publication-ready academic research report.

Dataset: {meta['name']} ({len(df)} rows × {len(df.columns)} cols)
Goal: {req.goal or 'exploratory data analysis'}
Columns: {', '.join(df.columns.tolist()[:15])}
Data structure: {json.dumps(struct, indent=2)}
Key findings: {req.findings_json[:3000] if req.findings_json else 'Not provided — generate based on dataset context'}

Structure:
1. Title
2. Abstract (200 words)
3. Introduction (background, motivation, gap in literature)
4. Methods (data, statistical procedures, software, α level)
5. Results (findings with specific statistics: β, 95% CI, p-values, effect sizes)
6. Discussion (interpretation, mechanisms, limitations, confounds)
7. Conclusion
8. Suggested Future Work (3 concrete next steps)

Use formal academic language. Acknowledge assumptions. Never overclaim causality from observational data."""
    report = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("Report Agent", meta["name"])
    return {"dataset_id": req.dataset_id, "goal": req.goal, "report": report,
            "generated_at": datetime.now(timezone.utc).isoformat()}


@app.post("/suggest-tests")
async def suggest_tests(req: SuggestTestsRequest):
    df = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    struct = meta["structure"]
    col_summary = "\n".join(f"  - {c['name']} ({c['type']}): {c['stats']}" for c in meta["schema"][:15])
    prompt = f"""You are a biostatistician. Recommend statistical tests for this dataset.

Dataset: {meta['name']} ({len(df)} rows)
Goal: {req.goal or 'exploratory analysis'}
Data structure: {json.dumps(struct, indent=2)}
Columns:
{col_summary}

For each recommendation provide:
1. Test name and why it's appropriate for this data structure
2. Exact columns to use
3. Assumptions to verify first (and how to check them)
4. How to interpret results
5. What to do if assumptions fail (non-parametric alternative)

Prioritize by importance. If repeated measures are present, recommend LMM. If time-to-event, recommend survival. Be specific."""
    suggestions = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("Test Selector Agent", req.goal or "EDA")
    return {"suggestions": suggestions, "data_structure": struct}


@app.post("/explain-insight")
async def explain_insight(req: ExplainInsightRequest):
    audiences = {
        "layman": "a non-technical person with no statistics background. Use analogies and plain language.",
        "expert": "a statistics expert. Use precise technical language, effect sizes, assumptions, and methodological caveats.",
        "executive": "a business executive. Focus on practical implications, decisions enabled, and risks. No equations.",
        "clinician": "a medical doctor. Focus on clinical significance, effect sizes, and patient-level implications.",
    }
    prompt = f"""Explain this statistical finding to {audiences.get(req.audience, audiences['layman'])}

Finding: {req.insight_title}
Details: {req.insight_summary}

Write 3-4 clear, specific, actionable sentences."""
    return {"explanation": await gemini(prompt, system=RESEARCH_SYSTEM), "audience": req.audience}


@app.post("/forecast")
async def forecast(req: ForecastRequest):
    df = _get_df(req.dataset_id)
    if req.value_column not in df.columns:
        raise HTTPException(400, f"Column '{req.value_column}' not found")
    series = pd.to_numeric(df[req.value_column], errors="coerce").dropna()
    result = _forecast_arima(series, req.periods)
    prompt = f"""Time series forecast for '{req.value_column}' ({len(series)} observations), method: {result['method']}.
Stationary: {result['stationary']} (ADF p={result['adf_p']}).
Forecast ({req.periods} periods): {result['forecast'][:6]}...

Interpret in 2-3 sentences. Note trend, uncertainty, and extrapolation risks."""
    result["ai_narrative"] = await gemini(prompt, system=RESEARCH_SYSTEM)
    _log("Forecast Agent", f"ARIMA {req.value_column} +{req.periods}")
    return result


@app.post("/compare-datasets")
async def compare_datasets(req: CompareRequest):
    da = _get_df(req.dataset_id_a); db = _get_df(req.dataset_id_b)
    if req.column not in da.columns or req.column not in db.columns:
        raise HTTPException(400, f"Column '{req.column}' must exist in both datasets")
    a = pd.to_numeric(da[req.column],errors="coerce").dropna().values
    b = pd.to_numeric(db[req.column],errors="coerce").dropna().values
    t = _welch_ttest(a, b, _DATASETS[req.dataset_id_a]["name"], _DATASETS[req.dataset_id_b]["name"])
    ks, ksp = scipy_stats.ks_2samp(a, b)
    power = _power_analysis_posthoc(a, b)
    prompt = f"""Comparing '{req.column}' between two datasets.
A (n={len(a)}): mean={t['mean_a']}, std={t['std_a']}
B (n={len(b)}): mean={t['mean_b']}, std={t['std_b']}
Welch t: t={t['t_stat']}, p={t['p_value']}, Cohen's d={t['cohens_d']}
KS test: D={round(float(ks),4)}, p={round(float(ksp),4)}
Power: {power['observed_power']}

Summarise in 2-3 sentences."""
    return {"column": req.column, "t_test": t,
            "ks_test": {"statistic": _sf(ks), "p_value": _sf(ksp), "same_distribution": bool(ksp>0.05)},
            "power_analysis": power, "ai_summary": await gemini(prompt, system=RESEARCH_SYSTEM)}


@app.post("/pca")
async def run_pca(req: PCARequest):
    df = _get_df(req.dataset_id)
    num = _num_cols(df)
    if len(num)<2: raise HTTPException(400,"Need ≥2 numeric columns")
    return _pca_full(df, num, req.n_components)

@app.post("/anova")
async def run_anova(req: AnovaRequest):
    df = _get_df(req.dataset_id)
    return _anova(df, req.group_column, req.value_column)

@app.post("/chi-square")
async def run_chi(req: ChiSquareRequest):
    df = _get_df(req.dataset_id)
    return _chi_square(df, req.column_a, req.column_b)

@app.post("/power-analysis")
async def run_power(req: PowerRequest):
    df = _get_df(req.dataset_id)
    groups = {str(g): pd.to_numeric(grp[req.value_column],errors="coerce").dropna().values for g,grp in df.groupby(req.group_column) if len(grp)>=5}
    gk = list(groups.keys())
    if len(gk)<2: raise HTTPException(400,"Need ≥2 groups with n≥5")
    return _power_analysis_posthoc(groups[gk[0]], groups[gk[1]], req.alpha)


# ══════════════════════════════════════════════════════════════════════════════
#  WORKSPACES
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/workspaces")
async def create_workspace(req: WorkspaceCreateRequest):
    wid = hashlib.md5((req.name+str(datetime.now())).encode()).hexdigest()[:10]
    _WORKSPACES[wid] = {"name": req.name, "description": req.description,
                         "datasets": [], "analyses": [],
                         "created_at": datetime.now(timezone.utc).isoformat()}
    return {"workspace_id": wid, "name": req.name}

@app.post("/workspaces/add-dataset")
async def workspace_add_dataset(req: WorkspaceAddDatasetRequest):
    if req.workspace_id not in _WORKSPACES: raise HTTPException(404, "Workspace not found")
    if req.dataset_id not in _DATASETS: raise HTTPException(404, "Dataset not found")
    _WORKSPACES[req.workspace_id]["datasets"].append(req.dataset_id)
    return {"workspace_id": req.workspace_id, "datasets": _WORKSPACES[req.workspace_id]["datasets"]}

@app.get("/workspaces/{workspace_id}")
def get_workspace(workspace_id: str):
    if workspace_id not in _WORKSPACES: raise HTTPException(404, "Workspace not found")
    w = _WORKSPACES[workspace_id]
    return {**w, "dataset_details": [{"id": d, "name": _DATASETS[d]["name"], "rows": len(_DATASETS[d]["df"])} for d in w["datasets"] if d in _DATASETS]}

@app.get("/workspaces")
def list_workspaces():
    return {"workspaces": [{"workspace_id": k, **{kk:vv for kk,vv in v.items() if kk!="analyses"}} for k,v in _WORKSPACES.items()]}


# ══════════════════════════════════════════════════════════════════════════════
#  MISC
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/datasets")
def list_datasets():
    return {"datasets": [{"dataset_id": k, "filename": v["name"],
                           "rows": len(v["df"]), "columns": len(v["df"].columns),
                           "uploaded_at": v["uploaded_at"], "fingerprint": v["fingerprint"],
                           "model_recommendation": v["structure"]["recommended_model_family"]} for k,v in _DATASETS.items()]}

@app.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str):
    if dataset_id not in _DATASETS: raise HTTPException(404, "Dataset not found")
    del _DATASETS[dataset_id]
    return {"deleted": dataset_id}

@app.get("/study-plans/{plan_id}")
def get_study_plan(plan_id: str):
    if plan_id not in _STUDY_PLANS: raise HTTPException(404, "Plan not found")
    return _STUDY_PLANS[plan_id]

@app.get("/hypotheses/{dataset_id}")
def get_hypotheses(dataset_id: str):
    return {"dataset_id": dataset_id, "hypotheses": _HYPOTHESES.get(dataset_id, [])}

@app.get("/audit-log")
def audit_log(limit: int = 50):
    return {"log": _AUDIT[-limit:], "total": len(_AUDIT)}


# ══════════════════════════════════════════════════════════════════════════════
#  AI JOIN STRATEGY ANALYZER
# ══════════════════════════════════════════════════════════════════════════════

class JoinStrategyRequest(BaseModel):
    dataset_ids: List[str]

@app.post("/analyze-join-strategy")
async def analyze_join_strategy(req: JoinStrategyRequest):
    """Ask Gemini to analyze dataset schemas and recommend join strategy."""
    if len(req.dataset_ids) < 2:
        raise HTTPException(400, "Provide at least 2 dataset IDs")
    for did in req.dataset_ids:
        if did not in _DATASETS:
            raise HTTPException(404, f"Dataset '{did}' not found")

    # Build schema description for each dataset
    schema_parts = []
    for did in req.dataset_ids:
        meta = _DATASETS[did]
        df = meta["df"]
        schema = meta["schema"]

        col_details = []
        for c in schema[:30]:  # cap at 30 cols so prompt stays manageable
            s = c["stats"]
            if c["type"] == "numeric":
                detail = f"  - {c['name']} (numeric): mean={s.get('mean')}, range=[{s.get('min')}, {s.get('max')}]"
            elif c["type"] == "categorical":
                top = list(s.get("top_values", {}).keys())[:4]
                detail = f"  - {c['name']} (categorical): {s.get('unique')} unique, sample values: {top}"
            else:
                detail = f"  - {c['name']} ({c['type']})"
            col_details.append(detail)

        if len(schema) > 30:
            col_details.append(f"  ... and {len(schema)-30} more columns")

        # For wide datasets, show first few column names which may be sample IDs
        if len(df.columns) > 20:
            first_cols = list(df.columns[:8])
            col_details.append(f"  [First 8 column headers: {first_cols}]")

        schema_parts.append(
            f"Dataset: \"{meta['name']}\" (dataset_id: {did})\n"
            f"Shape: {len(df)} rows × {len(df.columns)} columns\n"
            f"Columns:\n" + "\n".join(col_details)
        )

    schema_summary = "\n\n---\n\n".join(schema_parts)

    prompt = f"""You are a biostatistician analyzing research datasets to determine how to merge them safely.

{schema_summary}

Determine the best join strategy. Return ONLY valid JSON with no markdown, no explanation outside the JSON:

{{
  "strategy": "join" | "pivot_then_join" | "analyze_separately",
  "join_pairs": [
    {{
      "dataset_a_id": "exact dataset_id string",
      "dataset_b_id": "exact dataset_id string",
      "key_a": "exact column name in dataset_a",
      "key_b": "exact column name in dataset_b",
      "join_type": "left" | "inner" | "outer"
    }}
  ],
  "reasoning": "2-3 sentence plain English explanation of the strategy and why",
  "warnings": ["list of specific warnings about row duplication, missingness, wide format issues, etc"],
  "recommended_anchor_id": "dataset_id of the best base/left table",
  "cannot_join_ids": ["dataset_ids that are wide-format matrices or otherwise not directly joinable"],
  "next_steps": "What to do after joining — e.g. which analysis to run first"
}}

Critical rules:
- If a dataset has sample run names as COLUMN HEADERS (wide format, e.g. 160 columns that look like sample IDs), put it in cannot_join_ids — it needs to be pivoted first, not directly joined
- Use the exact dataset_id strings provided above, not filenames
- Warn explicitly if a join would cause row multiplication (one-to-many)
- For proteomics data: long-format protein tables join to sample metadata on sample ID columns; wide matrices do not join directly
- Be specific: name the exact column to use as the join key in each dataset"""

    raw = await gemini(prompt, system=RESEARCH_SYSTEM)

    try:
        # Strip markdown fences if Gemini added them
        clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        plan = json.loads(clean)
    except Exception:
        # Return raw if JSON parsing fails so frontend can still show something
        plan = {"raw_response": raw, "error": "Could not parse structured plan — see raw_response"}

    _log("Join Strategy Agent", f"Analyzed {len(req.dataset_ids)} datasets")
    return {"plan": plan, "datasets_analyzed": len(req.dataset_ids)}

@app.post("/suggest-questions")
async def suggest_questions(req: SuggestQuestionsRequest):
    """
    Called right after upload. Reads schemas of all uploaded datasets and
    returns 5-8 plain-English questions the user might want to answer,
    each tagged with question_type + pre-filled column suggestions.
    """
    if not req.dataset_ids:
        raise HTTPException(400, "Provide at least one dataset_id")
 
    schema_parts = []
    for did in req.dataset_ids:
        if did not in _DATASETS:
            continue
        meta  = _DATASETS[did]
        df    = meta["df"]
        s     = meta["schema"]
        struct = meta["structure"]
 
        col_lines = []
        for c in s[:25]:
            st = c["stats"]
            if c["type"] == "numeric":
                col_lines.append(
                    f"  - {c['name']} (numeric): mean={st.get('mean')}, "
                    f"range=[{st.get('min')}, {st.get('max')}]"
                )
            elif c["type"] == "categorical":
                top = list(st.get("top_values", {}).keys())[:4]
                col_lines.append(
                    f"  - {c['name']} (categorical): {st.get('unique')} unique values, "
                    f"e.g. {top}"
                )
            else:
                col_lines.append(f"  - {c['name']} ({c['type']})")
 
        schema_parts.append(
            f'Dataset: "{meta["name"]}" ({len(df)} rows × {len(df.columns)} cols)\n'
            f"Structure hint: {struct['recommended_model_family']}\n"
            f"Columns:\n" + "\n".join(col_lines)
        )
 
    combined = "\n\n---\n\n".join(schema_parts)
 
    prompt = f"""A researcher just uploaded these datasets:
 
{combined}
 
Generate 5-8 specific, plain-English questions they might want to answer with this data.
Return ONLY a valid JSON array. Each item must have:
- "question": plain English question (e.g. "Do protein levels differ between disease and healthy samples?")
- "question_type": one of [compare_groups, find_patterns, predict_outcome, test_correlation, full_explore]
- "category_label": human label for the group, one of ["Comparing groups", "Finding patterns", "Predicting outcomes", "Testing a relationship", "Explore everything"]
- "suggested_outcome_col": exact column name that is the outcome/dependent variable (or null)
- "suggested_group_col": exact column name to use as grouping variable (or null)
- "suggested_predictor_col": exact column name to use as predictor (or null)
- "why": one sentence explaining why this question is interesting for this specific data
- "relevant_dataset_id": which dataset_id this question applies to
- "beginner_friendly": true if this is a good starting point for someone unfamiliar with the data
 
Rules:
- Use actual column names from the datasets above
- At least 2 questions should be beginner_friendly: true
- Questions should be specific to THIS data, not generic
- Do not repeat the same question_type more than 3 times
- Return only valid JSON array, no markdown, no extra text"""
 
    raw = await gemini(prompt, system=RESEARCH_SYSTEM)
    try:
        clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        questions = json.loads(clean)
    except Exception:
        questions = [{"raw": raw, "error": "Could not parse — see raw"}]
 
    _log("Suggest Questions Agent", f"{len(req.dataset_ids)} datasets",
         f"Generated {len(questions) if isinstance(questions, list) else 0} questions")
    return {
        "dataset_ids": req.dataset_ids,
        "questions": questions,
        "n_questions": len(questions) if isinstance(questions, list) else 0,
    }
 
 
@app.post("/quick-explore")
async def quick_explore(req: QuickExploreRequest):
    """
    Question-driven analysis. Runs ONLY the tests relevant to the chosen
    question_type + columns, then returns results + a plain-English walkthrough.
    """
    df   = _get_df(req.dataset_id)
    meta = _DATASETS[req.dataset_id]
    struct = meta["structure"]
    schema = meta["schema"]
    num  = [c["name"] for c in schema if c["type"] == "numeric"]
    cat  = [c["name"] for c in schema if c["type"] == "categorical"]
 
    result: Dict = {
        "dataset_id": req.dataset_id,
        "question_type": req.question_type,
        "analyses_run": [],
        "findings": {},
        "walkthrough": [],   # list of {step, title, plain_english, data}
    }
 
    # ── compare_groups ────────────────────────────────────────────────────────
    if req.question_type == "compare_groups":
        gc = req.group_col   or (cat[0] if cat else None)
        vc = req.outcome_col or (num[0] if num else None)
        if not gc or not vc:
            raise HTTPException(400, "Need a group column and a value column for compare_groups")
 
        anova_res = _anova(df, gc, vc)
        result["findings"]["anova"] = anova_res
        result["analyses_run"].append("ANOVA + Kruskal-Wallis + Tukey HSD")
 
        # also t-test between top 2 groups
        groups = {str(g): pd.to_numeric(grp[vc], errors="coerce").dropna().values
                  for g, grp in df.groupby(gc) if len(grp) >= 5}
        gkeys = list(groups.keys())
        if len(gkeys) >= 2:
            tt = _welch_ttest(groups[gkeys[0]], groups[gkeys[1]], gkeys[0], gkeys[1])
            tt["power"] = _power_analysis_posthoc(groups[gkeys[0]], groups[gkeys[1]])
            result["findings"]["ttest"] = tt
            result["analyses_run"].append("Welch t-test + Mann-Whitney + power analysis")
 
        prompt = f"""A researcher asked: "Do values of '{vc}' differ across groups in '{gc}'?"
 
ANOVA result: F={anova_res.get('f_statistic')}, p={anova_res.get('p_value')}, η²={anova_res.get('eta_squared')} ({anova_res.get('effect_size')} effect)
Groups: {json.dumps(anova_res.get('group_stats', {}), default=str)[:600]}
Tukey HSD post-hoc: {json.dumps(anova_res.get('tukey_hsd', [])[:4], default=str)}
 
Write a plain-English walkthrough in EXACTLY this JSON array format — 3 steps:
[
  {{"step": 1, "title": "What we tested", "text": "...one sentence describing the test in plain language..."}},
  {{"step": 2, "title": "What we found", "text": "...the key finding in plain language, mention specific group names and direction of difference..."}},
  {{"step": 3, "title": "What this means", "text": "...practical interpretation + caveats, no jargon..."}}
]
Return only valid JSON array."""
 
    # ── find_patterns ─────────────────────────────────────────────────────────
    elif req.question_type == "find_patterns":
        cols = num[:8]
        if len(cols) < 2:
            raise HTTPException(400, "Need at least 2 numeric columns for pattern finding")
 
        pca_res = _pca_full(df, cols, 3)
        km_res  = _kmeans_full(df, cols[:6], 3)
        result["findings"]["pca"] = pca_res
        result["findings"]["clustering"] = km_res
        result["analyses_run"].extend(["PCA (3 components)", "K-Means clustering (k=3)"])
 
        prompt = f"""A researcher asked: "Are there hidden patterns or groupings in my data?"
 
PCA: Top 3 components explain {pca_res['cumulative_variance'][-1]*100:.1f}% of variance.
PC1 top loadings: {sorted(pca_res['loadings']['PC1'].items(), key=lambda x: -abs(x[1]))[:3]}
Clustering (k=3): silhouette={km_res['silhouette_score']}, cluster sizes={[c['n'] for c in km_res['cluster_stats']]}
Cluster means: {json.dumps([{{'cluster': c['cluster'], 'n': c['n'], 'means': dict(list(c['means'].items())[:3])}} for c in km_res['cluster_stats']], default=str)}
 
Write a plain-English walkthrough in EXACTLY this JSON array format — 3 steps:
[
  {{"step": 1, "title": "What we tested", "text": "..."}},
  {{"step": 2, "title": "What we found", "text": "...mention actual cluster sizes, what PC1 captures..."}},
  {{"step": 3, "title": "What this means", "text": "...practical interpretation + what to do next..."}}
]
Return only valid JSON array."""
 
    # ── predict_outcome ───────────────────────────────────────────────────────
    elif req.question_type == "predict_outcome":
        vc   = req.outcome_col or (num[0] if num else None)
        if not vc:
            raise HTTPException(400, "Need an outcome column for predict_outcome")
        feats = [c for c in num if c != vc][:6]
        if not feats:
            raise HTTPException(400, "Need at least 1 predictor column")
 
        rf_res = _rf_importance(df, [vc] + feats)
        result["findings"]["feature_importance"] = rf_res
        result["analyses_run"].append("Random Forest + permutation importance (5-fold CV)")
 
        # also top correlation
        corr_res = _pearson_matrix(df, [vc] + feats[:4])
        result["findings"]["correlations"] = corr_res
        result["analyses_run"].append("Pearson + Spearman correlations")
 
        prompt = f"""A researcher asked: "Which variables best predict '{vc}'?"
 
Random Forest (200 trees, 5-fold CV):
- R² train={rf_res.get('r2_train')}, R² CV={rf_res.get('r2_cv_mean')} ± {rf_res.get('r2_cv_std')}
- Top predictors by permutation importance: {dict(list(rf_res.get('permutation_importance', {{}}).items())[:4])}
- Gini importance: {dict(list(rf_res.get('gini_importance', {{}}).items())[:4])}
 
Write a plain-English walkthrough in EXACTLY this JSON array format — 3 steps:
[
  {{"step": 1, "title": "What we tested", "text": "..."}},
  {{"step": 2, "title": "What we found", "text": "...name top predictors, explain what R² means in plain terms..."}},
  {{"step": 3, "title": "What this means", "text": "...practical interpretation, caution about causation vs prediction..."}}
]
Return only valid JSON array."""
 
    # ── test_correlation ──────────────────────────────────────────────────────
    elif req.question_type == "test_correlation":
        c1 = req.predictor_col or (num[0] if len(num) > 0 else None)
        c2 = req.outcome_col   or (num[1] if len(num) > 1 else None)
        if not c1 or not c2:
            raise HTTPException(400, "Need two numeric columns for correlation")
 
        sub = df[[c1, c2]].apply(pd.to_numeric, errors="coerce").dropna()
        r_p, p_p = scipy_stats.pearsonr(sub[c1], sub[c2])
        r_s, p_s = spearmanr(sub[c1], sub[c2])
        reg = _linear_regression(sub[c1].values, sub[c2].values, c1, c2)
 
        result["findings"]["pearson"]  = {"r": round(float(r_p), 4), "p": _sf(p_p)}
        result["findings"]["spearman"] = {"rho": round(float(r_s), 4), "p": _sf(p_s)}
        result["findings"]["regression"] = reg
        result["analyses_run"].extend(["Pearson correlation", "Spearman correlation", "OLS regression"])
 
        strength = "strong" if abs(r_p) > 0.5 else "moderate" if abs(r_p) > 0.3 else "weak"
        direction = "positive" if r_p > 0 else "negative"
 
        prompt = f"""A researcher asked: "Is there a relationship between '{c1}' and '{c2}'?"
 
Pearson r={round(float(r_p),4)}, p={_sf(p_p)} — {strength} {direction} correlation
Spearman ρ={round(float(r_s),4)}, p={_sf(p_s)}
Regression: slope={reg.get('slope')}, R²={reg.get('r2')}, p={reg.get('p_value_slope')}
N = {len(sub)}
 
Write a plain-English walkthrough in EXACTLY this JSON array format — 3 steps:
[
  {{"step": 1, "title": "What we tested", "text": "..."}},
  {{"step": 2, "title": "What we found", "text": "...direction, strength, significance in plain language..."}},
  {{"step": 3, "title": "What this means", "text": "...practical meaning, warn about correlation ≠ causation..."}}
]
Return only valid JSON array."""
 
    # ── full_explore ──────────────────────────────────────────────────────────
    else:  # full_explore
        if len(num) >= 2:
            top_n = min(8, len(num))
            corr  = _pearson_matrix(df, num[:top_n])
            mat   = np.array(corr["pearson"])
            np.fill_diagonal(mat, 0)
            idx   = np.unravel_index(np.argmax(np.abs(mat)), mat.shape)
            result["findings"]["strongest_correlation"] = {
                "col_a": num[idx[0]], "col_b": num[idx[1]],
                "r": round(float(mat[idx]), 4),
                "p": corr["pvalues"][idx[0]][idx[1]],
            }
            result["analyses_run"].append("Correlation matrix")
 
        if len(num) >= 2:
            km = _kmeans_full(df, num[:6], 3)
            result["findings"]["clustering"] = km
            result["analyses_run"].append("K-Means clustering")
 
        if cat and num:
            anova_res = _anova(df, cat[0], num[0])
            result["findings"]["anova"] = anova_res
            result["analyses_run"].append(f"ANOVA: {num[0]} by {cat[0]}")
 
        if len(num) >= 3:
            rf = _rf_importance(df, num[:6])
            result["findings"]["feature_importance"] = rf
            result["analyses_run"].append("Random Forest importance")
 
        sc = result["findings"].get("strongest_correlation", {})
        km_sil = result["findings"].get("clustering", {}).get("silhouette_score")
        an = result["findings"].get("anova", {})
        rf_top = list(result["findings"].get("feature_importance", {}).get("permutation_importance", {}).keys())[:2]
 
        prompt = f"""A researcher asked: "What's interesting in my data? Explore everything."
 
Dataset: {meta['name']}, {len(df)} rows, {len(df.columns)} cols
Strongest correlation: {sc.get('col_a')} vs {sc.get('col_b')}, r={sc.get('r')}, p={sc.get('p')}
Clustering: 3 clusters, silhouette={km_sil}
ANOVA: {an.get('value_column')} by {an.get('group_column')}, p={an.get('p_value')}, η²={an.get('eta_squared')}
Top predictive features: {rf_top}
 
Write a plain-English walkthrough in EXACTLY this JSON array format — 4 steps:
[
  {{"step": 1, "title": "Your data at a glance", "text": "...describe the dataset in plain terms..."}},
  {{"step": 2, "title": "Most interesting relationship", "text": "...the strongest correlation in plain language..."}},
  {{"step": 3, "title": "Natural groupings", "text": "...what the clusters suggest..."}},
  {{"step": 4, "title": "Where to dig deeper", "text": "...3 specific next questions worth asking..."}}
]
Return only valid JSON array."""
 
    # ── parse walkthrough ─────────────────────────────────────────────────────
    raw_walk = await gemini(prompt, system=RESEARCH_SYSTEM)
    try:
        clean = raw_walk.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        result["walkthrough"] = json.loads(clean)
    except Exception:
        result["walkthrough"] = [{"step": 1, "title": "Summary", "text": raw_walk}]
 
    _log("Quick Explore Agent", req.question_type,
         f"{req.dataset_id} → {len(result['analyses_run'])} analyses")
    return result