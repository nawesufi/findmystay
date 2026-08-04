"""
================================================================================
  FindMyStay@UiTM — routes/properties.py
  Property listing endpoints.

  GET  /api/properties          — list all properties (with filters)
  GET  /api/properties/<id>     — get one property detail
  POST /api/properties          — add new property (houseowners only)
  PUT  /api/properties/<id>     — update property (owner only)
  DELETE /api/properties/<id>   — remove property (owner only)
================================================================================
"""

from flask              import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from extensions         import db
from models             import Property, User, Houseowner

properties_bp = Blueprint("properties", __name__)

# ── NLP search helpers ────────────────────────────────────────────────────────
# Maps word variants to their canonical form so searching "airconditioning"
# also matches listings that store "aircond" in property_features.
_LEMMA = {
    'bathrooms':'bathroom','toilets':'bathroom','toilet':'bathroom',
    'airconds':'aircond','aircons':'aircond','airconditioned':'aircond',
    'aircon':'aircond','conditioning':'aircond','ac':'aircond',
    'parkings':'parking','carparks':'carpark',
    'minutes':'minute','mins':'minute','min':'minute',
    'kms':'km','kilometers':'km','kilometres':'km',
    'walking':'walk','walked':'walk','nearby':'near','close':'near',
    'utilities':'utility','facilities':'facility','amenities':'amenity',
    'washing':'washing machine','washer':'washing machine',
    'internet':'wifi','broadband':'wifi',
    'furnishing':'furnished','unfurnished':'unfurnished',
    'renovated':'renovated','renovation':'renovated',
    'secured':'security','secure':'security',
    'drive':'drive','driving':'drive',
    'transit':'transit','transport':'transit',
    'grab':'transit','taxi':'transit',
    'gymnasium':'gym','pools':'pool','swimming':'swimming pool',
}
_STOP = {
    'a','an','the','is','are','was','be','have','do','will','to','of',
    'in','for','on','with','at','by','from','and','or','not','this',
    'please','contact','call','room','unit','rent','rental','per',
}

def _nlp_tokens(raw):
    """Tokenise + lemmatise a search query, return list of normalised terms."""
    tokens = raw.lower().split()
    result = []
    for t in tokens:
        if t in _STOP or len(t) <= 1:
            continue
        result.append(_LEMMA.get(t, t))
    return list(dict.fromkeys(result)) or [raw.lower()]  # deduplicate, never empty


@properties_bp.route("", methods=["GET"])
def get_properties():
    """
    GET /api/properties
    Optional query parameters for filtering:
      ?state=Johor
      ?type=single
      ?min_price=200&max_price=700
      ?furnished=fully furnished
      ?campus=UiTM Seremban 3 (NS)

    Returns list of matching properties.
    """
    from sqlalchemy import or_
    query = Property.query.filter_by(status="available")

    # Apply filters if provided
    search    = request.args.get("search", "").strip()
    state     = request.args.get("state")
    p_type    = request.args.get("type")
    min_p     = request.args.get("min_price", type=float)
    max_p     = request.args.get("max_price", type=float)
    furnished = request.args.get("furnished")
    campus    = request.args.get("campus")

    if search:
        # NLP-aware search: lemmatise each token then match against raw text
        # AND property_features (pre-lemmatised text stored per listing).
        # "airconditioning" → "aircond" matches listings that stored "aircond".
        tokens = _nlp_tokens(search)
        token_conditions = []
        for token in tokens:
            like = f"%{token}%"
            token_conditions.append(or_(
                Property.title.ilike(like),
                Property.area.ilike(like),
                Property.description.ilike(like),
                Property.facilities.ilike(like),
                Property.property_features.ilike(like),
            ))
        # A listing matches if ANY token is found (broad recall)
        query = query.filter(or_(*token_conditions))
    if state:
        query = query.filter(Property.state.ilike(f"%{state}%"))
    if p_type:
        query = query.filter(Property.property_type.ilike(f"%{p_type}%"))
    if min_p:
        query = query.filter(Property.rental_price >= min_p)
    if max_p:
        query = query.filter(Property.rental_price <= max_p)
    if furnished:
        query = query.filter(Property.furnished.ilike(f"%{furnished}%"))
    if campus:
        query = query.filter(Property.nearest_campus.ilike(f"%{campus}%"))

    properties = query.order_by(Property.created_at.desc()).all()
    return jsonify([p.to_dict() for p in properties]), 200


