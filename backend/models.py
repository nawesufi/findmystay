"""
================================================================================
  FindMyStay@UiTM — models.py
  Database models — one class per table, exactly matching your ERD
  (Section 3.4.3.1 of your proposal).
================================================================================
  TABLES:
    User            — registered UiTM students and house owners
    Houseowner      — extra info for house owner accounts
    Property        — rental listings
    UserPreference  — student housing preferences (budget, location, etc.)
    UserInteraction — tracks views, saves, clicks (used by SVD)
    Feedback        — student reviews after renting (used by VADER)
================================================================================
"""

from datetime import datetime
from extensions import db


# ══════════════════════════════════════════════════════════════════════════════
#  TABLE 1 — User
#  Stores all registered accounts (both students and house owners).
#  Role field distinguishes between the two types.
# ══════════════════════════════════════════════════════════════════════════════

class User(db.Model):
    __tablename__ = "users"

    id          = db.Column(db.Integer, primary_key=True)
    email       = db.Column(db.String(120), unique=True, nullable=False)
    password    = db.Column(db.String(256), nullable=False)
    full_name   = db.Column(db.String(100), nullable=False)
    gender      = db.Column(db.String(10))
    role        = db.Column(db.String(20), default="student")
    uitm_campus = db.Column(db.String(100))
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    # ── Demographic fields ────────────────────────────────────────────────────
    age           = db.Column(db.Integer)
    year_of_study = db.Column(db.Integer)
    home_state    = db.Column(db.String(50))
    transport     = db.Column(db.String(30))

    # ── Relationships ─────────────────────────────────────────────────────────
    # These allow Python to access related records easily.
    # e.g. user.preferences gives all preference records for this user.
    preferences  = db.relationship("UserPreference",  backref="user",
                                   lazy=True, cascade="all, delete-orphan")
    interactions = db.relationship("UserInteraction", backref="user",
                                   lazy=True, cascade="all, delete-orphan")
    feedbacks    = db.relationship("Feedback",        backref="user",
                                   lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        """Convert to dictionary for JSON API responses."""
        return {
            "id":            self.id,
            "email":         self.email,
            "full_name":     self.full_name,
            "gender":        self.gender,
            "role":          self.role,
            "uitm_campus":   self.uitm_campus,
            "created_at":    self.created_at.isoformat(),
            "age":           self.age,
            "year_of_study": self.year_of_study,
            "home_state":    self.home_state,
            "transport":     self.transport,
        }


# ══════════════════════════════════════════════════════════════════════════════
#  TABLE 2 — Houseowner
#  Extra info for accounts with role="houseowner".
#  Linked to Users table via user_id foreign key.
# ══════════════════════════════════════════════════════════════════════════════

class Houseowner(db.Model):
    __tablename__ = "houseowners"

    id                  = db.Column(db.Integer, primary_key=True)
    user_id             = db.Column(db.Integer, db.ForeignKey("users.id"),
                                    nullable=False)
    phone_number        = db.Column(db.String(20))
    verification_status = db.Column(db.String(20), default="pending")
    company_name        = db.Column(db.String(100))
    license_file        = db.Column(db.String(255))
    registered_at       = db.Column(db.DateTime, default=datetime.utcnow)

    properties = db.relationship("Property", backref="owner",
                                 lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id":                  self.id,
            "user_id":             self.user_id,
            "phone_number":        self.phone_number,
            "verification_status": self.verification_status,
            "company_name":        self.company_name,
        }


# ══════════════════════════════════════════════════════════════════════════════
#  TABLE 3 — Property
#  The core listing table. Contains all rental property details.
#  Used by BOTH content-based filtering (matching attributes)
#  and collaborative filtering (what users interact with).
#
#  property_features stores the TF-IDF text representation
#  so we don't recompute it every time.
# ══════════════════════════════════════════════════════════════════════════════

class Property(db.Model):
    __tablename__ = "properties"

    id                = db.Column(db.Integer, primary_key=True)
    owner_id          = db.Column(db.Integer, db.ForeignKey("houseowners.id"),
                                  nullable=True)   # null = scraped listing
    title             = db.Column(db.String(200),  nullable=False)
    address           = db.Column(db.String(300))
    area              = db.Column(db.String(100))  # e.g. Seremban, Segamat
    state             = db.Column(db.String(50))   # Negeri Sembilan / Melaka / Johor
    rental_price      = db.Column(db.Float,        nullable=False)
    property_type     = db.Column(db.String(50))   # room / unit
    gender_preference = db.Column(db.String(20))   # male / female / any
    distance_to_campus = db.Column(db.Float)       # km
    latitude          = db.Column(db.Float)        # GPS latitude
    longitude         = db.Column(db.Float)        # GPS longitude
    nearest_campus    = db.Column(db.String(120))  # e.g. "UiTM Seremban 3 (NS)"
    furnished         = db.Column(db.String(30))   # fully / partial / unfurnished
    facilities        = db.Column(db.Text)         # wifi, aircon, parking, etc.
    description       = db.Column(db.Text)         # full listing text
    source            = db.Column(db.String(50),
                                  default="findmystay")  # mudah/ibilik/findmystay
    status            = db.Column(db.String(20),
                                  default="available")   # available / rented
    property_features = db.Column(db.Text)         # TF-IDF text (computed once)
    sentiment_score   = db.Column(db.Float, default=0.0)  # VADER score
    adjusted_rating   = db.Column(db.Float, default=3.0)  # NLP-adjusted rating
    image_url         = db.Column(db.String(500))  # landlord-provided photo URL
    created_at        = db.Column(db.DateTime, default=datetime.utcnow)

    interactions = db.relationship("UserInteraction", backref="property",
                                   lazy=True, cascade="all, delete-orphan")
    feedbacks    = db.relationship("Feedback",        backref="property",
                                   lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id":                 self.id,
            "title":              self.title,
            "address":            self.address,
            "area":               self.area,
            "state":              self.state,
            "rental_price":       self.rental_price,
            "property_type":      self.property_type,
            "gender_preference":  self.gender_preference,
            "distance_to_campus": self.distance_to_campus,
            "latitude":           self.latitude,
            "longitude":          self.longitude,
            "nearest_campus":     self.nearest_campus,
            "furnished":          self.furnished,
            "facilities":         self.facilities,
            "description":        self.description,
            "source":             self.source,
            "status":             self.status,
            "sentiment_score":    self.sentiment_score,
            "adjusted_rating":    self.adjusted_rating,
            "image_url":          self.image_url,
            "created_at":         self.created_at.isoformat(),
        }


# ══════════════════════════════════════════════════════════════════════════════
#  TABLE 4 — UserPreference
#  Stores what each student says they want in accommodation.
#  This is the input to content-based filtering.
#  One user can update preferences over time — each update = new record.
# ══════════════════════════════════════════════════════════════════════════════

class UserPreference(db.Model):
    __tablename__ = "user_preferences"

    id                  = db.Column(db.Integer, primary_key=True)
    user_id             = db.Column(db.Integer, db.ForeignKey("users.id"),
                                    nullable=False)
    preferred_price_min = db.Column(db.Float, default=150)
    preferred_price_max = db.Column(db.Float, default=1500)
    preferred_distance  = db.Column(db.Float)   # max km from campus
    preferred_type      = db.Column(db.String(50))   # single/master/shared
    preferred_gender    = db.Column(db.String(20))   # male/female/any
    preferred_state     = db.Column(db.String(50))   # Johor / Melaka / NS
    preferred_facilities = db.Column(db.Text)        # wifi, aircon, etc.
    uitm_campus         = db.Column(db.String(100))  # which UiTM campus
    # importance_weights: how much each factor matters to this student
    # stored as JSON string: {"price": 0.4, "distance": 0.3, "facilities": 0.3}
    importance_weights  = db.Column(db.Text, default='{"price":0.4,"distance":0.3,"facilities":0.3}')
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        return {
            "id":                   self.id,
            "user_id":              self.user_id,
            "preferred_price_min":  self.preferred_price_min,
            "preferred_price_max":  self.preferred_price_max,
            "preferred_distance":   self.preferred_distance,
            "preferred_type":       self.preferred_type,
            "preferred_gender":     self.preferred_gender,
            "preferred_state":      self.preferred_state,
            "preferred_facilities": self.preferred_facilities,
            "uitm_campus":          self.uitm_campus,
            "importance_weights":   json.loads(self.importance_weights or "{}"),
            "created_at":           self.created_at.isoformat(),
        }


# ══════════════════════════════════════════════════════════════════════════════
#  TABLE 5 — UserInteraction
#  Records every time a student interacts with a listing.
#  This is the input to collaborative filtering (SVD).
#  The more interactions collected, the better SVD's recommendations.
#
#  interaction_type: view / save / inquiry / click
#  rating: optional explicit rating (1-5) if student rates a listing
# ══════════════════════════════════════════════════════════════════════════════

class UserInteraction(db.Model):
    __tablename__ = "user_interactions"

    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey("users.id"),
                                 nullable=False)
    property_id      = db.Column(db.Integer, db.ForeignKey("properties.id"),
                                 nullable=False)
    interaction_type = db.Column(db.String(20))  # view/save/inquiry/click
    rating           = db.Column(db.Float)        # explicit 1-5 star rating
    adjusted_rating  = db.Column(db.Float)        # NLP-adjusted rating
    timestamp        = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":               self.id,
            "user_id":          self.user_id,
            "property_id":      self.property_id,
            "interaction_type": self.interaction_type,
            "rating":           self.rating,
            "adjusted_rating":  self.adjusted_rating,
            "timestamp":        self.timestamp.isoformat(),
        }


