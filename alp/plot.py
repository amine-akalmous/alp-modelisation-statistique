"""Données du graphique « distribution empirique + loi » pour un échantillon (simulé ou importé).

Calcul unique côté serveur : le site l'affiche tel quel (static/loi.js) et les exports PDF / Excel
en tirent leurs tableaux et leur graphique. Le graphique s'adapte à n'importe quelles données :

  * la fenêtre couvre la partie utile de la loi (sa plage habituelle, ou ses quantiles 0,1 % – 99,9 %)
    et la partie centrale des données (quantiles 0,1 % – 99,9 %) ; quelques valeurs extrêmes ne
    peuvent donc pas écraser l'histogramme ;
  * une loi à support positif ne part de 0 que si sa masse commence près de 0 ;
  * les classes de l'histogramme couvrent seulement la zone où il y a des données ;
  * une densité infinie (gamma ou Weibull de forme < 1 en 0) ne fixe pas la hauteur de l'axe.
"""
from __future__ import annotations

import math

import numpy as np

from .laws import Law

POS = ("exponentielle", "gamma", "weibull")       # lois à support [0, +∞[
Q = 0.001                                          # quantiles 0,1 % et 99,9 %
N_GRID = 200                                       # points des courbes (comme Lib_Plot_densite.py)


_DOMAIN = {   # domaine mathématique de chaque loi (les bornes des champs de saisie ne s'appliquent pas à une estimation)
    "bernoulli": lambda p: 0 < p[0] < 1,
    "binomiale": lambda p: p[0] >= 1 and 0 < p[1] < 1,
    "poisson": lambda p: p[0] > 0,
    "geometrique": lambda p: 0 < p[0] < 1,
    "uniforme-discrete": lambda p: p[0] < p[1],
    "uniforme-continue": lambda p: p[0] < p[1],
    "exponentielle": lambda p: p[0] > 0,
    "normale": lambda p: p[1] > 0,
    "gamma": lambda p: p[0] > 0 and p[1] > 0,
    "weibull": lambda p: p[0] > 0 and p[1] > 0,
}


def valid(law: Law, p) -> bool:
    """Paramètres utilisables pour tracer la loi : finis et dans le domaine mathématique de la loi."""
    return (p is not None and len(p) == len(law.params) and all(v is not None and math.isfinite(v) for v in p)
            and _DOMAIN[law.slug](p) and (not law.discrete or all(abs(v) <= 2 ** 53 for v in p)))


def for_sample(law: Law, x: np.ndarray, kind: str, truth=None, moments=None) -> dict:
    """Graphique d'une simulation (loi théorique + loi estimée) ou de vos données (loi ajustée)."""
    if kind == "sim":
        return plot_data(law, x, truth, moments if valid(law, moments) else None)
    return plot_data(law, x, moments if valid(law, moments) else None, None)


def _jsround(v: float) -> int:
    return math.floor(v + 0.5)


def _finite(a) -> list:
    """Liste JSON : NaN et infinis deviennent null (point non tracé)."""
    return [float(v) if math.isfinite(v) else None for v in np.asarray(a, dtype=float)]


def _law_window(law: Law, p) -> tuple[float, float]:
    """Partie utile de la loi de référence."""
    d = law.frozen(p)
    if law.slug == "uniforme-continue":                         # support [a, b] et un peu d'espace autour
        w = p[1] - p[0]
        return p[0] - 0.25 * w, p[1] + 0.25 * w
    lo, hi = float(d.ppf(Q)), float(d.ppf(1 - Q))
    # On prolonge jusqu'à ce que la densité soit retombée (< 0,2 % de son maximum) de chaque côté,
    # puis nettement au-delà : on voit le début de la montée, le pic et une vraie zone de stabilisation.
    with np.errstate(all="ignore"):
        g = np.linspace(float(d.ppf(1e-6)), float(d.ppf(1 - 1e-6)), 4000)
        f = d.pdf(g)
        core = (g >= d.ppf(0.01)) & (g <= d.ppf(0.99)) & np.isfinite(f)   # maximum hors d'une éventuelle densité infinie en 0
    if core.any():
        visible = np.flatnonzero(np.isfinite(f) & (f >= 0.002 * f[core].max()))
        if visible.size:
            lo, hi = min(lo, float(g[visible[0]])), max(hi, float(g[visible[-1]]))
    pad = 0.12 * (hi - lo)                                      # ≈ 10 % de la largeur où la courbe est à plat, de chaque côté
    lo, hi = lo - pad, hi + pad
    if law.slug in POS:                                         # support [0, +∞[ : jamais en dessous de 0,
        lo = 0.0 if lo < 0.15 * hi else lo                      # et on part de 0 si la masse commence près de 0
    return lo, hi


def _data_window(x: np.ndarray) -> tuple[float, float]:
    """Partie centrale des données : quelques valeurs aberrantes ne doivent pas écraser l'histogramme."""
    if x.size >= 200:
        lo, hi = np.quantile(x, [0.005, 0.995])
        return float(lo), float(hi)
    lo, hi = float(x.min()), float(x.max())
    q1, q3 = np.quantile(x, [0.25, 0.75])
    iqr = q3 - q1
    if iqr > 0:                                                  # valeurs très isolées (au-delà de 3 écarts interquartiles)
        flo, fhi = q1 - 3 * iqr, q3 + 3 * iqr
        if np.count_nonzero((x < flo) | (x > fhi)) <= max(1, 0.05 * x.size):
            lo, hi = max(lo, float(flo)), min(hi, float(fhi))
    return lo, hi


