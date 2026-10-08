"""Les dix lois : validation, simulation, statistiques et estimation.

Deux estimateurs sont proposés pour chaque loi :
  * la formule explicite (méthode des moments), identique à celle affichée sur le site ;
  * la montée de gradient sur la log-vraisemblance moyenne, avec gradient analytique
    et recherche de pas d'Armijo, dans un espace de paramètres sans contrainte
    (log pour un paramètre positif, logit pour une probabilité).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy import special, stats


class LawError(ValueError):
    """Paramètres ou données invalides ; le message est affiché tel quel à l'utilisateur."""


def _is_int(v: float) -> bool:
    return abs(v - round(v)) < 1e-9


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z)) if z >= 0 else math.exp(z) / (1.0 + math.exp(z))


def _logit(p: float) -> float:
    return math.log(p / (1.0 - p))


# ---------------------------------------------------------------------------
# Transformations vers un espace sans contrainte : (vers z, depuis z, dérivée dθ/dz)
# ---------------------------------------------------------------------------
LOG = (math.log, math.exp, lambda z: math.exp(z))
LOGIT = (_logit, _sigmoid, lambda z: _sigmoid(z) * (1.0 - _sigmoid(z)))


def AFFINE(center: float, scale: float):
    return (lambda t: (t - center) / scale, lambda z: center + scale * z, lambda z: scale)


@dataclass
class Gradient:
    """Ce qu'il faut pour une montée de gradient sur une loi donnée."""
    start: Callable[[np.ndarray], list[float]]                 # point de départ « naïf »
    transforms: Callable[[np.ndarray], list[tuple]]            # une transformation par paramètre
    loglik: Callable[[list[float], dict], float]               # log-vraisemblance moyenne
    score: Callable[[list[float], dict], list[float]]          # gradient par rapport aux paramètres
    prepare: Callable[[np.ndarray], dict] = field(default=lambda x: {})
    support: Callable[[np.ndarray], str | None] = field(default=lambda x: None)
    fixed_note: Callable[[dict], str | None] = field(default=lambda s: None)
    full: Callable[[list[float], dict], list[float]] = field(default=lambda p, s: p)   # paramètres complets affichés


@dataclass
class Law:
    slug: str
    name: str
    discrete: bool
    params: list[str]
    check: Callable[[list[float]], str | None]
    frozen: Callable[[list[float]], object]                    # loi SciPy correspondante
    moments: Callable[[np.ndarray], list[float]]               # estimateurs explicites
    gradient: Gradient | None = None
    no_gradient: str = ""


def _mean_stats(x: np.ndarray) -> dict:
    m = float(x.mean())
    return {"m": m, "mu2": float(((x - m) ** 2).mean()), "n": x.size}


# ---------------------------------------------------------------------------
# Les dix lois
# ---------------------------------------------------------------------------
def _bernoulli() -> Law:
    def loglik(p, s):
        t = p[0]
        return s["m"] * math.log(t) + (1 - s["m"]) * math.log(1 - t)
    return Law(
        "bernoulli", "Bernoulli", True, ["θ"],
        check=lambda p: None if 0 < p[0] < 1 else "θ doit être strictement compris entre 0 et 1.",
        frozen=lambda p: stats.bernoulli(p[0]),
        moments=lambda x: [float(x.mean())],
        gradient=Gradient(
            start=lambda x: [0.5], transforms=lambda x: [LOGIT], prepare=_mean_stats, loglik=loglik,
            score=lambda p, s: [s["m"] / p[0] - (1 - s["m"]) / (1 - p[0])],
            support=lambda x: None if np.isin(x, (0, 1)).all() and 0 < x.mean() < 1
            else "Les données doivent valoir 0 ou 1, avec au moins un 0 et un 1."))


