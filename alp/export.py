"""Export des résultats d'une simulation ou d'une estimation : classeur Excel et rapport PDF.

Les deux fichiers ont le même contenu, construit une seule fois par build_report() :
paramètres, statistiques descriptives, estimation des paramètres, tableau de distribution
(effectifs observés et probabilités de la loi) et un graphique tiré de ce tableau.
Présentation volontairement sobre : tableaux à filets (PDF), tableaux et graphique natifs (Excel).
Les fichiers sont en français, ou en anglais quand l'export est demandé depuis la version anglaise du site.
"""
from __future__ import annotations

import io
import math
from contextvars import ContextVar
from datetime import date
from pathlib import Path

import numpy as np

from .i18n import NAME_EN, tr
from .laws import Law, analyse
from .plot import plot_data, valid

# Langue du fichier en cours de fabrication (fr ou en) : fixée par build_report, to_xlsx et to_pdf
_LG: ContextVar[str] = ContextVar("alp_export_lang", default="fr")


def _en() -> bool:
    return _LG.get() == "en"


# Textes fixes des deux fichiers → anglais
_EN = {
    "Rapport": "Report", "Généré le": "Generated on", "Élément": "Item", "Valeur": "Value", "Statistique": "Statistic",
    "1. Paramètres": "1. Parameters", "2. Statistiques descriptives": "2. Descriptive statistics",
    "3. Estimation des paramètres": "3. Parameter estimation", "Loi estimée": "Estimated distribution",
    "Fréquence / probabilité": "Frequency / probability", "Densité": "Density", "Valeur k": "Value k",
    "x (centre de classe)": "x (class center)", "ALP — Modélisation statistique": "ALP — Statistical modeling",
    "Figure 1 — Distribution empirique (fréquences) et loi en P(X = k).":
        "Figure 1 — Empirical distribution (relative frequencies) and probability mass function P(X = k).",
    "Figure 1 — Histogramme en densité et densité de la loi, comme sur le site.":
        "Figure 1 — Density histogram and probability density function of the distribution, as on the site.",
}


def _t(s: str) -> str:
    return _EN.get(s, s) if _en() else s


def _law_name(law: Law) -> str:
    return NAME_EN[law.slug] if _en() else law.name


# ---------------------------------------------------------------------------
# Mise en forme des nombres (à la française, ou à l'anglaise pour un export en anglais)
# ---------------------------------------------------------------------------
def fr(v, d: int = 4) -> str:
    """Nombre en notation française : virgule décimale, espace fine pour les milliers, vrai signe moins.
    En anglais : point décimal et virgule pour les milliers."""
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return "—"
    if isinstance(v, str):
        return v
    if isinstance(v, (int, np.integer)):
        s = f"{int(v):,}"
    elif d >= 4 and v != 0 and abs(v) < 5 * 10 ** -d:             # valeur très petite mais non nulle : 4 chiffres significatifs
        s = f"{float(v):.{3 - math.floor(math.log10(abs(v)))}f}".rstrip("0").rstrip(".")
    else:
        s = f"{float(v):,.{d}f}"
    if _en():
        return s.replace("-", "−")
    return s.replace(",", " ").replace(".", ",").replace("-", "−")


def fr_short(v) -> str:
    """Paramètre tel qu'il a été saisi : sans zéros inutiles (0,3 et non 0,3000)."""
    s, sep = fr(float(v), 6), "." if _en() else ","
    return s.rstrip("0").rstrip(sep) if sep in s else s


_valid = valid

# Sous le tableau des statistiques descriptives : définition des moments m_r et des moments centrés μ_r
# (texte de D. Ghorbanzadeh)
MOMENTS_INTRO = ("On obtient les résultats du tableau ci-dessus en utilisant les fonctions des moments "
                 "et des moments centrés définies par : ")
MOMENTS_TXT = MOMENTS_INTRO + "mᵣ = (1/n) Σ xᵢʳ  et  μᵣ = (1/n) Σ (xᵢ − m₁)ʳ, la somme portant sur i = 1, …, n."
MOMENTS_PDF = (MOMENTS_INTRO + "m<sub>r</sub> = (1/n) Σ<sub>i=1..n</sub> x<sub>i</sub><super>r</super>"
               "  et  μ<sub>r</sub> = (1/n) Σ<sub>i=1..n</sub> (x<sub>i</sub> − m<sub>1</sub>)<super>r</super>.")
MOMENTS_INTRO_EN = ("The results in the table above are obtained using the moment functions "
                    "and the central moment functions defined by: ")
