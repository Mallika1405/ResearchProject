# Nexus Research Engine v3.0

A multi-agent AI research platform that goes from raw messy datasets to statistically valid, reproducible analyses — with built-in scientific rigor, peer-reviewer criticism, and study design intelligence.

## Install & Run

```bash
pip install -r requirements.txt
GEMINI_API_KEY=your_key uvicorn main:app --reload --port 8000
```

Docs auto-generated at: `http://localhost:8000/docs`

---

## What makes this different from every other tool

| Feature | Nexus | Databricks | Tableau | AutoML | ChatGPT |
|---|---|---|---|---|---|
| Multi-CSV cohort builder (no duplication) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Data-structure-aware model selection (LMM etc.) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Adversarial peer reviewer | ✅ | ❌ | ❌ | ❌ | ❌ |
| Study design generation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Causal inference (PSM, IPW, DiD) | ✅ | partial | ❌ | ❌ | ❌ |
| Survival analysis (KM + Cox) | ✅ | manual | ❌ | ❌ | ❌ |
| Sensitivity + replication analysis | ✅ | manual | ❌ | ❌ | ❌ |
| SHAP explainability | ✅ | manual | ❌ | partial | ❌ |
| Mediation analysis | ✅ | manual | ❌ | ❌ | ❌ |
| Power planning (prospective) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Lab workspaces + versioning | ✅ | ✅ | partial | ❌ | ❌ |
| Publication-ready report | ✅ | ❌ | ❌ | ❌ | partial |

---

## Full API Reference

### Upload & Data

| Endpoint | Method | Description |
|---|---|---|
| `/upload` | POST | Upload CSV/TSV/XLSX/Parquet. Returns schema, structure detection, model recommendation. |
| `/datasets` | GET | List all loaded datasets |
| `/datasets/{id}` | DELETE | Remove a dataset |
| `/health` | GET | Server health + capabilities |

**Upload response includes:**
- Auto-detected column types (numeric/categorical/datetime)
- Data structure detection: repeated measures, hierarchy, ID columns
- Model recommendation (OLS / LMM / multilevel / survival)
- Missing data summary

---

### 🔑 Key Differentiators

#### `POST /study-design`
Generates 2–3 valid study designs for your research question, grounded in actual data structure.
```json
{
  "dataset_id": "abc123",
  "research_question": "Does drug X reduce depression scores over time?",
  "outcome_variable": "depression_score",
  "exposure_variable": "drug_x"
}
```
Returns: design options with formulas, assumptions, causal inference feasibility, implementation steps.

#### `POST /hypotheses`
Generates 4–6 structured, testable hypotheses with exact column names, appropriate tests, and effect size measures.
```json
{
  "dataset_id": "abc123",
  "research_question": "What predicts hospital readmission?",
  "domain": "clinical"
}
```

#### `POST /cohort-builder`
Intelligently joins 2+ datasets — detects join keys, prevents row duplication, aggregates repeated records.
```json
{
  "dataset_ids": ["patients_id", "visits_id", "labs_id"],
  "aggregations": {"lab_value": "mean", "medication": "first"}
}
```

#### `POST /peer-review`
Adversarial peer reviewer critiques your analysis like a hostile Reviewer 2.
```json
{
  "dataset_id": "abc123",
  "analysis_json": "{...your results...}",
  "claimed_conclusions": "Drug X significantly reduces depression scores (p<0.05)"
}
```

---

### Advanced Statistical Models

#### `POST /lmm`
Linear Mixed-Effects Model for repeated measures / hierarchical data.
```json
{
  "dataset_id": "abc123",
  "outcome": "depression_score",
  "fixed_effects": ["drug_x", "time", "age"],
  "random_effects": ["subject_id"],
  "interaction_terms": ["drug_x:time"],
  "family": "gaussian"
}
```
Returns: coefficients with CIs, ICC, convergence status, AIC/BIC, AI interpretation.

#### `POST /survival`
Kaplan-Meier + Log-rank test + Cox Proportional Hazards.
```json
{
  "dataset_id": "abc123",
  "duration_col": "time_to_event",
  "event_col": "event_occurred",
  "group_col": "treatment_arm",
  "covariates": ["age", "sex", "comorbidity_score"]
}
```

#### `POST /causal-inference`
Three methods: propensity score matching, inverse probability weighting, regression adjustment.
```json
{
  "dataset_id": "abc123",
  "outcome": "readmission_30d",
  "treatment": "intervention",
  "covariates": ["age", "severity_score", "comorbidities"],
  "method": "propensity_matching"
}
```

#### `POST /mediation`
Baron-Kenny mediation analysis + Sobel test.
```json
{
  "dataset_id": "abc123",
  "outcome": "health_outcome",
  "mediator": "stress_score",
  "exposure": "socioeconomic_status",
  "covariates": ["age", "sex"]
}
```

---

### Robustness & Validation

#### `POST /sensitivity-analysis`
Runs OLS, Ridge, Lasso, and outlier-removed OLS simultaneously. Bootstrap CIs. Flags unstable coefficients.
```json
{
  "dataset_id": "abc123",
  "outcome": "y",
  "predictors": ["x1", "x2", "x3"]
}
```

#### `POST /replication-check`
Runs same analysis on a new dataset and compares results.
```json
{
  "analysis_json": "{...original results...}",
  "target_dataset_id": "new_dataset_id",
  "outcome": "y",
  "predictors": ["x1", "x2"]
}
```

#### `POST /power-planning`
Prospective power analysis — how many participants do you need?
```json
{
  "effect_size": 0.5,
  "alpha": 0.05,
  "power": 0.80,
  "test_type": "two_sample_t",
  "n_groups": 2
}
```
Returns: required N, power curve across sample sizes.