def _binomiale() -> Law:
    def moments(x):
        """p = 1 − μ₂/m₁, puis n = m₁/p arrondi à l'entier le plus proche (n est un nombre d'épreuves)."""
        m = float(x.mean()); p = 1 - float(x.var()) / m if m > 0 else float("nan")
        return [float(max(1, round(m / p))), p] if 0 < p < 1 else [float("nan"), float("nan")]

    def prepare(x):
        s = _mean_stats(x)
        n_mom = moments(x)[0]
        s["nfix"] = int(max(round(n_mom), x.max())) if math.isfinite(n_mom) else int(x.max())
        return s

    def loglik(p, s):
        q = p[0]
        return s["m"] * math.log(q) + (s["nfix"] - s["m"]) * math.log(1 - q)
    return Law(
        "binomiale", "Binomiale", True, ["n", "p"],
        check=lambda p: ("n doit être un entier compris entre 1 et 1000." if not (_is_int(p[0]) and 1 <= p[0] <= 1000)
                         else None if 0 < p[1] < 1 else "p doit être strictement compris entre 0 et 1."),
        frozen=lambda p: stats.binom(int(round(p[0])), p[1]),
        moments=moments,
        gradient=Gradient(
            start=lambda x: [0.5], transforms=lambda x: [LOGIT], prepare=prepare, loglik=loglik,
            score=lambda p, s: [s["m"] / p[0] - (s["nfix"] - s["m"]) / (1 - p[0])],
            support=lambda x: None if (x >= 0).all() and np.all(np.abs(x - np.round(x)) < 1e-9) and x.max() > 0
            else "Les données doivent être des entiers positifs, non tous nuls.",
            fixed_note=lambda s: f"n est fixé à {s['nfix']} ; seul p est obtenu par montée de gradient.",
            full=lambda p, s: [s["nfix"], p[0]]))


def _poisson() -> Law:
    return Law(
        "poisson", "Poisson", True, ["λ"],
        check=lambda p: None if 0 < p[0] <= 500 else "λ doit être strictement positif et au plus 500.",
        frozen=lambda p: stats.poisson(p[0]),
        moments=lambda x: [float(x.mean())],
        gradient=Gradient(
            start=lambda x: [1.0], transforms=lambda x: [LOG], prepare=_mean_stats,
            loglik=lambda p, s: s["m"] * math.log(p[0]) - p[0],
            score=lambda p, s: [s["m"] / p[0] - 1],
            support=lambda x: None if (x >= 0).all() and x.mean() > 0 else "Les données doivent être positives, non toutes nulles."))


def _geometrique() -> Law:
    return Law(
        "geometrique", "Géométrique", True, ["p"],
        check=lambda p: None if 0 < p[0] < 1 else "p doit être strictement compris entre 0 et 1.",
        frozen=lambda p: stats.geom(p[0]),          # SciPy : support {1, 2, ...}, comme sur le site
        moments=lambda x: [1 / float(x.mean())],
        gradient=Gradient(
            start=lambda x: [0.5], transforms=lambda x: [LOGIT], prepare=_mean_stats,
            loglik=lambda p, s: math.log(p[0]) + (s["m"] - 1) * math.log(1 - p[0]),
            score=lambda p, s: [1 / p[0] - (s["m"] - 1) / (1 - p[0])],
            support=lambda x: None if (x >= 1).all() and x.mean() > 1 else "Les données doivent être ≥ 1, non toutes égales à 1."))


def _uniforme_discrete() -> Law:
    def check(p):
        a, b = p
        if not (_is_int(a) and _is_int(b)):
            return "a et b doivent être des entiers."
        if not a < b:
            return "Il faut a < b."
        return "L'écart b − a doit rester inférieur à 1000." if b - a > 1000 else None
    return Law(
        "uniforme-discrete", "Uniforme discrète", True, ["a", "b"], check=check,
        frozen=lambda p: stats.randint(int(round(p[0])), int(round(p[1])) + 1),
        moments=lambda x: [float(x.min()), float(x.max())],
        no_gradient="La vraisemblance dépend du minimum et du maximum des données : elle n'est pas dérivable, "
                    "la montée de gradient ne s'applique pas. L'estimateur explicite est déjà celui du maximum de vraisemblance.")


