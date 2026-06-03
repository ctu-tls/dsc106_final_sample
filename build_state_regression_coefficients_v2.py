import pandas as pd
import numpy as np

INPUT = "state_annual_climate.csv"
OUTPUT = "state_regression_coefficients.csv"

START_YEAR = 1950
END_YEAR = 2014
ROLLING_WINDOW = 5

df = pd.read_csv(INPUT)

required_cols = [
    "year",
    "state",
    "tas_anomaly",
    "co2_ppm",
    "od550aer",
    "rsdt",
]

missing = [col for col in required_cols if col not in df.columns]
if missing:
    raise ValueError(f"Missing columns: {missing}")

df = df[required_cols].copy()
df = df[(df["year"] >= START_YEAR) & (df["year"] <= END_YEAR)]
df = df.dropna()

rows = []

for state, g in df.groupby("state"):
    g = g.sort_values("year").copy()

    # Smooth climate signal with 5-year rolling average
    for col in ["tas_anomaly", "co2_ppm", "od550aer", "rsdt"]:
        g[f"{col}_smooth"] = (
            g[col]
            .rolling(window=ROLLING_WINDOW, center=True, min_periods=3)
            .mean()
        )

    model_df = g.dropna(
        subset=[
            "tas_anomaly_smooth",
            "co2_ppm_smooth",
            "od550aer_smooth",
            "rsdt_smooth",
        ]
    )

    if len(model_df) < 20:
        continue

    y = model_df["tas_anomaly_smooth"].to_numpy()
    X_raw = model_df[
        ["co2_ppm_smooth", "od550aer_smooth", "rsdt_smooth"]
    ].to_numpy()

    # Standardize predictors for numerical stability
    means = X_raw.mean(axis=0)
    stds = X_raw.std(axis=0)
    stds[stds == 0] = 1

    X_scaled = (X_raw - means) / stds
    X = np.column_stack([np.ones(len(X_scaled)), X_scaled])

    beta_scaled, *_ = np.linalg.lstsq(X, y, rcond=None)

    # Convert beta back to original units
    beta_original = beta_scaled[1:] / stds
    intercept = beta_scaled[0] - np.sum(beta_scaled[1:] * means / stds)

    y_pred = intercept + X_raw @ beta_original

    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot != 0 else np.nan

    rows.append({
        "state": state,
        "intercept": intercept,
        "beta_co2": beta_original[0],
        "beta_od550aer": beta_original[1],
        "beta_rsdt": beta_original[2],
        "r2": r2,
        "n_years": len(model_df),
        "model_start_year": START_YEAR,
        "model_end_year": END_YEAR,
        "rolling_window": ROLLING_WINDOW,
        "target": "tas_anomaly_smooth",
    })

coef_df = pd.DataFrame(rows).sort_values("state")
coef_df.to_csv(OUTPUT, index=False)

print(f"Saved {OUTPUT}")
print(coef_df.head())
print()
print("Average R²:", coef_df["r2"].mean())