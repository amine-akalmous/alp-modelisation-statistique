"""Point d'entrée : `python app.py` en local, `gunicorn app:app` en production."""
import os

from alp import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("FLASK_DEBUG") == "1")