---

### Full Pipeline

#### `POST /analyze`
Runs the complete suite automatically:
- Pearson + Spearman correlation matrix
- OLS regression (with Durbin-Watson, residual diagnostics)
- Shapiro-Wilk + KS + Jarque-Bera normality tests
- Z-score + IQR outlier detection
- Isolation Forest multivariate anomaly detection
- Welch t-test + Mann-Whitney U (with power analysis)
- One-way ANOVA + Kruskal-Wallis + Tukey HSD post-hoc
- Chi-square test of independence
- K-Means clustering (silhouette + Calinski-Harabasz)
- PCA
- Random Forest + permutation importance + 5-fold CV
- AI-generated methods section
- Model recommendation based on data structure

---

### Dimensionality & Explainability

#### `POST /umap`
UMAP dimensionality reduction.

#### `POST /shap-analysis`
SHAP values for model explainability.
```json
{
  "dataset_id": "abc123",
  "outcome": "target",
  "predictors": ["x1", "x2", "x3"]
}
```

---

### Meta-Analysis & Synthesis

#### `POST /meta-analysis`
Runs same analysis across multiple datasets. Fixed-effects pooling. Heterogeneity (Q, I²).
```json
{
  "dataset_ids": ["study1_id", "study2_id", "study3_id"],
  "outcome_col": "depression_score",
  "method": "fixed_effects"
}
```

---

### AI Layers

| Endpoint | What it does |
|---|---|
| `POST /ask` | Freeform Q&A with dataset context — answers as senior biostatistician |
| `POST /generate-report` | Full publication-ready academic report (8 sections) |
| `POST /suggest-tests` | Recommends which tests to run and why, given data structure |
| `POST /explain-insight` | Translates finding for layman / expert / executive / clinician |
| `POST /forecast` | ARIMA time-series forecast with AI narrative |

---

### Supporting Analyses

| Endpoint | Description |
|---|---|
| `POST /anova` | One-way ANOVA + Kruskal-Wallis + Tukey HSD |
| `POST /chi-square` | Chi-square test of independence |
| `POST /pca` | Principal Component Analysis |
| `POST /power-analysis` | Post-hoc power for existing groups |
| `POST /compare-datasets` | Compare same column across two datasets |
| `POST /network-analysis` | Graph analysis (centrality, clustering, density) |

---

### Lab Workspaces

```bash
POST /workspaces              # Create workspace
POST /workspaces/add-dataset  # Add dataset to workspace
GET  /workspaces/{id}         # Get workspace with datasets
GET  /workspaces              # List all workspaces
```

---

### Audit & Provenance

```bash
GET /audit-log                # Full operation log with timestamps
GET /study-plans/{plan_id}    # Retrieve saved study plan
GET /hypotheses/{dataset_id}  # Retrieve generated hypotheses
```

---

## Example Workflow

```bash
# 1. Upload your datasets
curl -X POST http://localhost:8000/upload -F "file=@patients.csv"
curl -X POST http://localhost:8000/upload -F "file=@visits.csv"
curl -X POST http://localhost:8000/upload -F "file=@labs.csv"

# 2. Build the cohort (auto-joins, prevents duplication)
curl -X POST http://localhost:8000/cohort-builder \
  -H "Content-Type: application/json" \
  -d '{"dataset_ids": ["id1","id2","id3"]}'

# 3. Generate study designs for your question
curl -X POST http://localhost:8000/study-design \
  -d '{"dataset_id":"cohort_id","research_question":"Does treatment reduce readmission?"}'

# 4. Generate testable hypotheses
curl -X POST http://localhost:8000/hypotheses \
  -d '{"dataset_id":"cohort_id","research_question":"Predictors of readmission"}'

# 5. Run the full analysis pipeline
curl -X POST http://localhost:8000/analyze \
  -d '{"dataset_id":"cohort_id","goal":"Predict 30-day readmission"}'

# 6. Run LMM if repeated measures detected
curl -X POST http://localhost:8000/lmm \
  -d '{"dataset_id":"cohort_id","outcome":"score","fixed_effects":["treatment","time"],"random_effects":["patient_id"]}'

# 7. Adversarial peer review your conclusions
curl -X POST http://localhost:8000/peer-review \
  -d '{"dataset_id":"cohort_id","analysis_json":"...","claimed_conclusions":"Treatment reduces score (p=0.03)"}'

# 8. Generate publication-ready report
curl -X POST http://localhost:8000/generate-report \
  -d '{"dataset_id":"cohort_id","goal":"Readmission prediction","findings_json":"..."}'
```

---

## Architecture

The LLM (Gemini) is only used for:
1. Parsing research intent → structured plan
2. Explaining results in plain language
3. Literature-grounded interpretation
4. Adversarial review

**All statistical computation is deterministic:**
- scipy, statsmodels, sklearn, pingouin, lifelines
- No hallucinated statistics
- Every result is reproducible

```
Research Question
       ↓
Study Design Generator (Gemini → structured JSON)
       ↓
Cohort Builder (deterministic join + aggregation)
       ↓
Statistical Engine (scipy + statsmodels + sklearn)
       ↓
Validation Layer (assumption checks, convergence warnings)
       ↓
Sensitivity Analysis (OLS + Ridge + Lasso + bootstrap)
       ↓
Peer Reviewer (adversarial Gemini critique)
       ↓
Report Generator (grounded in actual outputs)
```

---

## Environment Variables

```bash
GEMINI_API_KEY=your_key_here   # Required for AI features
```

All statistical features work without a Gemini key. AI interpretation and report generation require it.