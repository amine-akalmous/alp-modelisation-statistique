"""Tests : pages, API, et justesse des estimateurs."""
import math

import numpy as np
import pytest

from alp import create_app
from alp.laws import LAWS, analyse, simulate

TRUE = {"bernoulli": [0.3], "binomiale": [10, 0.4], "poisson": [4], "geometrique": [0.3],
        "uniforme-discrete": [1, 6], "uniforme-continue": [0, 3], "exponentielle": [1.5],
        "normale": [50, 4], "gamma": [2, 0.5], "weibull": [1.5, 2]}


@pytest.fixture
def client():
    return create_app().test_client()


@pytest.mark.parametrize("url", ["/", "/guide", "/a-propos"] + [f"/loi/{s}" for s in LAWS])
def test_pages(client, url):
    r = client.get(url)
    assert r.status_code == 200
    assert "Amine Akalmous" in r.get_data(as_text=True)


def test_referencement(client):
    r = client.get("/robots.txt")
    assert r.status_code == 200 and "Sitemap: https://alpstat.pythonanywhere.com/sitemap.xml" in r.get_data(as_text=True)
    xml = client.get("/sitemap.xml").get_data(as_text=True)
    assert xml.count("<url>") == 2 * (3 + len(LAWS)) and "/loi/normale" in xml and "/en/law/normal" in xml
    html = client.get("/a-propos").get_data(as_text=True)
    assert "<title>Amine Akalmous" in html and 'rel="canonical" href="https://alpstat.pythonanywhere.com/a-propos"' in html
    assert '"name":"Amine Akalmous"' in html and "og:image" in html
    assert html.count("<title>") == 1


def test_page_inconnue(client):
    assert client.get("/loi/inconnue").status_code == 404
    assert client.get("/nimporte-quoi").status_code == 404


# ---------------------------------------------------------------- version anglaise
EN_PAGES = {"/": "/en/", "/guide": "/en/guide", "/a-propos": "/en/about", "/loi/normale": "/en/law/normal",
            "/loi/uniforme-discrete": "/en/law/discrete-uniform", "/loi/geometrique": "/en/law/geometric"}


@pytest.mark.parametrize("fr_url,en_url", list(EN_PAGES.items()))
def test_pages_anglaises(client, fr_url, en_url):
    """Chaque page existe en anglais, et le sélecteur FR | EN relie les deux versions."""
    en = client.get(en_url)
    assert en.status_code == 200
    html = en.get_data(as_text=True)
    assert '<html lang="en">' in html and "Amine Akalmous" in html
    assert f'href="{fr_url}" hreflang="fr"' in html and f'hreflang="fr" href="https://alpstat.pythonanywhere.com{fr_url}"' in html
    fr = client.get(fr_url).get_data(as_text=True)
    assert '<html lang="fr">' in fr and f'href="{en_url}" hreflang="en"' in fr


def test_pages_anglaises_toutes_les_lois(client):
    from alp.i18n import SLUG_EN
    for s in LAWS:
        assert client.get(f"/en/law/{SLUG_EN[s]}").status_code == 200
    assert client.get("/en/law/normale").status_code == 404          # adresse française sous /en/ : introuvable
    r = client.get("/en/nothing-here")
    assert r.status_code == 404 and "This page" in r.get_data(as_text=True)


def test_api_en_anglais(client):
    """Avec l'en-tête X-ALP-Lang: en, les messages du serveur sont en anglais."""
    h = {"X-ALP-Lang": "en"}
    r = client.post("/api/simulate", json={"law": "normale", "params": [0, -1], "n": 100}, headers=h)
    assert r.status_code == 400 and r.get_json()["error"] == "σ² must be strictly positive."
    j = client.post("/api/estimate", json={"law": "uniforme-continue", "data": [1, 2, 3]}, headers=h).get_json()
    assert j["gradient"]["reason"].startswith("The likelihood depends")
    j = client.post("/api/estimate", json={"law": "binomiale", "data": [3, 4, 5, 2, 6, 4]}, headers=h).get_json()
    assert not j["gradient"].get("note") or j["gradient"]["note"].startswith("n is fixed")


