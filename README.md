# ALP · Modélisation statistique

Atelier de lois de probabilité : dix lois usuelles (cinq discrètes, cinq continues), chacune explorée en trois modes.

- **Propriétés** : définition, formules et moments calculés pour des paramètres tapés au clavier.
- **Simulation** : tirage d'un échantillon (graine facultative), statistiques descriptives, estimation des paramètres.
- **Application** : vos propres données (saisie, copier-coller, fichier `.txt` ou `.csv`), ajustement de la loi.

Chaque estimation est donnée de deux façons : par la **formule explicite** (méthode des moments) et par **montée de gradient** sur la log-vraisemblance (gradient analytique, pas de Barzilai-Borwein, garde-fou d'Armijo).

Projet personnel conçu et développé par **Amine Akalmous**.

## Structure

```
app.py               point d'entrée (local : python app.py ; production : gunicorn app:app)
alp/laws.py          les dix lois : validation, simulation (SciPy), statistiques, estimateurs
alp/routes.py        pages et API JSON (/api/simulate, /api/estimate, /api/health)
templates/           pages HTML (Jinja)
static/              style, scripts, images
tests/test_app.py    tests automatiques (pytest)
render.yaml          configuration de déploiement sur Render
```

## Lancer le site sur son ordinateur

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows (sous macOS / Linux : source .venv/bin/activate)
pip install -r requirements.txt
python app.py                   # puis ouvrir http://127.0.0.1:5000
```

Pour utiliser un autre port : `set PORT=5050` (Windows) avant `python app.py`.

## Tests

```bash
pip install pytest
python -m pytest -q
```

## Conventions de calcul

- Variance descriptive avec le diviseur n.
- Weibull, formule explicite : a par moindres carrés sur la fonction de répartition linéarisée (rangs médians (i − 0,3)/(n + 0,4)), puis b = m₁ / Γ(1 + 1/a).
- Graphes de l'exponentielle, de la Gamma et de la Weibull tracés sur [0, F⁻¹(0,999)] (conventions scipy.stats : Gamma avec scale = 1/b).
- Géométrique : support {1, 2, …}. Gamma : forme a, **taux** b. Weibull : forme a, échelle b.
- Lois uniformes : la vraisemblance n'est pas dérivable, la montée de gradient ne s'applique pas.
- Binomiale : n est fixé (estimation par les moments, arrondie) et seul p est obtenu par gradient.
- Les données envoyées à l'API ne sont ni enregistrées ni conservées.

## En ligne

https://alpstat.pythonanywhere.com