@properties_bp.route("/<int:property_id>", methods=["GET"])
def get_property(property_id):
    """GET /api/properties/<id> — get one property's full details."""
    prop = Property.query.get_or_404(property_id)
    data = prop.to_dict()

    contact = None
    if prop.owner_id:
        owner = Houseowner.query.get(prop.owner_id)
        if owner:
            user = User.query.get(owner.user_id)
            contact = {
                "name":    user.full_name    if user  else "Landlord",
                "phone":   owner.phone_number or "",
                "company": owner.company_name or "",
                "email":   user.email        if user  else "",
            }
    data["contact"] = contact
    return jsonify(data), 200


@properties_bp.route("/mine", methods=["GET"])
@jwt_required()
def get_my_properties():
    """GET /api/properties/mine — returns only the logged-in landlord's listings."""
    user_id    = int(get_jwt_identity())
    houseowner = Houseowner.query.filter_by(user_id=user_id).first()
    if not houseowner:
        return jsonify({"error": "Houseowner profile not found"}), 404
    properties = (Property.query
                  .filter_by(owner_id=houseowner.id)
                  .order_by(Property.created_at.desc()).all())
    return jsonify([p.to_dict() for p in properties]), 200


@properties_bp.route("", methods=["POST"])
@jwt_required()
def add_property():
    """
    POST /api/properties
    Houseowners add new listings.
    Body (JSON): all property fields.
    """
    user_id = int(get_jwt_identity())
    user    = User.query.get_or_404(user_id)

    if user.role != "houseowner":
        return jsonify({"error": "Only house owners can add properties"}), 403

    houseowner = Houseowner.query.filter_by(user_id=user_id).first()
    if not houseowner:
        return jsonify({"error": "Houseowner profile not found"}), 404

    data = request.get_json()

    # ── Input validation ─────────────────────────────────────────
    import re as _re
    area = (data.get("area") or "").strip()
    if not area:
        return jsonify({"error": "Area / neighbourhood is required."}), 400
    if _re.search(r"\d", area):
        return jsonify({"error": "Area / neighbourhood must not contain numbers."}), 400

    title = (data.get("title") or "").strip()
    if title and _re.search(r"\d", title):
        return jsonify({"error": "Title must not contain numbers."}), 400

    try:
        price = float(data.get("rental_price") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "Monthly rent must be a number."}), 400
    if price <= 0:
        return jsonify({"error": "Monthly rent must be greater than 0."}), 400
    if price > 99999:
        return jsonify({"error": "Monthly rent value is unrealistically high."}), 400

    dist = data.get("distance_to_campus")
    if dist not in (None, ""):
        try:
            if float(dist) < 0:
                return jsonify({"error": "Distance to campus cannot be negative."}), 400
        except (TypeError, ValueError):
            return jsonify({"error": "Distance to campus must be a number."}), 400

    if not data.get("state"):
        return jsonify({"error": "State is required."}), 400

    # Compute sentiment on description for NLP enrichment
    from recommender import get_sentiment, compute_adjusted_rating
    description     = data.get("description", "")
    sentiment_score = get_sentiment(description)
    adj_rating, _   = compute_adjusted_rating(3.0, description)

    try:
        lat = float(data["latitude"])  if data.get("latitude")  else None
        lng = float(data["longitude"]) if data.get("longitude") else None
    except (ValueError, TypeError):
        lat = lng = None

    prop = Property(
        owner_id           = houseowner.id,
        title              = data.get("title"),
        address            = data.get("area"),
        area               = data.get("area"),
        state              = data.get("state"),
        rental_price       = data.get("rental_price"),
        property_type      = data.get("property_type"),
        gender_preference  = data.get("gender_preference", "any"),
        distance_to_campus = data.get("distance_to_campus"),
        nearest_campus     = data.get("nearest_campus") or None,
        latitude           = lat,
        longitude          = lng,
        furnished          = data.get("furnished"),
        facilities         = data.get("facilities"),
        description        = description,
        source             = "findmystay",
        sentiment_score    = sentiment_score,
        adjusted_rating    = adj_rating,
        image_url          = data.get("image_url"),
    )
    db.session.add(prop)
    db.session.commit()

    return jsonify({
        "message":  "Property added successfully",
        "property": prop.to_dict(),
    }), 201


