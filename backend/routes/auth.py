"""
================================================================================
  FindMyStay@UiTM — routes/auth.py
  Authentication endpoints: register and login.

  POST /api/auth/register  — create a new account
  POST /api/auth/login     — login and receive a JWT token
  GET  /api/auth/me        — get current logged-in user's info
================================================================================
  HOW JWT AUTHENTICATION WORKS:
    1. Student registers or logs in.
    2. Server creates a JWT token — a signed string that proves identity.
    3. Student's frontend stores this token.
    4. Every future request includes the token in the header.
    5. Server verifies the token and knows who is making the request.
    6. Token expires after 24 hours — student must log in again.
================================================================================
"""

from flask              import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security  import generate_password_hash, check_password_hash
from extensions         import db
from models             import User, Houseowner

# Blueprint groups all auth routes under /api/auth
auth_bp = Blueprint("auth", __name__)


# ══════════════════════════════════════════════════════════════════════════════
#  REGISTER
#  Creates a new user account.
#  Accepts JSON body with user details.
#  Returns JWT token so user is immediately logged in after registering.
# ══════════════════════════════════════════════════════════════════════════════

@auth_bp.route("/register", methods=["POST"])
def register():
    """
    POST /api/auth/register
    Body (JSON):
    {
        "email":       "student@student.uitm.edu.my",
        "password":    "mypassword123",
        "full_name":   "Nawal Sufiyah",
        "gender":      "Female",
        "role":        "student",          (or "houseowner")
        "uitm_campus": "UiTM Seremban",
        "budget_min":  200,
        "budget_max":  700
    }
    """
    data = request.get_json() or {}

    # Validate required fields
    required = ["email", "password", "full_name"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"{field} is required"}), 400

    role = data.get("role", "student")

    # Check email is not already registered
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409

    # Hash the password — NEVER store plain text passwords
    hashed_password = generate_password_hash(data["password"])

    # Create the user
    user = User(
        email         = data["email"],
        password      = hashed_password,
        full_name     = data["full_name"],
        gender        = data.get("gender"),
        role          = role,
        uitm_campus   = data.get("uitm_campus"),
        age           = data.get("age"),
        year_of_study = data.get("year_of_study"),
        home_state    = data.get("home_state"),
        transport     = data.get("transport"),
    )
    db.session.add(user)
    db.session.flush()   # get user.id before commit

    # If registering as houseowner, create the extra houseowner record
    if role == "houseowner":
        houseowner = Houseowner(
            user_id      = user.id,
            phone_number = data.get("phone_number"),
            company_name = data.get("company_name"),
        )
        db.session.add(houseowner)

    db.session.commit()

    # Create JWT token — contains the user's ID
    token = create_access_token(identity=str(user.id))

    return jsonify({
        "message": "Account created successfully",
        "token":   token,
        "user":    user.to_dict(),
    }), 201


# ══════════════════════════════════════════════════════════════════════════════
#  LOGIN
#  Checks email and password, returns JWT token if correct.
# ══════════════════════════════════════════════════════════════════════════════

@auth_bp.route("/login", methods=["POST"])
def login():
    """
    POST /api/auth/login
    Body (JSON):
    {
        "email":    "student@student.uitm.edu.my",
        "password": "mypassword123"
    }
    Returns: { "token": "...", "user": {...} }
    """
    data = request.get_json()

    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password required"}), 400

    # Find user by email
    user = User.query.filter_by(email=data["email"]).first()

    # check_password_hash compares plain text with stored hash
    if not user or not check_password_hash(user.password, data["password"]):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_access_token(identity=str(user.id))

    return jsonify({
        "message": "Login successful",
        "token":   token,
        "user":    user.to_dict(),
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
#  GET CURRENT USER
#  @jwt_required() — this route requires a valid JWT token.
#  The frontend sends the token in the header:
#    Authorization: Bearer <token>
# ══════════════════════════════════════════════════════════════════════════════

@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def get_current_user():
    """
    GET /api/auth/me
    Header: Authorization: Bearer <token>
    Returns the logged-in user's profile.
    """
    user_id = int(get_jwt_identity())
    user    = User.query.get_or_404(user_id)
    return jsonify(user.to_dict()), 200


@auth_bp.route("/me", methods=["PUT"])
@jwt_required()
def update_profile():
    """
    PUT /api/auth/me
    Updates the logged-in user's personal and demographic info.
    Only the fields provided in the request body are updated.
    """
    user_id = int(get_jwt_identity())
    user    = User.query.get_or_404(user_id)
    data    = request.get_json()

    ALLOWED = ["full_name", "gender", "uitm_campus",
               "age", "year_of_study", "home_state", "transport"]
    for field in ALLOWED:
        if field in data:
            setattr(user, field, data[field] or None)

    db.session.commit()

    # Sync updated user back to any JWT identity-dependent caches
    return jsonify({"message": "Profile updated", "user": user.to_dict()}), 200
