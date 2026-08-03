"""
================================================================================
  FindMyStay@UiTM — Backend (app.py)
  Main entry point. Creates the Flask app, connects the database,
  and registers all the route blueprints.
================================================================================
  STACK:
    Flask          — lightweight Python web framework
    SQLAlchemy     — talks to the database using Python objects
    Flask-JWT      — handles login tokens (like a digital ID card)
    Scikit-learn   — TF-IDF and SVD for recommendations
    VADER          — sentiment analysis (NLP)
    SQLite         — simple file-based database (no server needed)
================================================================================
  HOW TO RUN:
    pip install -r requirements_backend.txt
    python app.py
================================================================================
"""

import os
from dotenv import load_dotenv
from flask import Flask, send_from_directory
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from extensions import db

load_dotenv()

def create_app():
    """
    App factory function.
    Creates and configures the Flask application.
    Returns the configured app object.
    """
    app = Flask(__name__)

    # SECRET_KEY: loaded from .env
    app.config["SECRET_KEY"]             = os.environ.get("SECRET_KEY")
    app.config["JWT_SECRET_KEY"]         = os.environ.get("SECRET_KEY")

    # DATABASE: loaded from .env (DB_URL)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DB_URL")

    # Disable modification tracking — not needed, saves memory
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # JWT tokens expire after 24 hours — user must log in again after that
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = 86400   # seconds

    # Upload folder for landlord license documents
    upload_folder = os.path.join(os.path.dirname(__file__), "uploads", "licenses")
    os.makedirs(upload_folder, exist_ok=True)
    app.config["LICENSE_UPLOAD_FOLDER"] = upload_folder
    app.config["MAX_CONTENT_LENGTH"]    = 10 * 1024 * 1024  # 10 MB limit

    # ── Initialise extensions ─────────────────────────────────────────────────
    db.init_app(app)        # connect SQLAlchemy to this app
    JWTManager(app)         # enable JWT authentication
    CORS(app)               # allow frontend (React/HTML) to call this API

    # ── Register route blueprints ─────────────────────────────────────────────
    # Each blueprint handles one group of related API endpoints.
    # Blueprints keep the code organised — instead of 500 lines in one file,
    # each feature lives in its own file.
    from routes.auth          import auth_bp
    from routes.properties    import properties_bp
    from routes.preferences   import preferences_bp
    from routes.recommend     import recommend_bp
    from routes.interactions  import interactions_bp
    from routes.feedback      import feedback_bp
    from routes.enquiries     import enquiries_bp
    from routes.stats         import stats_bp
    from routes.notifications import notifications_bp

    app.register_blueprint(auth_bp,          url_prefix="/api/auth")
    app.register_blueprint(properties_bp,    url_prefix="/api/properties")
    app.register_blueprint(preferences_bp,   url_prefix="/api/preferences")
    app.register_blueprint(recommend_bp,     url_prefix="/api/recommend")
    app.register_blueprint(interactions_bp,  url_prefix="/api/interactions")
    app.register_blueprint(feedback_bp,      url_prefix="/api/feedback")
    app.register_blueprint(enquiries_bp,     url_prefix="/api/enquiries")
    app.register_blueprint(stats_bp,         url_prefix="/api/stats")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")

    # ── Serve uploaded license files ──────────────────────────────────────────
    @app.route("/api/uploads/licenses/<filename>")
    def serve_license(filename):
        return send_from_directory(app.config["LICENSE_UPLOAD_FOLDER"], filename)

    # ── Create all database tables on first run ───────────────────────────────
    with app.app_context():
        db.create_all()
        _migrate(db)
        print("OK Database tables ready.")

    return app


def _migrate(db):
    """Add any missing columns to existing tables without dropping data."""
    from sqlalchemy import inspect, text

    _ROOM_KW = {'single', 'master', 'medium', 'shared', 'studio', 'double'}

    inspector = inspect(db.engine)

    # ── properties table ──────────────────────────────────────────────────────
    prop_cols = {col["name"] for col in inspector.get_columns("properties")}
    with db.engine.connect() as conn:
        if "image_url" not in prop_cols:
            conn.execute(text("ALTER TABLE properties ADD COLUMN image_url VARCHAR(500)"))
            conn.commit()
            print("OK Migrated: added image_url to properties.")
        if "latitude" not in prop_cols:
            conn.execute(text("ALTER TABLE properties ADD COLUMN latitude FLOAT"))
            conn.commit()
        if "longitude" not in prop_cols:
            conn.execute(text("ALTER TABLE properties ADD COLUMN longitude FLOAT"))
            conn.commit()
        if "nearest_campus" not in prop_cols:
            conn.execute(text("ALTER TABLE properties ADD COLUMN nearest_campus VARCHAR(120)"))
            conn.commit()

        # Normalise legacy "house/unit" → "unit"
        conn.execute(text(
            "UPDATE properties SET property_type = 'unit' "
            "WHERE property_type = 'house/unit'"
        ))

        # Classify property_type for any record still NULL or empty
        rows = conn.execute(text(
            "SELECT id, title FROM properties "
            "WHERE property_type IS NULL OR property_type = ''"
        )).fetchall()
        patched = 0
        for row in rows:
            pid   = row[0]
            title = (row[1] or "").lower()
            ptype = "room" if any(kw in title for kw in _ROOM_KW) else "unit"
            conn.execute(
                text("UPDATE properties SET property_type = :pt WHERE id = :id"),
                {"pt": ptype, "id": pid},
            )
            patched += 1
        if patched:
            conn.commit()
            print(f"OK Migrated: classified property_type for {patched} properties.")

    # ── houseowners table ─────────────────────────────────────────────────────
    ho_cols = {col["name"] for col in inspector.get_columns("houseowners")}
    with db.engine.connect() as conn:
        if "license_file" not in ho_cols:
            conn.execute(text("ALTER TABLE houseowners ADD COLUMN license_file VARCHAR(255)"))
            conn.commit()

    # ── enquiries table ───────────────────────────────────────────────────────
    enq_cols = {col["name"] for col in inspector.get_columns("enquiries")}
    with db.engine.connect() as conn:
        if "reply" not in enq_cols:
            conn.execute(text("ALTER TABLE enquiries ADD COLUMN reply TEXT"))
            conn.commit()
        if "replied_at" not in enq_cols:
            conn.execute(text("ALTER TABLE enquiries ADD COLUMN replied_at DATETIME"))
            conn.commit()


# ── Run the app ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = create_app()
    # debug=True: auto-reloads when you save a file, shows errors in browser
    # Turn debug=False before submitting / deploying
    app.run(debug=True, port=5000)
