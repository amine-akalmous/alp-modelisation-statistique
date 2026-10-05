"""Pages du site et API de calcul."""
from flask import Blueprint, abort, jsonify, render_template, request

from .laws import LAWS, MAX_N, LawError, analyse, check_data, check_params, clean, get_law, simulate

bp = Blueprint("site", __name__)


# ---------------------------------------------------------------- pages
@bp.get("/")
def accueil():
    return render_template("accueil.html", page="accueil")


@bp.get("/guide")
def guide():
    return render_template("guide.html", page="guide")


@bp.get("/loi/<slug>")
def loi(slug):
    if slug not in LAWS:
        abort(404)
    return render_template("loi.html", page="lois", slug=slug, name=LAWS[slug].name)


@bp.get("/a-propos")
def a_propos():
    return render_template("a-propos.html", page="a-propos")


@bp.app_errorhandler(404)
def not_found(_):
    return render_template("404.html", page=""), 404


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
