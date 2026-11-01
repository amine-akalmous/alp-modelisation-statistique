"""Version anglaise du site : adresses /en/…, noms des lois et traduction des messages du serveur.

Le calcul reste en français dans le code ; seuls les textes montrés à l'utilisateur sont traduits ici.
La langue d'un appel à l'API est donnée par l'en-tête HTTP « X-ALP-Lang » (fr par défaut).
"""
from __future__ import annotations

import re

from flask import request

# Adresse anglaise de chaque loi : /en/law/<slug anglais>
SLUG_EN = {
    "bernoulli": "bernoulli", "binomiale": "binomial", "poisson": "poisson", "geometrique": "geometric",
    "uniforme-discrete": "discrete-uniform", "uniforme-continue": "continuous-uniform", "exponentielle": "exponential",
    "normale": "normal", "gamma": "gamma", "weibull": "weibull",
}
SLUG_FR = {en: fr for fr, en in SLUG_EN.items()}
NAME_EN = {
    "bernoulli": "Bernoulli", "binomiale": "Binomial", "poisson": "Poisson", "geometrique": "Geometric",
    "uniforme-discrete": "Discrete uniform", "uniforme-continue": "Continuous uniform", "exponentielle": "Exponential",
    "normale": "Normal", "gamma": "Gamma", "weibull": "Weibull",
}

# Messages du serveur (laws.py, routes.py) → anglais
_EN = {
    "θ doit être strictement compris entre 0 et 1.": "θ must lie strictly between 0 and 1.",
    "n doit être un entier compris entre 1 et 1000.": "n must be an integer between 1 and 1000.",
    "p doit être strictement compris entre 0 et 1.": "p must lie strictly between 0 and 1.",
    "λ doit être strictement positif et au plus 500.": "λ must be strictly positive and at most 500.",
    "a et b doivent être des entiers.": "a and b must be integers.",
    "Il faut a < b.": "a must be less than b.",
    "L'écart b − a doit rester inférieur à 1000.": "The gap b − a must be less than 1000.",
    "λ doit être strictement positif.": "λ must be strictly positive.",
    "σ² doit être strictement positif.": "σ² must be strictly positive.",
    "a et b doivent être strictement positifs.": "a and b must be strictly positive.",
    "a doit être compris entre 0,3 et 100.": "a must lie between 0.3 and 100.",
    "b doit être strictement positif.": "b must be strictly positive.",
    "Loi inconnue.": "Unknown distribution.",
    "Nombre de paramètres incorrect.": "Wrong number of parameters.",
    "Saisissez un nombre valide (par exemple 2,5).": "Enter a valid number (for example 2.5).",
    "Valeur trop grande (maximum 1 000 000 en valeur absolue).": "Value too large (at most 1,000,000 in absolute value).",
    "Les données doivent être une liste de nombres.": "The data must be a list of numbers.",
    "Les données doivent être des nombres.": "The data must be numbers.",
    "Il faut au moins 2 valeurs numériques.": "At least 2 numerical values are required.",
    "Valeur trop grande : les données doivent rester inférieures à 1e75 en valeur absolue.":
        "Value too large: the data must stay below 1e75 in absolute value.",
    "Requête invalide.": "Invalid request.",
    "Fichier trop volumineux (4 Mo maximum).": "File too large (4 MB maximum).",
    "n doit être un entier compris entre 2 et 100 000.": "n must be an integer between 2 and 100,000.",
    "La graine doit être un entier positif (ou laissée vide).": "The seed must be a non-negative integer (or left empty).",
    "Format d'export inconnu.": "Unknown export format.",
    "L'export n'est pas encore installé sur le serveur (bibliothèques openpyxl et reportlab manquantes).":
        "Export is not installed on the server yet (openpyxl and reportlab libraries are missing).",
    "Le fichier n'a pas pu être créé à cause d'une erreur du serveur.": "The file could not be created because of a server error.",
    # montée de gradient : pourquoi elle ne s'applique pas
    "Les données doivent valoir 0 ou 1, avec au moins un 0 et un 1.": "The data must be 0 or 1, with at least one 0 and one 1.",
    "Les données doivent être des entiers positifs, non tous nuls.": "The data must be non-negative integers, not all zero.",
    "Les données doivent être positives, non toutes nulles.": "The data must be non-negative, not all zero.",
    "Les données doivent être ≥ 1, non toutes égales à 1.": "The data must be ≥ 1, not all equal to 1.",
    "Les données doivent varier.": "The data must not all be equal.",
    "Les données doivent être strictement positives et varier.": "The data must be strictly positive and not all equal.",
    ("La vraisemblance dépend du minimum et du maximum des données : elle n'est pas dérivable, "
     "la montée de gradient ne s'applique pas. L'estimateur explicite est déjà celui du maximum de vraisemblance."):
        ("The likelihood depends on the minimum and maximum of the data: it is not differentiable, so gradient ascent "
         "does not apply. The closed-form estimator is already the maximum likelihood estimator."),
}
_PATTERNS = [
    (re.compile(r"^n est fixé à (\d+) ; seul p est obtenu par montée de gradient\.$"),
     r"n is fixed at \1; only p is obtained by gradient ascent."),
    (re.compile(r"^Trop de valeurs \(maximum ([\d\s ]+)\)\.$"), lambda m: f"Too many values (maximum {m.group(1).replace(' ', ',').replace(' ', ',')})."),
]


def lang() -> str:
    """Langue de la requête en cours : en-tête X-ALP-Lang, ou adresse /en/…"""
    h = (request.headers.get("X-ALP-Lang") or "").lower()
    if h in ("fr", "en"):
        return h
    return "en" if request.path.startswith("/en/") or request.path == "/en" else "fr"


def tr(msg, lg: str):
    """Traduit un message du serveur si la langue est l'anglais (sinon le renvoie tel quel)."""
    if lg != "en" or not isinstance(msg, str):
        return msg
    if msg in _EN:
        return _EN[msg]
    for rx, rep in _PATTERNS:
        if rx.match(msg):
            return rx.sub(rep, msg)
    return msg


def tr_analysis(out: dict, lg: str) -> dict:
    """Traduit les textes d'une analyse (raison ou note de la montée de gradient)."""
    g = out.get("gradient") or {}
    for k in ("reason", "note"):
        if k in g:
            g[k] = tr(g[k], lg)
    return out