MOMENTS_TXT_EN = MOMENTS_INTRO_EN + "mᵣ = (1/n) Σ xᵢʳ  and  μᵣ = (1/n) Σ (xᵢ − m₁)ʳ, where the sum runs over i = 1, …, n."
MOMENTS_PDF_EN = (MOMENTS_INTRO_EN + "m<sub>r</sub> = (1/n) Σ<sub>i=1..n</sub> x<sub>i</sub><super>r</super>"
                  "  and  μ<sub>r</sub> = (1/n) Σ<sub>i=1..n</sub> (x<sub>i</sub> − m<sub>1</sub>)<super>r</super>.")


# ---------------------------------------------------------------------------
# Distribution : le graphique calculé par alp/plot.py (le même que sur le site) et son tableau
# ---------------------------------------------------------------------------
def distribution(law: Law, x: np.ndarray, ref, est) -> dict:
    """Données du graphique + lignes du tableau. ref : loi théorique (simulation) ou ajustée (vos données) ;
    est : loi estimée par la formule explicite (simulation seulement)."""
    P = plot_data(law, x, ref, est)
    if P["discrete"]:
        ks, counts, freq = P["ks"], P["counts"], P["freq"]
        pr, pe = P["ref"], P["est"]
        tiny = lambda c, i: (c[i] or 0) < 5e-5 if c else True
        meaningful = [i for i in range(len(ks)) if counts[i] > 0 or not tiny(pr, i) or not tiny(pe, i)]
        lo, hi = (meaningful[0], meaningful[-1]) if meaningful else (0, len(ks) - 1)   # sans les queues vides
        P["rows"] = [[ks[i], counts[i], freq[i]] + ([pr[i]] if pr else []) + ([pe[i]] if pe else []) for i in range(lo, hi + 1)]
        P["obs"] = freq
    else:
        a, bw, nb = P["a"], P["bw"], len(P["counts"])
        centers = a + bw * (np.arange(nb) + 0.5)
        dec = int(np.clip(3 - math.floor(math.log10(bw)), 0, 6))
        with np.errstate(all="ignore"):
            dr = law.frozen(ref).pdf(centers) if ref is not None else None
            de = law.frozen(est).pdf(centers) if est is not None else None
        P["rows"] = []
        for i in range(nb):
            lo_, hi_ = fr(a + i * bw, dec), fr(a + (i + 1) * bw, dec)
            if _en():                                                # notation anglaise : [a, b) ; dernière classe [a, b]
                cls = f"[{lo_}, {hi_}{']' if i == nb - 1 else ')'}"
            else:                                                    # notation française : [a ; b[ ; dernière classe [a ; b]
                cls = f"[{lo_} ; {hi_}{']' if i == nb - 1 else '['}"
            P["rows"].append([cls, round(float(centers[i]), dec + 1),
                              int(P["counts"][i]), P["dens"][i]]
                             + ([float(dr[i])] if dr is not None else []) + ([float(de[i])] if de is not None else []))
    P["beyond"] = P["below"] + P["above"]
    return P


# ---------------------------------------------------------------------------
# Contenu commun aux deux formats
# ---------------------------------------------------------------------------
def build_report(law: Law, x: np.ndarray, kind: str, truth=None, seed=None, site: str = "", lang: str = "fr") -> dict:
    """Contenu du rapport, dans la langue demandée (fr ou en)."""
    tok = _LG.set("en" if lang == "en" else "fr")
    try:
        r = _build(law, x, kind, truth, seed, site)
    finally:
        _LG.reset(tok)
    r["lang"] = "en" if lang == "en" else "fr"
    return r


