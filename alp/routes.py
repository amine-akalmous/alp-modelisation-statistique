"""Pages du site (français, et anglais sous /en/) et API de calcul."""
from datetime import date

import numpy as np
from flask import Blueprint, Response, abort, current_app, jsonify, render_template, request

from .i18n import NAME_EN, SLUG_EN, SLUG_FR, lang, tr, tr_analysis
from .laws import LAWS, MAX_N, LawError, analyse, check_data, check_params, clean, get_law, simulate
from .plot import for_sample

bp = Blueprint("site", __name__)

def page(template: str, lg: str, alt_url: str, **ctx):
    """Rend une page dans la langue voulue (gabarits anglais dans templates/en/, sauf la page d'une loi)."""
    name = template if lg == "fr" or template == "loi.html" else f"en/{template}"
    return render_template(name, lang=lg, alt_url=alt_url, **ctx)

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


LAW_DESC_EN = {
    "bernoulli": "a single trial with two outcomes, with parameter θ",
    "binomiale": "number of successes in n independent trials",
    "poisson": "number of rare events in a fixed interval",
    "geometrique": "number of trials until the first success",
    "uniforme-discrete": "equally likely integers between a and b",
    "uniforme-continue": "equally likely values on the interval [a, b]",
    "exponentielle": "waiting time of a memoryless process",
    "normale": "bell-shaped distribution with mean μ and variance σ²",
    "gamma": "positive, skewed quantities, shape a and rate b",
    "weibull": "lifetimes and reliability, shape a and scale b",
}


# ---------------------------------------------------------------- pages en français
@bp.get("/")
def accueil():
    return page("accueil.html", "fr", "/en/", page="accueil",
                meta_title="ALP — Modélisation statistique · par Amine Akalmous",
                meta_desc="ALP, atelier de modélisation statistique conçu par Amine Akalmous : dix lois de probabilité, "
                          "leurs formules, la simulation d'échantillons et l'estimation des paramètres "
                          "(méthode des moments et montée de gradient) à partir de vos données.")


@bp.get("/guide")
def guide():
    return page("guide.html", "fr", "/en/guide", page="guide",
                meta_title="Guide — ALP · Modélisation statistique",
                meta_desc="Ce qu'il faut savoir avant de simuler : choisir une loi, lire ses grandeurs, comprendre une "
                          "simulation, importer ses données et interpréter un ajustement.")


@bp.get("/loi/<slug>")
def loi(slug):
    if slug not in LAWS:
        abort(404)
    name = LAWS[slug].name
    return page("loi.html", "fr", f"/en/law/{SLUG_EN[slug]}", page="lois", slug=slug, name=name,
                meta_title=f"Loi {name} — formules, simulation et estimation · ALP",
                meta_desc=f"Loi {name} ({LAW_DESC[slug]}) : définition, espérance et variance, simulation d'échantillons "
                          "et estimation des paramètres par formule explicite et par montée de gradient.")


@bp.get("/a-propos")
def a_propos():
    return page("a-propos.html", "fr", "/en/about", page="a-propos",
                meta_title="Amine Akalmous — apprenti ingénieur R&D · ALP",
                meta_desc="Amine Akalmous, apprenti ingénieur recherche et développement chez EDF R&D et élève ingénieur "
                          "en systèmes électroniques, télécommunications et informatique à l'École d'ingénieurs du CNAM.")


# ---------------------------------------------------------------- pages en anglais
@bp.get("/en/")
@bp.get("/en")
def home_en():
    return page("accueil.html", "en", "/", page="accueil",
                meta_title="ALP — Statistical modeling · by Amine Akalmous",
                meta_desc="ALP, a statistical modeling workshop designed by Amine Akalmous: ten probability distributions, "
                          "their formulas, sample simulation and parameter estimation (method of moments and gradient "
                          "ascent) from your own data.")


@bp.get("/en/guide")
def guide_en():
    return page("guide.html", "en", "/guide", page="guide",
                meta_title="Guide — ALP · Statistical modeling",
                meta_desc="What to know before simulating: choosing a distribution, reading its quantities, understanding "
                          "a simulation, importing your data and interpreting a fit.")


@bp.get("/en/law/<slug_en>")
def law_en(slug_en):
    slug = SLUG_FR.get(slug_en)
    if slug is None:
        abort(404)
    name = NAME_EN[slug]
    return page("loi.html", "en", f"/loi/{slug}", page="lois", slug=slug, name=name,
                meta_title=f"{name} distribution — formulas, simulation and estimation · ALP",
                meta_desc=f"{name} distribution ({LAW_DESC_EN[slug]}): definition, mean and variance, sample simulation "
                          "and parameter estimation by closed-form formula and by gradient ascent.")