@properties_bp.route("/<int:property_id>", methods=["PUT"])
@jwt_required()
def update_property(property_id):
    """PUT /api/properties/<id> — update a property listing."""
    user_id = int(get_jwt_identity())
    prop    = Property.query.get_or_404(property_id)

    # Only the owner can update
    houseowner = Houseowner.query.filter_by(user_id=user_id).first()
    if not houseowner or prop.owner_id != houseowner.id:
        return jsonify({"error": "Unauthorised"}), 403

    data = request.get_json()

    # ── Input validation ─────────────────────────────────────────
    import re as _re
    if "area" in data:
        area = (data.get("area") or "").strip()
        if _re.search(r"\d", area):
            return jsonify({"error": "Area / neighbourhood must not contain numbers."}), 400

    if "title" in data:
        title = (data.get("title") or "").strip()
        if title and _re.search(r"\d", title):
            return jsonify({"error": "Title must not contain numbers."}), 400

    if "rental_price" in data:
        try:
            price = float(data["rental_price"] or 0)
        except (TypeError, ValueError):
            return jsonify({"error": "Monthly rent must be a number."}), 400
        if price <= 0:
            return jsonify({"error": "Monthly rent must be greater than 0."}), 400
        if price > 99999:
            return jsonify({"error": "Monthly rent value is unrealistically high."}), 400

    if "distance_to_campus" in data and data["distance_to_campus"] not in (None, ""):
        try:
            if float(data["distance_to_campus"]) < 0:
                return jsonify({"error": "Distance to campus cannot be negative."}), 400
        except (TypeError, ValueError):
            return jsonify({"error": "Distance to campus must be a number."}), 400

    for field in ["title", "address", "area", "state", "rental_price",
                  "property_type", "gender_preference", "distance_to_campus",
                  "nearest_campus", "latitude", "longitude",
                  "furnished", "facilities", "description", "status", "image_url"]:
        if field in data:
            setattr(prop, field, data[field])

    # Re-compute sentiment if description changed
    if "description" in data:
        from recommender import get_sentiment, compute_adjusted_rating
        prop.sentiment_score  = get_sentiment(data["description"])
        prop.adjusted_rating, _ = compute_adjusted_rating(
            3.0, data["description"]
        )

    db.session.commit()
    return jsonify({"message": "Property updated", "property": prop.to_dict()}), 200


@properties_bp.route("/<int:property_id>", methods=["DELETE"])
@jwt_required()
def delete_property(property_id):
    """DELETE /api/properties/<id> — remove a listing."""
    user_id    = int(get_jwt_identity())
    prop       = Property.query.get_or_404(property_id)
    houseowner = Houseowner.query.filter_by(user_id=user_id).first()

    if not houseowner or prop.owner_id != houseowner.id:
        return jsonify({"error": "Unauthorised"}), 403

    db.session.delete(prop)
    db.session.commit()
    return jsonify({"message": "Property removed"}), 200
