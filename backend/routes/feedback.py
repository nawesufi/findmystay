from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import Feedback, Property, UserInteraction, User
from recommender import get_sentiment, compute_adjusted_rating
from routes.notifications import create_notification

feedback_bp = Blueprint("feedback", __name__)

@feedback_bp.route("", methods=["POST"])
@jwt_required()
def submit_feedback():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    prop = Property.query.get_or_404(data.get("property_id"))
    comment = data.get("comment", "")
    raw_rating = data.get("satisfaction_level", 3)
    sentiment = get_sentiment(comment)
    adj_rating, _ = compute_adjusted_rating(raw_rating, comment)
    feedback = Feedback(
        user_id=user_id, property_id=prop.id,
        satisfaction_level=raw_rating, comment=comment,
        sentiment_score=sentiment,
    )
    db.session.add(feedback)
    existing = (UserInteraction.query.filter_by(user_id=user_id, property_id=prop.id)
                .order_by(UserInteraction.timestamp.desc()).first())
    if existing:
        existing.rating = raw_rating
        existing.adjusted_rating = adj_rating

    # Recompute the property's overall adjusted_rating from its real reviews
    # (including this new one) so "Highly rated" reflects actual feedback
    # instead of staying frozen at the value baked in during data generation.
    db.session.flush()
    all_feedback = Feedback.query.filter_by(property_id=prop.id).all()
    scores = [
        max(1.0, min(5.0, f.satisfaction_level * (1 + 0.3 * (f.sentiment_score or 0))))
        for f in all_feedback
    ]
    prop.adjusted_rating = round(sum(scores) / len(scores), 2)

    student = User.query.get(user_id)
    name    = student.full_name if student else "A student"
    label   = prop.area or prop.title
    stars   = "★" * raw_rating + "☆" * (5 - raw_rating)
    create_notification(prop.id, "feedback",
                        f"{name} rated {label} {stars}")
    db.session.commit()
    return jsonify({"message": "Feedback submitted", "sentiment_score": sentiment, "adjusted_rating": adj_rating}), 201

@feedback_bp.route("/mine", methods=["GET"])
@jwt_required()
def get_my_feedback():
    user_id = int(get_jwt_identity())
    feedbacks = (Feedback.query.filter_by(user_id=user_id)
                 .order_by(Feedback.created_at.desc()).all())
    result = []
    for f in feedbacks:
        d = f.to_dict()
        prop = Property.query.get(f.property_id)
        if prop:
            d["property"] = {
                "title":       prop.title,
                "area":        prop.area,
                "state":       prop.state,
                "rental_price": prop.rental_price,
                "image_url":   prop.image_url,
            }
        result.append(d)
    return jsonify(result), 200


@feedback_bp.route("/<int:property_id>", methods=["GET"])
def get_property_feedback(property_id):
    feedbacks = (Feedback.query.filter_by(property_id=property_id)
                 .order_by(Feedback.created_at.desc()).all())
    result = []
    for f in feedbacks:
        d = f.to_dict()
        user = User.query.get(f.user_id)
        if user:
            parts = user.full_name.split()
            d["reviewer"] = parts[0] + " " + parts[-1][0] + "." if len(parts) > 1 else parts[0]
        else:
            d["reviewer"] = "Anonymous"
        result.append(d)
    return jsonify(result), 200