def _uniforme_continue() -> Law:
    def moments(x):
        """Estimateur explicite du maximum de vraisemblance : le plus petit et le plus grand échantillon."""
        return [float(x.min()), float(x.max())]
    return Law(
        "uniforme-continue", "Uniforme continue", False, ["a", "b"],
        check=lambda p: None if p[0] < p[1] else "Il faut a < b.",
        frozen=lambda p: stats.uniform(loc=p[0], scale=p[1] - p[0]),
        moments=moments,
        no_gradient="La vraisemblance dépend du minimum et du maximum des données : elle n'est pas dérivable, "
                    "la montée de gradient ne s'applique pas. L'estimateur explicite est déjà celui du maximum de vraisemblance.")


def _exponentielle() -> Law:
    return Law(
        "exponentielle", "Exponentielle", False, ["λ"],
        check=lambda p: None if p[0] > 0 else "λ doit être strictement positif.",
        frozen=lambda p: stats.expon(scale=1 / p[0]),
        moments=lambda x: [1 / float(x.mean())],
        gradient=Gradient(
            start=lambda x: [1.0], transforms=lambda x: [LOG], prepare=_mean_stats,
            loglik=lambda p, s: math.log(p[0]) - p[0] * s["m"],
            score=lambda p, s: [1 / p[0] - s["m"]],
            support=lambda x: None if (x >= 0).all() and x.mean() > 0 else "Les données doivent être positives, non toutes nulles."))


def _normale() -> Law:
    def transforms(x):
        q75, q25 = np.percentile(x, [75, 25])
        scale = float(q75 - q25) / 1.349 or float(x.std()) or 1.0
        return [AFFINE(float(np.median(x)), scale), LOG]

    def loglik(p, s):
        mu, v = p
        return -0.5 * math.log(2 * math.pi * v) - (s["mu2"] + (s["m"] - mu) ** 2) / (2 * v)

    def score(p, s):
        mu, v = p
        return [(s["m"] - mu) / v, -0.5 / v + (s["mu2"] + (s["m"] - mu) ** 2) / (2 * v * v)]
    return Law(
        "normale", "Normale", False, ["μ", "σ²"],
        check=lambda p: None if p[1] > 0 else "σ² doit être strictement positif.",
        frozen=lambda p: stats.norm(p[0], math.sqrt(p[1])),
        moments=lambda x: [float(x.mean()), float(x.var())],
        gradient=Gradient(
            start=lambda x: [float(np.median(x)), 1.0], transforms=transforms, prepare=_mean_stats,
            loglik=loglik, score=score,
            support=lambda x: None if x.var() > 0 else "Les données doivent varier."))


def _gamma() -> Law:
    def prepare(x):
        s = _mean_stats(x); s["mlog"] = float(np.log(x).mean())
        return s

    def loglik(p, s):
        a, b = p
        return a * math.log(b) - special.gammaln(a) + (a - 1) * s["mlog"] - b * s["m"]
    return Law(
        "gamma", "Gamma", False, ["a", "b"],
        check=lambda p: None if p[0] > 0 and p[1] > 0 else "a et b doivent être strictement positifs.",
        frozen=lambda p: stats.gamma(p[0], scale=1 / p[1]),     # b est un taux
        moments=lambda x: [float(x.mean()) ** 2 / float(x.var()), float(x.mean()) / float(x.var())],
        gradient=Gradient(
            start=lambda x: [1.0, 1 / float(x.mean())], transforms=lambda x: [LOG, LOG], prepare=prepare,
            loglik=loglik,
            score=lambda p, s: [math.log(p[1]) - special.digamma(p[0]) + s["mlog"], p[0] / p[1] - s["m"]],
            support=lambda x: None if (x > 0).all() and x.var() > 0 else "Les données doivent être strictement positives et varier."))