# ══════════════════════════════════════════════════════════════════════════════
#  TABLE 6 — Feedback
#  Written reviews submitted by students after viewing or renting.
#  review_text is processed by VADER for sentiment analysis.
#  This is the source of review_text for NLP enrichment.
# ══════════════════════════════════════════════════════════════════════════════

class Feedback(db.Model):
    __tablename__ = "feedback"

    id                = db.Column(db.Integer, primary_key=True)
    user_id           = db.Column(db.Integer, db.ForeignKey("users.id"),
                                  nullable=False)
    property_id       = db.Column(db.Integer, db.ForeignKey("properties.id"),
                                  nullable=False)
    satisfaction_level = db.Column(db.Integer)  # 1-5 star rating
    comment           = db.Column(db.Text)       # written review text
    sentiment_score   = db.Column(db.Float)      # VADER score of comment
    created_at        = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":                 self.id,
            "user_id":            self.user_id,
            "property_id":        self.property_id,
            "satisfaction_level": self.satisfaction_level,
            "comment":            self.comment,
            "sentiment_score":    self.sentiment_score,
            "created_at":         self.created_at.isoformat(),
        }


class Notification(db.Model):
    __tablename__ = "notifications"

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type        = db.Column(db.String(20))     # enquiry / save / feedback
    message     = db.Column(db.String(300))
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=True)
    is_read     = db.Column(db.Boolean, default=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":          self.id,
            "user_id":     self.user_id,
            "type":        self.type,
            "message":     self.message,
            "property_id": self.property_id,
            "is_read":     self.is_read,
            "created_at":  self.created_at.isoformat(),
        }


class Enquiry(db.Model):
    __tablename__ = "enquiries"

    id          = db.Column(db.Integer, primary_key=True)
    student_id  = db.Column(db.Integer, db.ForeignKey("users.id"),      nullable=False)
    property_id = db.Column(db.Integer, db.ForeignKey("properties.id"), nullable=False)
    message     = db.Column(db.Text,    nullable=False)
    status      = db.Column(db.String(20), default="pending")  # pending / read / replied
    reply       = db.Column(db.Text)
    replied_at  = db.Column(db.DateTime)
    created_at  = db.Column(db.DateTime,   default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":          self.id,
            "student_id":  self.student_id,
            "property_id": self.property_id,
            "message":     self.message,
            "status":      self.status,
            "reply":       self.reply,
            "replied_at":  self.replied_at.isoformat() if self.replied_at else None,
            "created_at":  self.created_at.isoformat(),
        }