def _build(law: Law, x: np.ndarray, kind: str, truth, seed, site: str) -> dict:
    en = _en()
    name = _law_name(law)
    res = analyse(law, x)
    st, mom, g = res["stats"], res["moments"], res["gradient"]
    sim = kind == "sim"
    pnames = law.params
    join = "; " if en else " ; "
    if sim:
        info = ([("Distribution", name),
                 ("Parameters", join.join(f"{p} = {fr_short(v)}" for p, v in zip(pnames, truth))),
                 ("Sample size n", st["n"]),
                 ("Seed", "none (random draw)" if seed is None else seed)] if en else
                [("Loi", name),
                 ("Paramètres", join.join(f"{p} = {fr_short(v)}" for p, v in zip(pnames, truth))),
                 ("Taille de l'échantillon n", st["n"]),
                 ("Graine", "aucune (tirage aléatoire)" if seed is None else seed)])
        ref = truth
    else:
        ref = mom if _valid(law, mom) else None                  # loi ajustée du site : formule explicite
        info = ([("Fitted distribution", name), ("Number of values n", st["n"]), ("Data source", "user file or input")] if en else
                [("Loi ajustée", name), ("Nombre de valeurs n", st["n"]), ("Origine des données", "fichier ou saisie de l'utilisateur")])
        if ref is not None:
            info.append(("Selected parameters" if en else "Paramètres retenus", join.join(f"{p} = {fr(int(v)) if float(v).is_integer() else fr(v)}" for p, v in zip(pnames, ref))))

    as_int = law.discrete and all(v is not None and float(v).is_integer() for v in (st["min"], st["max"]))
    lo, hi = (int(st["min"]), int(st["max"])) if as_int else (st["min"], st["max"])   # loi discrète : bornes entières
    labels = (("Observations n", "Minimum", "Maximum", "Empirical mean", "Empirical variance", "Skewness", "Kurtosis") if en else
              ("Observations n", "Minimum", "Maximum", "Moyenne empirique", "Variance empirique", "Asymétrie", "Kurtosis"))
    stats_rows = list(zip(labels, (st["n"], lo, hi, st["mean"], st["var"], st["skew"], st["kurt"])))

    gp = g.get("params") if g.get("applicable") else None
    est_head = (["Parameter"] + (["True value"] if sim else []) + ["Closed-form estimator", "Gradient ascent"] if en else
                ["Paramètre"] + (["Valeur vraie"] if sim else []) + ["Formule explicite", "Montée de gradient"])
    entier = law.slug in ("binomiale", "uniforme-discrete")          # n, a, b : des entiers, affichés sans décimales
    as_int_p = lambda i, v: int(round(v)) if v is not None and entier and (law.slug != "binomiale" or i == 0) \
        and float(v).is_integer() else v
    est_rows = [[p] + ([truth[i]] if sim else []) + [as_int_p(i, mom[i] if i < len(mom) else None), as_int_p(i, gp[i] if gp else None)]
                for i, p in enumerate(pnames)]
    lg = "en" if en else "fr"
    if g.get("applicable"):
        it = g["iterations"]
        if en:
            conv = f"converged in {it} iteration{'s' if it > 1 else ''}" if g["converged"] else f"stopped after {it} iterations"
            grad_text = f"Gradient ascent: {conv}; final mean log-likelihood: {fr(g['loglik'])}."
        else:
            conv = f"convergence en {it} itération{'s' if it > 1 else ''}" if g["converged"] else f"arrêt après {it} itérations"
            grad_text = f"Montée de gradient : {conv} ; log-vraisemblance moyenne finale : {fr(g['loglik'])}."
        if g.get("note"):
            grad_text += " " + tr(g["note"], lg)
    else:
        reason = tr(g["reason"], lg)
        grad_text = ("Gradient ascent: " if en else "Montée de gradient : ") + reason[0].lower() + reason[1:]

    ref = ref if _valid(law, ref) else None
    est = mom if sim and _valid(law, mom) else None            # « Loi estimée » du site (formule explicite)
    dist = distribution(law, x, ref, est)
    # Mêmes noms que la légende du graphique sur le site
    note = ""
    b = dist["beyond"]
    if en:
        obs_label = "Simulated sample" if sim else "Your data"
        ref_label = "Theoretical distribution" if sim else "Fitted distribution (estimated parameters)"
        unit = "P(X = k)" if law.discrete else "density"
        head = (["Value k", "Count", "Observed frequency"] if law.discrete else ["Class", "Center", "Count", "Observed density"])
        if ref is not None:
            head.append(f"{'Theoretical' if sim else 'Fitted'} {unit}")
        if est is not None:
            head.append(f"Estimated {unit}")
        if b:
            note = f"{b} extreme value{'s' if b > 1 else ''} counted in n but outside the plotted range, to keep the chart readable."
        d = date.today()
        return {
            "sim": sim, "law": law, "site": site.replace("https://", "").rstrip("/"),
            "title": "Simulation report" if sim else "Estimation report",
            "law_line": f"{name} distribution · ALP — Statistical modeling",
            "date": f"{d:%B} {d.day}, {d.year}",
            "info": info, "stats": stats_rows, "est_head": est_head, "est": est_rows, "grad_text": grad_text,
            "dist": dist, "dist_head": head, "dist_note": note,
            "obs_label": obs_label, "ref_label": ref_label, "est_label": "Estimated distribution",
            "dist_title": "Empirical distribution and " + ("theoretical" if sim else "fitted") + " distribution",
            "sample": x, "sheet": "Sample" if sim else "Data",
        }
    obs_label = "Échantillon simulé" if sim else "Vos données"
    ref_label = "Loi théorique" if sim else "Loi ajustée (paramètres estimés)"
    unit = "P(X = k)" if law.discrete else "Densité"
    head = (["Valeur k", "Effectif", "Fréquence observée"] if law.discrete else ["Classe", "Centre", "Effectif", "Densité observée"])
    if ref is not None:
        head.append(f"{unit} {'théorique' if sim else 'ajustée'}")
    if est is not None:
        head.append(f"{unit} estimée")
    if b:
        note = (f"{b} valeur{'s' if b > 1 else ''} extrême{'s' if b > 1 else ''} compté{'es' if b > 1 else 'e'} dans n "
                "mais en dehors de la zone tracée, pour garder un graphique lisible.")
    return {
        "sim": sim, "law": law, "site": site.replace("https://", "").rstrip("/"),
        "title": "Rapport de simulation" if sim else "Rapport d’estimation",
        "law_line": f"Loi {name} · ALP — Modélisation statistique",
        "date": date.today().strftime("%d/%m/%Y"),
        "info": info, "stats": stats_rows, "est_head": est_head, "est": est_rows, "grad_text": grad_text,
        "dist": dist, "dist_head": head, "dist_note": note,
        "obs_label": obs_label, "ref_label": ref_label, "est_label": "Loi estimée",
        "dist_title": "Distribution empirique et loi " + ("théorique" if sim else "ajustée"),
        "sample": x, "sheet": "Échantillon" if sim else "Données",
    }