def _weibull() -> Law:
    def moments(x):
        """Forme a : moindres carrés sur la fonction de répartition linéarisée
        (ln(−ln(1 − F)) = a·ln x − a·ln b, rangs médians de Bernard (i − 0,3)/(n + 0,4)) ;
        échelle b : premier moment, b = m₁ / Γ(1 + 1/a)."""
        if (x <= 0).any():
            return [float("nan"), float("nan")]
        n = x.size
        lx = np.log(np.sort(x))
        y = np.log(-np.log(1 - (np.arange(1, n + 1) - 0.3) / (n + 0.4)))
        dx = lx - lx.mean()
        sxx = float(dx @ dx)
        if sxx == 0:
            return [float("nan"), float("nan")]
        a = float(dx @ (y - y.mean())) / sxx
        return [a, float(x.mean()) / math.exp(special.gammaln(1 + 1 / a))]

    def prepare(x):
        s = _mean_stats(x); s["x"] = x; s["mlog"] = float(np.log(x).mean())
        return s

    def loglik(p, s):
        a, b = p
        r = s["x"] / b
        return math.log(a) - a * math.log(b) + (a - 1) * s["mlog"] - float(np.mean(r ** a))

    def score(p, s):
        a, b = p
        r = s["x"] / b; ra = r ** a
        return [1 / a - math.log(b) + s["mlog"] - float(np.mean(ra * np.log(r))), -a / b + a / b * float(np.mean(ra))]
    return Law(
        "weibull", "Weibull", False, ["a", "b"],
        check=lambda p: ("a doit être compris entre 0,3 et 100." if not 0.3 <= p[0] <= 100
                         else None if p[1] > 0 else "b doit être strictement positif."),
        frozen=lambda p: stats.weibull_min(p[0], scale=p[1]),
        moments=moments,
        gradient=Gradient(
            start=lambda x: [1.0, float(x.mean())], transforms=lambda x: [LOG, LOG], prepare=prepare,
            loglik=loglik, score=score,
            support=lambda x: None if (x > 0).all() and x.var() > 0 else "Les données doivent être strictement positives et varier."))


LAWS: dict[str, Law] = {law.slug: law for law in (
    _bernoulli(), _binomiale(), _poisson(), _geometrique(), _uniforme_discrete(),
    _uniforme_continue(), _exponentielle(), _normale(), _gamma(), _weibull())}

MAX_N = 100_000
MAX_DATA = 200_000


# ---------------------------------------------------------------------------
# Fonctions utilisées par l'API
# ---------------------------------------------------------------------------
def get_law(slug: str) -> Law:
    try:
        return LAWS[slug]
    except KeyError:
        raise LawError("Loi inconnue.") from None


def check_params(law: Law, params) -> list[float]:
    if not isinstance(params, list) or len(params) != len(law.params):
        raise LawError("Nombre de paramètres incorrect.")
    try:
        p = [float(v) for v in params]
    except (TypeError, ValueError):
        raise LawError("Saisissez un nombre valide (par exemple 2,5).") from None
    if not all(math.isfinite(v) and abs(v) <= 1e6 for v in p):
        raise LawError("Valeur trop grande (maximum 1 000 000 en valeur absolue).")
    msg = law.check(p)
    if msg:
        raise LawError(msg)
    return p


def check_data(values) -> np.ndarray:
    if not isinstance(values, list):
        raise LawError("Les données doivent être une liste de nombres.")
    if len(values) > MAX_DATA:
        raise LawError(f"Trop de valeurs (maximum {MAX_DATA:,}).".replace(",", " "))
    try:
        x = np.asarray(values, dtype=float)
    except (TypeError, ValueError):
        raise LawError("Les données doivent être des nombres.") from None
    if x.size < 2 or not np.isfinite(x).all():
        raise LawError("Il faut au moins 2 valeurs numériques.")
    return x


