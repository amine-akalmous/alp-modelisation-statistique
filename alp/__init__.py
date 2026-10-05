"""ALP — Atelier de lois de probabilité (application Flask)."""
from flask import Flask


def create_app() -> Flask:
    app = Flask(__name__, static_folder="../static", template_folder="../templates")
    app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024    # requêtes limitées à 4 Mo
    app.config["JSON_SORT_KEYS"] = False
    app.json.ensure_ascii = False

    from .routes import bp
    app.register_blueprint(bp)
    return app