# ---------------------------------------------------------------------------
# Excel : tableaux et graphique natifs, style par défaut d'Excel
# ---------------------------------------------------------------------------
def _in_lang(fn):
    """Fabrique le fichier dans la langue du rapport (nombres et textes fixes)."""
    def wrapped(r: dict) -> bytes:
        tok = _LG.set(r.get("lang", "fr"))
        try:
            return fn(r)
        finally:
            _LG.reset(tok)
    wrapped.__name__, wrapped.__doc__ = fn.__name__, fn.__doc__
    return wrapped


@_in_lang
def to_xlsx(r: dict) -> bytes:
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, LineChart, Reference
    from openpyxl.chart.error_bar import ErrorBars
    from openpyxl.chart.series import SeriesLabel
    from openpyxl.chart.shapes import GraphicalProperties
    from openpyxl.drawing.line import LineProperties
    from openpyxl.styles import Alignment, Font
    from openpyxl.worksheet.table import Table, TableStyleInfo

    wb = Workbook()
    ws = wb.active
    ws.title = _t("Rapport")
    ws.sheet_view.showGridLines = False
    ws.sheet_format.defaultRowHeight = 18
    for c, w in zip("ABCDEFGH", (3, 30, 26, 18, 20, 20, 20, 3)):  # A : marge ; tableaux de B à G ; graphique en I
        ws.column_dimensions[c].width = w

    style = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
    gray = Font(color="595959")

    def _table(name, ref, head):
        """Tableau Excel natif, sans les boutons de filtre qui masquaient les titres de colonnes."""
        t = Table(displayName=name, ref=ref)
        t.tableStyleInfo = style
        t._initialise_columns()
        for c, h in zip(t.tableColumns, head):
            c.name = h
        t.autoFilter = None
        return t
    tables = {"n": 0}

    def section(row, text):
        ws.cell(row, 2, text).font = Font(bold=True, size=12)
        return row + 1

    def table(row, head, rows, fmts):
        """Tableau Excel natif (comme Ctrl+T) ; renvoie la première ligne libre après un blanc."""
        numeric = [j > 0 and all(isinstance(line[j], (int, float)) or line[j] is None for line in rows) for j in range(len(head))]
        for j, h in enumerate(head):                                 # titre aligné comme sa colonne
            ws.cell(row, 2 + j, h).alignment = Alignment(horizontal="right" if numeric[j] else "left")
        for i, line in enumerate(rows, 1):
            for j, v in enumerate(line):
                c = ws.cell(row + i, 2 + j, "—" if v is None else v)
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    c.number_format = fmts[j] if not (isinstance(v, int) and fmts[j] == "0.0000") else "0"
                    if isinstance(v, float) and v != 0 and abs(v) < 5e-4 and fmts[j] == "0.0000":
                        c.number_format = "0.0000####"                  # très petit mais non nul : 0,00009384 et non 0,0000
                c.alignment = Alignment(horizontal="right" if numeric[j] else "left")
        tables["n"] += 1
        last_col = chr(ord("B") + len(head) - 1)
        ws.add_table(_table(f"Tableau{tables['n']}", f"B{row}:{last_col}{row + len(rows)}", head))
        return row + len(rows) + 2

    ws["B1"] = r["title"]
    ws["B1"].font = Font(bold=True, size=16)
    ws["B2"] = r["law_line"]
    ws["B2"].font = Font(size=11, color="595959")
    ws["B3"] = f"{_t('Généré le')} {r['date']} · {r['site']}"
    ws["B3"].font = Font(size=10, color="808080")

    row = section(5, _t("1. Paramètres"))
    row = table(row, [_t("Élément"), _t("Valeur")], r["info"], ["@", "0"])   # n reste un nombre (pas de « nombre stocké en texte »)

    row = section(row, _t("2. Statistiques descriptives"))
    row = table(row, [_t("Statistique"), _t("Valeur")], r["stats"], ["@", "0.0000"])
    ws.cell(row - 1, 2, MOMENTS_TXT_EN if _en() else MOMENTS_TXT).font = gray   # définition des moments, sous les statistiques
    row += 1

    row = section(row, _t("3. Estimation des paramètres"))
    fmts = ["@"] + (["General"] if r["sim"] else []) + ["0.0000", "0.0000"]
    row = table(row, r["est_head"], r["est"], fmts)
    ws.cell(row - 1, 2, r["grad_text"]).font = gray
    row += 1

    row = section(row, "4. " + r["dist_title"])
    top = row
    d, disc = r["dist"], r["law"].discrete
    fmts = ["0", "0", "0.0000", "0.0000", "0.0000"] if disc else ["@", "0.0000", "0", "0.0000", "0.0000", "0.0000"]
    table(row, r["dist_head"], d["rows"], fmts)
    last = top + len(d["rows"])
    if r["dist_note"]:
        ws.cell(last + 1, 2, r["dist_note"]).font = gray

    # Graphique Excel construit sur le tableau, comme celui du site : barres = distribution empirique,
    # loi théorique (ou ajustée) et loi estimée par-dessus. Couleurs : celles du thème d'Excel.
    col = lambda j: 2 + j                                            # colonne Excel de la j-ième colonne du tableau
    obs_j = 2 if disc else 3
    cats = Reference(ws, min_col=col(0 if disc else 1), min_row=top + 1, max_row=last)
    bar = BarChart()
    bar.type, bar.grouping = "col", "clustered"
    bar.gapWidth = 60 if disc else 0
    bar.add_data(Reference(ws, min_col=col(obs_j), min_row=top + 1, max_row=last), titles_from_data=False)
    bar.set_categories(cats)
    bar.series[0].tx = SeriesLabel(v=r["obs_label"])
    bar.series[0].graphicalProperties.line.solidFill = "FFFFFF"     # liseré blanc : chaque barre se distingue
    bar.series[0].graphicalProperties.line.width = 9525
    j = obs_j + 1
    for label, present, dashed in ((r["ref_label"], d["ref"] is not None, False), (r["est_label"], d["est"] is not None, True)):
        if not present:
            continue
        ln = LineChart()
        ln.add_data(Reference(ws, min_col=col(j), min_row=top + 1, max_row=last), titles_from_data=False)
        ln.set_categories(cats)
        s = ln.series[0]
        s.tx = SeriesLabel(v=label)
        if disc:                                                     # loi discrète : bâtons (traits jusqu'à l'axe) + points
            colour = "C0504D" if not dashed else "9BBB59"            # rouge et vert du thème Excel par défaut
            s.graphicalProperties.line.noFill = True
            s.marker.symbol, s.marker.size = "circle", 6 if not dashed else 5
            s.marker.graphicalProperties = GraphicalProperties(solidFill=colour)
            s.marker.graphicalProperties.line.solidFill = colour
            if not dashed:                                           # bâton = barre d'erreur de −100 % (technique Excel classique)
                s.errBars = ErrorBars(errDir="y", errBarType="minus", errValType="percentage", val=100, noEndCap=True,
                                      spPr=GraphicalProperties(ln=LineProperties(solidFill=colour, w=19050)))
        else:                                                        # loi continue : courbe de densité
            s.marker.symbol = "none"
            s.smooth = True
            s.graphicalProperties.line.width = 22000
            if dashed:
                s.graphicalProperties.line.dashStyle = "dash"
        bar += ln
        j += 1
    bar.y_axis.title = _t("Fréquence / probabilité" if disc else "Densité")
    bar.x_axis.title = _t("Valeur k" if disc else "x (centre de classe)")
    bar.y_axis.number_format = "0.00"
    bar.x_axis.delete = bar.y_axis.delete = False
    n_cat = len(d["rows"])
    if n_cat > 12:                                                   # libellés de l'axe x lisibles : un sur plusieurs
        bar.x_axis.tickLblSkip = bar.x_axis.tickMarkSkip = math.ceil(n_cat / 10)
    bar.legend.position = "b"
    for t in (bar.x_axis.title, bar.y_axis.title):                   # titres d'axes à côté du graphique, pas par-dessus
        t.overlay = False
    bar.legend.overlay = False
    bar.width, bar.height = 18, 10
    ws.add_chart(bar, f"I{top}")

    ws.page_setup.orientation = "landscape"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToHeight = 0

    # Deuxième feuille : toutes les valeurs, pour les réutiliser ailleurs
    wd = wb.create_sheet(r["sheet"])
    wd.column_dimensions["A"].width, wd.column_dimensions["B"].width = 10, 16
    wd.append(["i", "x"])
    for i, v in enumerate(r["sample"].tolist(), 1):
        wd.append([i, int(v) if r["law"].discrete else v])
    wd.add_table(_table("Valeurs", f"A1:B{len(r['sample']) + 1}", ["i", "x"]))
    wd.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# PDF : mise en page de rapport classique (filets noirs, texte aéré, graphique en gris et noir)
