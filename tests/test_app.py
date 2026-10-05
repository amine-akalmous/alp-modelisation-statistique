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


def test_page_inconnue(client):
    assert client.get("/loi/inconnue").status_code == 404
    assert client.get("/nimporte-quoi").status_code == 404


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


def test_api_estimate_hors_support(client):
    j = client.post("/api/estimate", json={"law": "gamma", "data": [-1, 2, 3]}).get_json()
    assert j["gradient"]["applicable"] is False


def test_api_requete_invalide(client):
    assert client.post("/api/estimate", data="pas du json", content_type="application/json").status_code == 400
    assert client.post("/api/estimate", json={"law": "normale", "data": [1]}).status_code == 400
    assert client.post("/api/estimate", json={"law": "normale", "data": [1, math.inf]}).status_code == 400