def plot_data(law: Law, x: np.ndarray, ref=None, est=None) -> dict:
    """ref : loi tracée en trait plein (théorique en simulation, ajustée pour vos données) ;
    est : loi estimée, en pointillés (simulation seulement). None si les paramètres sont invalides."""
    n = x.size
    f_ref = law.frozen(ref) if ref is not None else None
    f_est = law.frozen(est) if est is not None else None

    if law.discrete:
        xi = np.clip(np.rint(x), -2.0 ** 53, 2.0 ** 53).astype(np.int64)
        lo, hi = int(xi.min()), int(xi.max())
        if hi - lo > 2000:                                       # valeurs aberrantes : partie centrale des données
            lo, hi = (int(v) for v in np.rint(np.quantile(xi, [0.01, 0.99])))
        for f, p in ((f_ref, ref), (f_est, est)):
            if f is not None:
                if law.slug == "uniforme-discrete":
                    qlo, qhi = int(round(p[0])), int(round(p[1]))
                else:
                    qlo, qhi = f.ppf(Q), f.ppf(1 - Q)
                    if not (math.isfinite(qlo) and math.isfinite(qhi)):
                        continue
                    qlo, qhi = int(qlo), int(qhi)
                lo, hi = min(lo, qlo), max(hi, qhi)
        if hi - lo > 5000:                                       # loi très étalée : on reste sur les données
            lo, hi = int(xi.min()), int(xi.max())
            if hi - lo > 5000:
                lo, hi = (int(v) for v in np.rint(np.quantile(xi, [0.01, 0.99])))
        if hi - lo > 5000:                                       # valeur isolée sur un petit échantillon : autour de la médiane
            mid = int(np.median(xi))
            lo, hi = mid - 2500, mid + 2500
        ks = np.arange(lo, hi + 1)
        keep = (xi >= lo) & (xi <= hi)
        counts = np.bincount(xi[keep] - lo, minlength=ks.size)[:ks.size]
        freq = counts / n
        pr = f_ref.pmf(ks) if f_ref is not None else None
        pe = f_est.pmf(ks) if f_est is not None else None
        ymax = max([freq.max()] + ([pr.max()] if pr is not None else []) + ([pe.max()] if pe is not None else [])) * 1.12
        return {"discrete": True, "x0": lo, "x1": hi, "ks": ks.tolist(), "counts": counts.tolist(), "freq": _finite(freq),
                "ref": None if pr is None else _finite(pr), "est": None if pe is None else _finite(pe),
                "ymax": float(ymax), "below": int(np.count_nonzero(xi < lo)), "above": int(np.count_nonzero(xi > hi))}

    # --- loi continue : fenêtre de tracé = partie centrale des données ∪ partie utile de la loi
    dlo, dhi = _data_window(x)
    span = (dhi - dlo) or abs(dhi) or 1.0
    x0, x1 = dlo, dhi
    for f, p in ((f_ref, ref), (f_est, est)):
        if f is not None:
            wlo, whi = _law_window(law, p)
            # la loi ajustée peut être faussée (valeurs aberrantes, loi mal choisie) : elle ne peut pas
            # étirer la fenêtre bien au-delà des données
            x0, x1 = min(x0, max(wlo, dlo - 0.6 * span)), max(x1, min(whi, dhi + 0.6 * span))
    if law.slug in POS and 0 <= x0 < 0.15 * x1:
        x0 = 0.0
    if not x1 > x0:                                              # données constantes
        x0, x1 = x0 - 0.5, x1 + 0.5

    # --- histogramme en densité, sur la zone où il y a des données
    ha, hb = max(x0, float(x.min())), min(x1, float(x.max()))
    if not hb > ha:
        ha, hb = (ha - 0.5, ha + 0.5) if hb == ha else (x0, x1)
    inside = (x >= ha) & (x <= hb)
    n_in = int(inside.sum())
    nb = max(8, min(60, _jsround(math.sqrt(max(n_in, 1)) * 1.3)))
    bw = (hb - ha) / nb
    idx = np.minimum(nb - 1, np.floor((x[inside] - ha) / bw).astype(int))
    counts = np.bincount(idx, minlength=nb)
    dens = counts / n / bw                                       # densité rapportée à tout l'échantillon

    grid = np.linspace(x0, x1, N_GRID)
    with np.errstate(all="ignore"):
        cr = f_ref.pdf(grid) if f_ref is not None else None
        ce = f_est.pdf(grid) if f_est is not None else None

    # --- hauteur de l'axe : histogramme et courbes, sans laisser une densité infinie tout écraser
    hmax = float(dens.max())
    cmax = 0.0
    for c in (cr, ce):
        if c is not None:
            ok = np.isfinite(c) & (grid >= ha)
            if ok.any():
                cmax = max(cmax, float(c[ok].max()))
    if hmax > 0:
        cmax = min(cmax, 2.5 * hmax)
    ymax = max(hmax, cmax, 1e-12) * 1.12

    return {"discrete": False, "x0": x0, "x1": x1, "a": ha, "bw": bw, "counts": counts.tolist(), "dens": _finite(dens),
            "grid": _finite(grid), "ref": None if cr is None else _finite(cr), "est": None if ce is None else _finite(ce),
            "ymax": float(ymax), "below": int(np.count_nonzero(x < ha)), "above": int(np.count_nonzero(x > hb))}