# ---------------------------------------------------------------------------
_FONTS = Path(__file__).with_name("fonts")


def _fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if "DejaVu" not in pdfmetrics.getRegisteredFontNames():         # police avec les lettres grecques (θ, λ, μ, σ, Γ)
        pdfmetrics.registerFont(TTFont("DejaVu", str(_FONTS / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(_FONTS / "DejaVuSans-Bold.ttf")))


def _ticks(a: float, b: float, nmax: int, steps=(1, 2, 2.5, 5, 10)) -> list[float]:
    """Graduations « rondes » dans [a, b] (au plus nmax intervalles), comme sur le site."""
    raw = (b - a) / nmax
    mag = 10 ** math.floor(math.log10(raw))
    st = next(m * mag for m in steps if m * mag >= raw * 0.999)
    return [round(k * st, 10) + 0.0 for k in range(math.ceil(a / st - 1e-9), math.floor(b / st + 1e-9) + 1)]


def _dec(t: list[float]) -> int:
    st = t[1] - t[0] if len(t) > 1 else 1
    d = 0
    while d < 6 and abs(st * 10 ** d - round(st * 10 ** d)) > 1e-6:
        d += 1
    return d


def _chart(r: dict, width: float, height: float, site_colours: bool = False):
    """Même graphique que sur le site : distribution empirique en barres grises,
    loi théorique (ou ajustée) en trait plein, loi estimée en pointillés.
    site_colours : loi en bleu et loi estimée en noir, comme sur le site (sinon gris et noir, pour le rapport)."""
    from reportlab.graphics.shapes import Circle, Drawing, Line, PolyLine, Rect, String
    from reportlab.lib import colors

    ink, gray, light, edge = (colors.HexColor(c) for c in ("#1A1A1A", "#555555", "#D9D9D9", "#8C8C8C"))
    est_c = colors.HexColor("#6E6E6E")
    law_c = ink
    if site_colours:
        light, edge, law_c, est_c = (colors.HexColor(c) for c in ("#E4E7EE", "#8A93A6", "#2F5BFF", "#0A0F1E"))
    D, disc = r["dist"], r["law"].discrete
    d = Drawing(width, height)
    L, R, T, B = 40, 8, 6, 44
    pw, ph = width - L - R, height - T - B

    if disc:
        ks = D["ks"]
        v0, v1 = ks[0] - 0.7, ks[-1] + 0.7
    else:
        span = D["x1"] - D["x0"]
        v0, v1 = D["x0"] - 0.05 * span, D["x1"] + 0.05 * span      # 5 % de marge, comme sur le site
    ymax = D["ymax"]                                               # hauteur calculée par alp/plot.py, comme sur le site
    yt = _ticks(0, ymax, 6, (1, 2, 5, 10))
    sx = lambda v: L + pw * (v - v0) / (v1 - v0)
    sy = lambda v: B + ph * min(v, ymax) / ymax

    for j, t in enumerate(yt):                                      # grille horizontale et graduations verticales
        y = sy(t)
        if j:
            d.add(Line(L, y, L + pw, y, strokeColor=colors.HexColor("#E8E8E8"), strokeWidth=0.5))
        d.add(Line(L - 3, y, L, y, strokeColor=ink, strokeWidth=0.6))
        d.add(String(L - 6, y - 3, fr(t, _dec(yt)), fontName="DejaVu", fontSize=7.5, fillColor=gray, textAnchor="end"))

    if disc:                                                        # barres de largeur 0,7 centrées sur k
        for k, f in zip(ks, D["obs"]):
            if f > 0:
                d.add(Rect(sx(k - 0.35), B, sx(k + 0.35) - sx(k - 0.35), sy(f) - B, fillColor=light, strokeColor=edge, strokeWidth=0.5))
        for vals_, col, dash in ((D["ref"], law_c, None), (D["est"], est_c, [2.5, 2])):
            if vals_:
                for k, p in zip(ks, vals_):
                    if p is None or p <= 0:
                        continue
                    d.add(Line(sx(k), B, sx(k), sy(p), strokeColor=col, strokeWidth=1.1, strokeDashArray=dash))
                    d.add(Circle(sx(k), sy(p), 1.9, fillColor=col, strokeColor=col))
        xt = list(range(int(math.ceil(v0)), int(math.floor(v1)) + 1, max(1, math.ceil(len(ks) / 25))))
    else:                                                           # histogramme en densité + courbes sur 200 points
        a, bw = D["a"], D["bw"]
        for i, h in enumerate(D["dens"]):
            if h > 0:
                d.add(Rect(sx(a + i * bw), B, sx(a + (i + 1) * bw) - sx(a + i * bw), sy(h) - B, fillColor=light, strokeColor=edge, strokeWidth=0.4))
        for vals_, col, dash in ((D["ref"], law_c, None), (D["est"], est_c, [3, 2])):
            if vals_:                                              # la courbe s'interrompt hors du cadre (densité infinie)
                seg = []
                for x, y in list(zip(D["grid"], vals_)) + [(None, None)]:
                    if y is not None and y <= ymax:
                        seg += [sx(x), sy(y)]
                    else:
                        if len(seg) >= 4:
                            d.add(PolyLine(seg, strokeColor=col, strokeWidth=1.2, strokeDashArray=dash))
                        seg = []
        xt = _ticks(v0, v1, 9)
    for t in xt:
        xx = sx(t)
        d.add(Line(xx, B, xx, B - 3, strokeColor=ink, strokeWidth=0.6))
        d.add(String(xx, B - 12, fr(t, 0 if disc else _dec(xt)), fontName="DejaVu", fontSize=7.5, fillColor=gray, textAnchor="middle"))
    d.add(Line(L, B, L + pw, B, strokeColor=ink, strokeWidth=0.7))
    d.add(Line(L, B, L, B + ph, strokeColor=ink, strokeWidth=0.7))
    d.add(String(L + pw / 2, B - 25, _t("Valeur k") if disc else "x", fontName="DejaVu", fontSize=8, fillColor=gray, textAnchor="middle"))

    x, ly = L, 4                                                    # légende, dans l'ordre du site
    items = [("box", r["obs_label"])] + ([("ref", r["ref_label"])] if D["ref"] else []) + ([("est", r["est_label"])] if D["est"] else [])
    for kind, label in items:
        if kind == "box":
            d.add(Rect(x, ly, 10, 7, fillColor=light, strokeColor=edge, strokeWidth=0.5))
        else:
            d.add(Line(x, ly + 3.5, x + 14, ly + 3.5, strokeColor=law_c if kind == "ref" else est_c, strokeWidth=1.2,
                       strokeDashArray=None if kind == "ref" else [3, 2]))
        d.add(String(x + 18, ly + 1, label, fontName="DejaVu", fontSize=8, fillColor=ink))
        x += 30 + 4.6 * len(label)
    return d


@_in_lang
def to_pdf(r: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    _fonts()
    ink, gray = colors.HexColor("#1A1A1A"), colors.HexColor("#555555")
    s_title = ParagraphStyle("t", fontName="DejaVu-Bold", fontSize=18, leading=23, textColor=ink)
    s_sub = ParagraphStyle("s", fontName="DejaVu", fontSize=10.5, leading=15, textColor=gray, spaceBefore=3)
    s_h = ParagraphStyle("h", fontName="DejaVu-Bold", fontSize=12, leading=16, textColor=ink, spaceBefore=18, spaceAfter=8)
    s_body = ParagraphStyle("b", fontName="DejaVu", fontSize=9.5, leading=14, textColor=gray, spaceBefore=6)
    s_cap = ParagraphStyle("c", fontName="DejaVu", fontSize=9, leading=13, textColor=gray, spaceBefore=4, alignment=1)
    cell = ParagraphStyle("td", fontName="DejaVu", fontSize=10, leading=13, textColor=ink)
    cell_b = ParagraphStyle("th", parent=cell, fontName="DejaVu-Bold")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
                            title=r["title"] + (f" — {_law_name(r['law'])} distribution" if _en() else f" — loi {r['law'].name}"),
                            author=_t("ALP — Modélisation statistique"))
    W = doc.width

    def table(head, rows, widths, num_cols=()):
        """Tableau à filets : trait épais en haut et en bas, trait fin sous l'en-tête, aucune couleur."""
        def p(v, j, bold=False):
            st = ParagraphStyle("x", parent=cell_b if bold else cell, alignment=2 if j in num_cols else 0)
            return Paragraph(fr(v), st)
        data = ([[p(h, j, True) for j, h in enumerate(head)]] if head else []) + [[p(v, j) for j, v in enumerate(row)] for row in rows]
        t = Table(data, colWidths=widths, repeatRows=1 if head else 0, hAlign="LEFT")
        style = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
                 ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                 ("LINEABOVE", (0, 0), (-1, 0), 1, ink), ("LINEBELOW", (0, -1), (-1, -1), 1, ink)]
        if head:
            style.append(("LINEBELOW", (0, 0), (-1, 0), 0.5, ink))
        t.setStyle(TableStyle(style))
        return t

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("DejaVu", 8)
        canvas.setFillColor(gray)
        canvas.drawString(doc_.leftMargin, 11 * mm, f"{_t('ALP — Modélisation statistique')} · {r['site']}")
        canvas.drawRightString(A4[0] - doc_.rightMargin, 11 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    rule = Table([[""]], colWidths=[W], rowHeights=[0.1])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1, ink)]))
    story = [Paragraph(r["title"], s_title), Paragraph(r["law_line"], s_sub),
             Paragraph(f"{_t('Généré le')} {r['date']}", s_sub), Spacer(1, 8), rule]

    # Sections 1 et 2 côte à côte : la page 1 garde la place pour le graphique
    left = [Paragraph(_t("1. Paramètres"), s_h), table(None, r["info"], [W * 0.29, W * 0.25])]
    right = [Paragraph(_t("2. Statistiques descriptives"), s_h),
             table([_t("Statistique"), _t("Valeur")], r["stats"], [W * 0.25, W * 0.15], num_cols=(1,))]
    duo = Table([[left, right]], colWidths=[W * 0.58, W * 0.42], hAlign="LEFT")
    duo.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(duo)
    story.append(Paragraph(MOMENTS_PDF_EN if _en() else MOMENTS_PDF, s_body))   # définition des moments, sous les statistiques
    n_est = len(r["est_head"])
    est = [[row[0]] + ([fr_short(row[1])] if r["sim"] else []) + row[2 if r["sim"] else 1:] for row in r["est"]]   # valeur vraie telle que saisie
    story += [Paragraph(_t("3. Estimation des paramètres"), s_h),
              table(r["est_head"], est, [W * 0.22] + [W * 0.26] * (n_est - 1), num_cols=tuple(range(1, n_est))),
              Paragraph(r["grad_text"], s_body)]

    fig = _chart(r, W, 70 * mm)
    caption = _t("Figure 1 — Distribution empirique (fréquences) et loi en P(X = k)." if r["law"].discrete
                 else "Figure 1 — Histogramme en densité et densité de la loi, comme sur le site.")
    story.append(KeepTogether([Paragraph("4. " + r["dist_title"], s_h), fig, Paragraph(caption, s_cap)]
                              + ([Paragraph(r["dist_note"], s_cap)] if r["dist_note"] else [])))
    head, rows = r["dist_head"], r["dist"]["rows"]
    widths = ([W * 0.16, W * 0.16, W * 0.22] if r["law"].discrete else [W * 0.25, W * 0.11, W * 0.12, W * 0.16])
    rest = (W - sum(widths)) / max(1, len(head) - len(widths))
    widths = (widths + [rest] * (len(head) - len(widths)))[:len(head)]
    story += [Spacer(1, 12), table(head, rows, widths, num_cols=tuple(range(1, len(head))))]
    if _en():
        story.append(Paragraph(("All the sample values" if r["sim"] else "All your data")
                               + " are included in the Excel export (sheet “" + r["sheet"] + "”).", s_body))
    else:
        story.append(Paragraph(("Toutes les valeurs de l’échantillon" if r["sim"] else "Toutes vos données")
                               + " figurent dans l’export Excel (feuille « " + r["sheet"] + " »).", s_body))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
