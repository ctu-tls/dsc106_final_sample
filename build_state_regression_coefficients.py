import pandas as pd
import numpy as np

INPUT = "state_annual_climate.csv"
OUTPUT = "state_regression_coefficients.csv"

df = pd.read_csv(INPUT)

required = ["state", "year", "tas_c", "co2_ppm", "od550aer", "rsdt"]
missing = [c for c in required if c not in df.columns]
if missing:
    raise ValueError(f"Missing columns: {missing}")

df = df[(df["year"] >= 1960) & (df["year"] <= 2014)].copy()
df = df.dropna(subset=required)

rows = []

for state, g in df.groupby("state"):
    g = g.sort_values("year")

    if len(g) < 20:
        continue

    # y = beta0 + beta1*co2 + beta2*od550aer + beta3*rsdt
    X_raw = g[["co2_ppm", "od550aer", "rsdt"]].to_numpy()
    y = g["tas_c"].to_numpy()

    # Standardize predictors for stable regression
    means = X_raw.mean(axis=0)
    stds = X_raw.std(axis=0)
    stds[stds == 0] = 1

    X_scaled = (X_raw - means) / stds
    X = np.column_stack([np.ones(len(g)), X_scaled])

    beta_scaled, *_ = np.linalg.lstsq(X, y, rcond=None)

    # Convert coefficients back to original units
    intercept = beta_scaled[0] - np.sum(beta_scaled[1:] * means / stds)
    beta_original = beta_scaled[1:] / stds

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
        "n_years": len(g)
    })

coef_df = pd.DataFrame(rows).sort_values("state")
coef_df.to_csv(OUTPUT, index=False)

print(f"Saved {OUTPUT}")
print(coef_df.head())