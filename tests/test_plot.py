"""Le graphique « distribution empirique + loi » doit rester lisible pour n'importe quelles données.

Des centaines de jeux de données sont essayés : toutes les lois, des paramètres extrêmes, peu ou beaucoup
de valeurs, des valeurs aberrantes, une loi mal choisie, des données presque constantes, très petites ou
très grandes. Pour chacun, on vérifie que le graphique produit par alp/plot.py est exploitable.
"""
import math

import numpy as np
import pytest

from alp.laws import LAWS, analyse, simulate
from alp.plot import for_sample

PARAMS = {
    "bernoulli": [[0.03], [0.5], [0.97]],
    "binomiale": [[1, 0.5], [10, 0.4], [1000, 0.5], [500, 0.01]],
    "poisson": [[0.05], [4], [480]],
    "geometrique": [[0.9], [0.3], [0.002]],
    "uniforme-discrete": [[1, 6], [-500, 500], [1000, 1003]],
    "uniforme-continue": [[0, 3], [-1e6, 1e6], [5, 5.001]],
    "exponentielle": [[1], [1e-4], [1e4]],
    "normale": [[0, 1], [1e6, 1e-4], [-50, 1e4]],
    "gamma": [[0.3, 1], [2, 0.5], [400, 1], [5, 11.9]],
    "weibull": [[0.35, 1], [1.5, 1], [21, 0.93], [100, 5]],
}
SIZES = [20, 500, 5000]


def check(slug, x, plot, correct_law=True):
    """Critères d'un graphique exploitable."""
    p = plot
    n = x.size
    assert math.isfinite(p["x0"]) and math.isfinite(p["x1"]) and p["x1"] > p["x0"]
    assert math.isfinite(p["ymax"]) and p["ymax"] > 0
    # presque toutes les données sont représentées
    assert (p["below"] + p["above"]) / n <= 0.025, f"{slug}: trop de valeurs hors du graphique"
    if p["discrete"]:
        assert len(p["ks"]) <= 5001
        assert max(f for f in p["freq"]) >= 0.3 * p["ymax"] / 1.12 - 1e-12 or not correct_law
    else:
        dens = np.array(p["dens"], dtype=float)
        assert 8 <= dens.size <= 60
        if n >= 50 and np.ptp(x) > 0:
            assert np.count_nonzero(dens) >= min(5, dens.size), f"{slug}: histogramme réduit à quelques barres"
        # l'histogramme n'est pas écrasé par la courbe
        assert dens.max() >= 0.35 * p["ymax"] / 1.12, f"{slug}: histogramme écrasé"
        if correct_law and n >= 500:
            # les données centrales occupent une part raisonnable de la fenêtre (pas de grand vide)
            lo, hi = np.quantile(x, [0.01, 0.99])
            assert (hi - lo) / (p["x1"] - p["x0"]) >= 0.2, f"{slug}: données tassées dans une petite partie du graphique"
            # la courbe de la loi est tracée et visible sur la plus grande partie de la fenêtre
            assert p["ref"] is not None, f"{slug}: loi non tracée"
            ref = np.array([np.nan if v is None else v for v in p["ref"]])
            assert np.mean(np.isfinite(ref) & (ref <= p["ymax"])) >= 0.6, f"{slug}: courbe hors du cadre"
            # on voit la courbe retomber puis se stabiliser : sur les 8 % du bord droit (et du bord gauche,
            # sauf si elle part de 0), la densité est presque nulle
            if slug != "uniforme-continue":
                top = np.nanmax(np.where(ref <= p["ymax"], ref, np.nan))
                edge = max(1, int(0.08 * ref.size))
                assert np.nanmax(ref[-edge:]) <= 0.02 * top, f"{slug}: pas de stabilisation visible à droite"
                if p["x0"] > 0 or slug == "normale":
                    assert np.nanmax(ref[:edge]) <= 0.02 * top, f"{slug}: pas de stabilisation visible à gauche"


@pytest.mark.parametrize("slug", list(PARAMS))
def test_simulation_et_donnees(slug):
    law = LAWS[slug]
    for prm in PARAMS[slug]:
        for n in SIZES:
            x = simulate(law, prm, n, seed=n)
            r = analyse(law, x)
            check(slug, x, for_sample(law, x, "sim", prm, r["moments"]))
            check(slug, x, for_sample(law, x, "data", moments=r["moments"]))


@pytest.mark.parametrize("slug", list(PARAMS))
def test_valeurs_aberrantes(slug):
    """Une poignée de valeurs extrêmes ne doit pas écraser l'histogramme."""
    law = LAWS[slug]
    x = simulate(law, PARAMS[slug][1], 3000, seed=1)
    span = float(np.ptp(x)) or 1.0
    x = np.concatenate([x, x.max() + 200 * span * np.arange(1, 4)])
    if law.discrete:
        x = np.round(x)
    r = analyse(law, x)
    check(slug, x, for_sample(law, x, "data", moments=r["moments"]), correct_law=False)


def test_mauvaise_loi():
    """Données normales loin de 0 analysées comme exponentielles, gamma ou Weibull : graphique lisible."""
    rng = np.random.default_rng(2)
    x = rng.normal(100, 1, 2000)
    for slug in ("exponentielle", "gamma", "weibull", "uniforme-continue"):
        r = analyse(LAWS[slug], x)
        check(slug, x, for_sample(LAWS[slug], x, "data", moments=r["moments"]), correct_law=False)


def test_donnees_extremes():
    rng = np.random.default_rng(3)
    cases = {"normale": [np.full(50, 7.0), rng.normal(0, 1e-9, 500), rng.normal(1e9, 1, 500)],
             "gamma": [rng.gamma(0.2, 1e-6, 4000), rng.gamma(900, 1, 4000)],
             "weibull": [rng.weibull(0.3, 4000) * 1e5],
             "poisson": [np.zeros(30), np.full(30, 3.0)]}
    for slug, datasets in cases.items():
        for x in datasets:
            r = analyse(LAWS[slug], x)
            p = for_sample(LAWS[slug], x, "data", moments=r["moments"])
            assert math.isfinite(p["x0"]) and math.isfinite(p["x1"])
            assert p["x1"] >= p["x0"] if p["discrete"] else p["x1"] > p["x0"]   # une seule valeur k possible en discret
            assert math.isfinite(p["ymax"]) and p["ymax"] > 0