def test_api_export_anglais(client):
    """Export demandé depuis la version anglaise : fichiers en anglais, nombres avec un point décimal."""
    import io
    from openpyxl import load_workbook
    sim = client.post("/api/simulate", json={"law": "normale", "params": [0, 1], "n": 300, "seed": 1}).get_json()
    body = {"law": "normale", "kind": "sim", "data": sim["sample"], "params": [0, 1], "seed": 1}
    h = {"X-ALP-Lang": "en"}
    xls = client.post("/api/export", json={**body, "format": "xlsx"}, headers=h)
    assert xls.status_code == 200 and "ALP_normal_simulation_" in xls.headers["Content-Disposition"]
    wb = load_workbook(io.BytesIO(xls.data))
    assert wb.sheetnames == ["Report", "Sample"]
    cells = [c for row in wb["Report"].iter_rows(values_only=True) for c in row if isinstance(c, str)]
    assert "Simulation report" in cells and "Empirical mean" in cells and "Descriptive statistics" in " ".join(cells)
    assert any(c.startswith("[") and ", " in c and c.endswith(")") for c in cells)   # classes notées [a, b)
    assert not any("Moyenne" in c or "Paramètre" in c for c in cells)
    pdf = client.post("/api/export", json={**body, "format": "pdf"}, headers=h)
    assert pdf.status_code == 200 and pdf.data[:4] == b"%PDF"


@pytest.mark.parametrize("slug", list(TRUE))
def test_estimateurs_retrouvent_les_parametres(slug):
    law = LAWS[slug]
    x = simulate(law, TRUE[slug], 40000, 7)
    r = analyse(law, x)
    for est, true in zip(r["moments"], TRUE[slug]):
        assert est == pytest.approx(true, rel=0.06, abs=0.05)
    g = r["gradient"]
    if law.gradient is None:
        assert g["applicable"] is False and g["reason"]
    else:
        assert g["applicable"] and g["converged"]
        for est, true in zip(g["params"], TRUE[slug]):
            assert est == pytest.approx(true, rel=0.06, abs=0.05)


def test_gradient_egal_formule_quand_mle_explicite():
    """Pour la normale, le maximum de vraisemblance a une forme explicite : les deux doivent coïncider."""
    law = LAWS["normale"]
    x = simulate(law, [10, 9], 5000, 3)
    r = analyse(law, x)
    assert r["gradient"]["params"] == pytest.approx(r["moments"], rel=1e-5)


def test_api_simulate_graine(client):
    body = {"law": "normale", "params": [0, 1], "n": 200, "seed": 42}
    a = client.post("/api/simulate", json=body).get_json()
    b = client.post("/api/simulate", json=body).get_json()
    assert a["sample"] == b["sample"] and len(a["sample"]) == 200
    assert set(a) >= {"stats", "moments", "gradient", "sample"}


@pytest.mark.parametrize("body,msg", [
    ({"law": "normale", "params": [0, -1], "n": 100}, "σ²"),
    ({"law": "normale", "params": [0, 1], "n": 1}, "n doit"),
    ({"law": "binomiale", "params": [2.5, 0.3], "n": 10}, "entier"),
    ({"law": "inconnue", "params": [1], "n": 10}, "inconnue"),
])
def test_api_simulate_erreurs(client, body, msg):
    r = client.post("/api/simulate", json=body)
    assert r.status_code == 400 and msg in r.get_json()["error"]


def test_api_estimate(client):
    r = client.post("/api/estimate", json={"law": "exponentielle", "data": [0.5, 1.2, 0.3, 2.2, 0.9]})
    j = r.get_json()
    assert r.status_code == 200
    assert j["moments"][0] == pytest.approx(1 / np.mean([0.5, 1.2, 0.3, 2.2, 0.9]))
    assert j["gradient"]["params"][0] == pytest.approx(j["moments"][0], rel=1e-4)
    assert j["stats"]["n"] == 5


@pytest.mark.parametrize("slug", list(LAWS))
@pytest.mark.parametrize("data", [[5.0] * 20, [0.0] * 20, [1.0] * 50 + [-1e12], [-1e6, 0.0, 1e6, 3.5], [1e-100, 2e-100, 3e-100], [1e70, 2e70]],
                         ids=["const", "zeros", "aberrante", "melange", "minuscule", "enorme"])
def test_donnees_extremes_sans_erreur_serveur(client, slug, data):
    """Quelles que soient les données : un résultat ou un message clair, jamais une erreur serveur (exports compris)."""
    assert client.post("/api/estimate", json={"law": slug, "data": data}).status_code == 200
    body = {"law": slug, "kind": "data", "data": data}
    assert client.post("/api/export", json={**body, "format": "xlsx"}).status_code == 200
    assert client.post("/api/export", json={**body, "format": "pdf"}).status_code == 200


def test_valeur_absurde_refusee_clairement(client):
    r = client.post("/api/estimate", json={"law": "normale", "data": [1e300, 2e300]})
    assert r.status_code == 400 and "trop grande" in r.get_json()["error"]


