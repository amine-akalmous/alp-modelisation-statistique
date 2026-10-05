"""ALP — Atelier de lois de probabilité (application Flask)."""
import os

from flask import Flask


def create_app() -> Flask:
    app = Flask(__name__, static_folder="../static", template_folder="../templates")
    app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024    # requêtes limitées à 4 Mo
    app.config["JSON_SORT_KEYS"] = False
    app.json.ensure_ascii = False
    # Adresse publique du site (liens canoniques, sitemap, aperçus de partage)
    app.config["SITE_URL"] = os.environ.get("SITE_URL", "https://alpstat.pythonanywhere.com").rstrip("/")
    # Code de vérification Google Search Console (balise meta), laissé vide tant qu'il n'est pas fourni
    app.config["GOOGLE_VERIFICATION"] = os.environ.get("GOOGLE_VERIFICATION", "")

    @app.context_processor
    def site_context():
        return {"site_url": app.config["SITE_URL"], "google_verification": app.config["GOOGLE_VERIFICATION"]}

    from .routes import bp
    app.register_blueprint(bp)
    return app