@bp.get("/en/about")
def about_en():
    return page("a-propos.html", "en", "/a-propos", page="a-propos",
                meta_title="Amine Akalmous — R&D engineering apprentice · ALP",
                meta_desc="Amine Akalmous, research and development engineering apprentice at EDF R&D and engineering "
                          "student in electronic systems, telecommunications and computer science at the CNAM "
                          "engineering school.")


@bp.app_errorhandler(404)
def not_found(_):
    if lang() == "en":
        return page("404.html", "en", "/", page="", meta_title="Page not found — ALP · Statistical modeling",
                    meta_desc="This page does not exist."), 404
    return page("404.html", "fr", "/en/", page="", meta_title="Page introuvable — ALP · Modélisation statistique",
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
    pages += [("/en/", "0.9"), ("/en/guide", "0.7"), ("/en/about", "0.6")] + [(f"/en/law/{SLUG_EN[s]}", "0.7") for s in LAWS]
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
    return jsonify(error=tr(str(e), lang())), 400


@bp.app_errorhandler(413)
def too_large(_):
    return jsonify(error=tr("Fichier trop volumineux (4 Mo maximum).", lang())), 413


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
    # Échantillon arrondi à 6 chiffres significatifs, puis analysé tel quel : les résultats affichés
    # et ceux d'un export (qui renvoie cet échantillon) sont ainsi exactement les mêmes.
    x = np.array([float(f"{v:.6g}") for v in x.tolist()])
    out = analyse(law, x)
    out["sample"] = clean(x.tolist())
    out["params"] = params
    out["plot"] = for_sample(law, x, "sim", params, out["moments"])     # graphique calculé ici, affiché tel quel
    return jsonify(tr_analysis(out, lang()))


@bp.post("/api/estimate")
def api_estimate():
    """Analyse des données fournies par l'utilisateur (rien n'est conservé)."""
    data = _payload()
    law = get_law(data.get("law"))
    x = check_data(data.get("data"))
    out = analyse(law, x)
    out["plot"] = for_sample(law, x, "data", moments=out["moments"])
    return jsonify(tr_analysis(out, lang()))


@bp.post("/api/export")
def api_export():
    """Rapport téléchargeable (PDF ou Excel) d'une simulation ou d'une estimation ; rien n'est conservé."""
    data = _payload()
    law = get_law(data.get("law"))
    fmt, kind = data.get("format"), data.get("kind")
    if fmt not in ("pdf", "xlsx") or kind not in ("sim", "data"):
        raise LawError("Format d'export inconnu.")
    x = check_data(data.get("data"))
    truth = seed = None
    if kind == "sim":
        truth = check_params(law, data.get("params"))
        seed = data.get("seed")
        if seed is not None and not (isinstance(seed, (int, float)) and float(seed).is_integer() and 0 <= seed < 2 ** 32):
            raise LawError("La graine doit être un entier positif (ou laissée vide).")
        seed = None if seed is None else int(seed)
    try:                                   # les deux bibliothèques de l'export sont vérifiées avant de commencer
        import openpyxl  # noqa: F401
        import reportlab  # noqa: F401
        from .export import build_report, to_pdf, to_xlsx
    except ImportError:
        raise LawError("L'export n'est pas encore installé sur le serveur (bibliothèques openpyxl et reportlab manquantes).") from None
    try:
        report = build_report(law, x, kind, truth, seed, site=current_app.config["SITE_URL"], lang=lang())
        body, mime = ((to_pdf(report), "application/pdf") if fmt == "pdf" else
                      (to_xlsx(report), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
    except Exception:                      # détail dans le journal d'erreurs du serveur, message clair pour l'utilisateur
        current_app.logger.exception("Échec de l'export %s (%s)", fmt, law.slug)
        raise LawError("Le fichier n'a pas pu être créé à cause d'une erreur du serveur.") from None
    slug = SLUG_EN[law.slug] if lang() == "en" else law.slug
    name = f"ALP_{slug}_{'simulation' if kind == 'sim' else 'estimation'}_{date.today():%Y-%m-%d}.{fmt}"
    return Response(body, mimetype=mime, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@bp.get("/api/health")
def health():
    return jsonify(status="ok", laws=len(LAWS))