@pytest.mark.parametrize("scale", [1e-30, 1e-9, 1e-6, 1e3, 1e9, 1e30])
def test_gradient_independant_de_l_unite(scale):
    """Changer d'unité ne doit pas faire décrocher la montée de gradient (normale : elle retrouve la formule)."""
    x = np.random.default_rng(1).normal(5, 1, 1000) * scale
    r = analyse(LAWS["normale"], x)
    assert r["gradient"]["converged"]
    assert r["gradient"]["params"] == pytest.approx(r["moments"], rel=1e-5)


@pytest.mark.parametrize("outlier", [1e4, 1e6, 1e9, -1e6])
def test_gradient_avec_valeur_aberrante(outlier):
    x = np.append(np.random.default_rng(2).normal(10, 1, 200), outlier)
    r = analyse(LAWS["normale"], x)
    assert r["gradient"]["converged"]
    assert r["gradient"]["params"] == pytest.approx(r["moments"], rel=1e-5)


def test_export_petites_unites_lisibles():
    """Données de l'ordre de 1e-15 : les centres de classe et les graduations ne s'écrasent pas à 0."""
    from alp import export
    x = np.random.default_rng(3).normal(5, 1, 500) * 1e-15
    r = export.build_report(LAWS["normale"], x, "data", site="https://x", lang="fr")
    assert all(row[1] > 0 for row in r["dist"]["rows"])
    assert export.fr(5e-15) == "5,000e−15" and export.fr(0.5) == "0,5000"
    assert len(set(export._ticks(0, 8e-15, 9))) > 3
    assert export.to_pdf(r)[:4] == b"%PDF"


def test_export_ne_reporte_pas_un_gradient_non_converge(monkeypatch):
    """Sans convergence, le rapport le dit et ne donne pas les valeurs du gradient."""
    from alp import export, laws
    real = laws.gradient_ascent
    monkeypatch.setattr(laws, "gradient_ascent", lambda law, x: {**real(law, x), "converged": False, "iterations": 1})
    r = export.build_report(LAWS["normale"], np.array([1.0, 2.0, 4.0]), "data", site="https://x", lang="fr")
    assert "pas de convergence (arrêt après 1 itération)" in r["grad_text"]
    assert all(row[-1] is None for row in r["est"])


def test_api_estimate_hors_support(client):
    j = client.post("/api/estimate", json={"law": "gamma", "data": [-1, 2, 3]}).get_json()
    assert j["gradient"]["applicable"] is False


@pytest.mark.parametrize("slug", ["poisson", "normale", "uniforme-continue"])
def test_api_export(client, slug):
    """Le rapport PDF et le classeur Excel se fabriquent, avec graphique et feuille des valeurs."""
    import io
    from openpyxl import load_workbook
    sim = client.post("/api/simulate", json={"law": slug, "params": TRUE[slug], "n": 300, "seed": 1}).get_json()
    body = {"law": slug, "kind": "sim", "data": sim["sample"], "params": TRUE[slug], "seed": 1}
    pdf = client.post("/api/export", json={**body, "format": "pdf"})
    assert pdf.status_code == 200 and pdf.data[:4] == b"%PDF"
    assert f"ALP_{slug}_simulation_" in pdf.headers["Content-Disposition"]
    xls = client.post("/api/export", json={**body, "format": "xlsx", "kind": "data", "params": None})
    wb = load_workbook(io.BytesIO(xls.data))
    assert wb.sheetnames == ["Rapport", "Données"] and len(wb["Rapport"]._charts) == 1
    assert wb["Données"].max_row == 301
    stats = {row[1]: row[2] for row in wb["Rapport"].iter_rows(values_only=True) if row[1] in ("Moyenne empirique", "Observations n")}
    assert stats["Observations n"] == 300 and stats["Moyenne empirique"] == pytest.approx(sim["stats"]["mean"])


def test_api_export_invalide(client):
    assert client.post("/api/export", json={"law": "normale", "kind": "sim", "format": "docx", "data": [1, 2]}).status_code == 400
    assert client.post("/api/export", json={"law": "normale", "kind": "sim", "format": "pdf", "data": [1, 2], "params": [0, -1]}).status_code == 400


def test_api_requete_invalide(client):
    assert client.post("/api/estimate", data="pas du json", content_type="application/json").status_code == 400
    assert client.post("/api/estimate", json={"law": "normale", "data": [1]}).status_code == 400
    assert client.post("/api/estimate", json={"law": "normale", "data": [1, math.inf]}).status_code == 400
