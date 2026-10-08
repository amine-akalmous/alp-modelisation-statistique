"""Pages du site et API de calcul."""
from datetime import date

from flask import Blueprint, Response, abort, current_app, jsonify, render_template, request

from .laws import LAWS, MAX_N, LawError, analyse, check_data, check_params, clean, get_law, simulate

bp = Blueprint("site", __name__)

# Une phrase par loi, pour la description de sa page dans les moteurs de recherche
LAW_DESC = {
    "bernoulli": "épreuve à deux issues, de paramètre θ",
    "binomiale": "nombre de succès parmi n épreuves indépendantes",
    "poisson": "nombre d'événements rares sur un intervalle fixe",
    "geometrique": "rang du premier succès dans une suite d'épreuves",
    "uniforme-discrete": "entiers équiprobables entre a et b",
    "uniforme-continue": "valeurs équiprobables sur l'intervalle [a, b]",
    "exponentielle": "temps d'attente d'un processus sans mémoire",
    "normale": "loi en cloche de moyenne μ et de variance σ²",
    "gamma": "grandeurs positives et asymétriques, forme a et taux b",
    "weibull": "durées de vie et fiabilité, forme a et échelle b",
}


# ---------------------------------------------------------------- pages
@bp.get("/")
def accueil():
    return render_template(
        "accueil.html", page="accueil",
        meta_title="ALP — Modélisation statistique · par Amine Akalmous",
        meta_desc="ALP, atelier de modélisation statistique conçu par Amine Akalmous : dix lois de probabilité, "
                  "leurs formules, la simulation d'échantillons et l'estimation des paramètres "
                  "(méthode des moments et montée de gradient) à partir de vos données.")


@bp.get("/guide")
def guide():
    return render_template(
        "guide.html", page="guide",
        meta_title="Guide — ALP · Modélisation statistique",
        meta_desc="Ce qu'il faut savoir avant de simuler : choisir une loi, lire ses grandeurs, comprendre une "
                  "simulation, importer ses données et interpréter un ajustement.")


@bp.get("/loi/<slug>")
def loi(slug):
    if slug not in LAWS:
        abort(404)
    name = LAWS[slug].name
    return render_template(
        "loi.html", page="lois", slug=slug, name=name,
        meta_title=f"Loi {name} — formules, simulation et estimation · ALP",
        meta_desc=f"Loi {name} ({LAW_DESC[slug]}) : définition, espérance et variance, simulation d'échantillons "
                  "et estimation des paramètres par formule explicite et par montée de gradient.")


@bp.get("/a-propos")
def a_propos():
    return render_template(
        "a-propos.html", page="a-propos",
        meta_title="Amine Akalmous — apprenti ingénieur R&D · ALP",
        meta_desc="Amine Akalmous, apprenti ingénieur recherche et développement chez EDF R&D et élève ingénieur "
                  "en systèmes électroniques, télécommunications et informatique à l'École d'ingénieurs du CNAM.")


@bp.app_errorhandler(404)
def not_found(_):
    return render_template("404.html", page="", meta_title="Page introuvable — ALP · Modélisation statistique",
                           meta_desc="Cette page n'existe pas."), 404


# ---------------------------------------------------------------- moteurs de recherche
@bp.get("/robots.txt")
def robots():
    site = current_app.config["SITE_URL"]
    return Response(f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {site}/sitemap.xml\n", mimetype="text/plain")


@bp.get("/sitemap.xml")
def sitemap():
    site, today = current_app.config["SITE_URL"], date.today().isoformat()
    pages = [("/", "1.0"), ("/guide", "0.8"), ("/a-propos", "0.7")] + [(f"/loi/{s}", "0.8") for s in LAWS]
    urls = "".join(f"<url><loc>{site}{p}</loc><lastmod>{today}</lastmod><priority>{pr}</priority></url>" for p, pr in pages)
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'
    return Response(xml, mimetype="application/xml")


# ---------------------------------------------------------------- API
def _payload() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise LawError("Requête invalide.")
    return data


@bp.errorhandler(LawError)
def law_error(e):
    return jsonify(error=str(e)), 400


@bp.app_errorhandler(413)
def too_large(_):
    return jsonify(error="Fichier trop volumineux (4 Mo maximum)."), 413


@bp.post("/api/simulate")
def api_simulate():
    """Tire un échantillon puis l'analyse : statistiques, formule explicite, montée de gradient."""
    data = _payload()
    law = get_law(data.get("law"))
    params = check_params(law, data.get("params"))
    n = data.get("n")
    if not (isinstance(n, (int, float)) and float(n).is_integer() and 2 <= n <= MAX_N):
        raise LawError("n doit être un entier compris entre 2 et 100 000.")
    seed = data.get("seed")
    if seed is not None and not (isinstance(seed, (int, float)) and float(seed).is_integer() and 0 <= seed < 2 ** 32):
        raise LawError("La graine doit être un entier positif (ou laissée vide).")
    x = simulate(law, params, int(n), None if seed is None else int(seed))
    out = analyse(law, x)
    out["sample"] = clean([float(f"{v:.6g}") for v in x.tolist()])
    out["params"] = params
    return jsonify(out)


@bp.post("/api/estimate")
def api_estimate():
    """Analyse des données fournies par l'utilisateur (rien n'est conservé)."""
    data = _payload()
    law = get_law(data.get("law"))
    x = check_data(data.get("data"))
    return jsonify(analyse(law, x))


@bp.get("/api/health")
def health():
    return jsonify(status="ok", laws=len(LAWS))