def simulate(law: Law, params: list[float], n: int, seed: int | None) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.asarray(law.frozen(params).rvs(size=n, random_state=rng), dtype=float)


def describe(x: np.ndarray) -> dict:
    """Statistiques descriptives, avec le diviseur n comme indiqué sur le site."""
    m = float(x.mean()); d = x - m
    mu2 = float((d ** 2).mean()); mu3 = float((d ** 3).mean()); mu4 = float((d ** 4).mean())
    return {"n": int(x.size), "min": float(x.min()), "max": float(x.max()), "mean": m, "var": mu2,
            "skew": mu3 / mu2 ** 1.5 if mu2 > 0 else None, "kurt": mu4 / mu2 ** 2 - 3 if mu2 > 0 else None}


def gradient_ascent(law: Law, x: np.ndarray, max_iter: int = 3000, tol: float = 1e-16) -> dict:
    """Maximise la log-vraisemblance moyenne par montée de gradient (pas d'Armijo)."""
    if law.gradient is None:
        return {"applicable": False, "reason": law.no_gradient}
    g = law.gradient
    reason = g.support(x)
    if reason:
        return {"applicable": False, "reason": reason}
    s = g.prepare(x)
    tf = g.transforms(x)
    start = g.start(x)
    z = np.array([t[0](v) for t, v in zip(tf, start)])
    theta = lambda zz: [t[1](v) for t, v in zip(tf, zz)]

    def f(zz):
        try:
            val = g.loglik(theta(zz), s)
        except (ValueError, OverflowError, ZeroDivisionError):
            return -math.inf
        return val if math.isfinite(val) else -math.inf

    def grad(zz):
        p = theta(zz)
        return np.array([sc * t[2](v) for sc, t, v in zip(g.score(p, s), tf, zz)])

    fz, step, trace, converged, it = f(z), 1.0, [], False, 0
    z_prev = g_prev = None
    trace.append([0, fz])
    for it in range(1, max_iter + 1):
        gz = grad(z)
        gn = float(gz @ gz)
        if not math.isfinite(gn):
            break
        if gn < tol:
            converged = True
            it -= 1
            break
        if z_prev is not None:                        # pas de Barzilai-Borwein (adapté à la courbure)
            s_, y_ = z - z_prev, g_prev - gz
            sy = float(s_ @ y_)
            step = float(s_ @ s_) / sy if sy > 1e-300 else 1.0
            step = min(max(step, 1e-6), 1e4)
        while True:                                   # garde-fou : condition d'Armijo
            zn = z + step * gz
            fn = f(zn)
            if fn >= fz + 1e-4 * step * gn or step < 1e-12:
                break
            step /= 2
        if step < 1e-12:
            converged = gn < 1e-6
            break
        z_prev, g_prev = z, gz
        z, fz = zn, fn
        trace.append([it, fz])
    if len(trace) > 160:                              # trace allégée pour l'affichage
        idx = np.unique(np.round(np.geomspace(1, len(trace) - 1, 159)).astype(int))
        trace = [trace[0]] + [trace[i] for i in idx]
    out = {"applicable": True, "params": g.full(theta(z), s), "start": g.full(start, s), "loglik": fz, "iterations": it,
           "converged": converged, "trace": trace}
    note = g.fixed_note(s)
    if note:
        out["note"] = note
    return out


def clean(v):
    """Rend une structure sérialisable en JSON (NaN et infinis deviennent null)."""
    if isinstance(v, dict):
        return {k: clean(w) for k, w in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(w) for w in v]
    if isinstance(v, (float, np.floating)):
        v = float(v)
        return v if math.isfinite(v) else None
    if isinstance(v, np.integer):
        return int(v)
    return v


def analyse(law: Law, x: np.ndarray) -> dict:
    """Statistiques descriptives + les deux estimateurs."""
    with np.errstate(all="ignore"):
        mom = law.moments(x)
    return clean({"stats": describe(x), "moments": mom, "gradient": gradient_ascent(law, x)})
