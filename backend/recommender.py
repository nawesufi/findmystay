"""
================================================================================
  FindMyStay@UiTM — recommender.py
  Hybrid Recommendation Engine

  Implements the two-stage hybrid system described in your proposal
  (Section 3.5.1 and Figure 3.11):

  STAGE 1 — Content-Based Filtering (CBF)
    TF-IDF vectorises property descriptions and user query.
    Cosine similarity scores how closely each listing matches preferences.
    Returns top 50 candidates.

  STAGE 2 — Collaborative Filtering (CF)
    SVD (Singular Value Decomposition) re-ranks the 50 candidates
    based on what similar students preferred.
    Returns final top 10.

  NLP INPUT-LEVEL COMBINATION:
    VADER sentiment adjusts ratings before SVD trains on them.
    This is the input-level hybrid combination from your methodology.

  COLD-START HANDLING:
    New users (no interaction history) → CBF only (Stage 1 result).
    Returning users → Full hybrid (Stage 1 + Stage 2).
================================================================================
"""

import json
import math
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text  import TfidfVectorizer
from sklearn.metrics.pairwise         import cosine_similarity
from sklearn.decomposition            import TruncatedSVD
from sklearn.preprocessing            import MinMaxScaler
from vaderSentiment.vaderSentiment    import SentimentIntensityAnalyzer
from deep_translator                  import GoogleTranslator


# UiTM campus coordinates — must match frontend/src/campuses.js
CAMPUS_COORDS = {
    "uitm seremban 3 (ns)":      (2.6703, 101.9353),
    "uitm kuala pilah (ns)":     (2.7890, 102.2180),
    "uitm rembau (ns)":          (2.5111, 102.0633),
    "uitm melaka (alor gajah)":  (2.3679, 102.1801),
    "uitm jasin (melaka)":       (2.2212, 102.4523),
    "uitm bandaraya (melaka)":   (2.1907, 102.2465),
    "uitm segamat (johor)":      (2.4880, 102.7293),
    "uitm pasir gudang (johor)": (1.5267, 103.8780),
}

# ── Implicit feedback signal weights ─────────────────────────────────────────
# Converts interaction_type into a pseudo-rating when no explicit rating exists.
# Reflects relative strength of user intent (Hu et al., 2008):
#   passive view < active click < deliberate save < committed enquiry.
IMPLICIT_WEIGHTS: dict[str, float] = {
    "view":    1.5,
    "click":   2.0,
    "save":    3.5,
    "inquiry": 4.5,
}
IMPLICIT_DEFAULT = 2.0   # fallback for unknown or missing interaction types

# ── SVD hyperparameter grid ───────────────────────────────────────────────────
# Candidate n_components values evaluated during grid search.
# At runtime each candidate is capped at min(matrix_rows, matrix_cols) - 1.
SVD_COMPONENT_GRID = [5, 10, 15, 20, 25, 30]

# Re-tune only when this many NEW interactions have accumulated since the last
# tune. Avoids expensive re-computation on every recommendation request while
# keeping the model adaptive as real interaction data grows.
RETUNE_INTERVAL = 20

# ── Blend weight tiers (data-density heuristic) ──────────────────────────────
# SVD predictions become more reliable as the interaction matrix grows denser.
# Weights shift accordingly: more data → higher SVD_W, lower PREF_W.
# Format: (min_interactions, cbf_w, svd_w, pref_w)  — tiers checked top-down.
BLEND_WEIGHT_TIERS: list[tuple] = [
    (500, 0.30, 0.35, 0.35),   # dense   — SVD well-trained, increase its share
    (200, 0.32, 0.30, 0.38),   # medium  — balanced trust across all components
    (50,  0.35, 0.25, 0.40),   # sparse  — default prototype operating values
    (0,   0.35, 0.00, 0.65),   # minimal — SVD unreliable; rely on CBF + PREF
]

# ── Module-level cache for tuned hyperparameters ──────────────────────────────
# Stores the last grid-search result so it is not recomputed on every request.
_tuned_params: dict | None = None
_tuned_at_n_interactions: int = 0


def haversine_km(lat1, lng1, lat2, lng2):
    """Return great-circle distance in km between two GPS points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1))
         * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def dist_to_campus(prop, campus_name: str) -> float | None:
    """
    Compute distance (km) from a property to a named UiTM campus.
    Uses the property's GPS coordinates when available; falls back to
    the stored distance_to_campus only when the campus matches nearest_campus.
    Returns None if distance cannot be determined.
    """
    lat = prop.get("latitude")
    lng = prop.get("longitude")
    key = campus_name.lower().strip()

    if lat and lng:
        coords = CAMPUS_COORDS.get(key)
        if coords:
            return haversine_km(float(lat), float(lng), coords[0], coords[1])

    # Fallback: stored distance is only valid when nearest_campus matches
    stored_campus = str(prop.get("nearest_campus") or "").lower().strip()
    if key and stored_campus and key in stored_campus:
        d = prop.get("distance_to_campus")
        return float(d) if d is not None else None

    return None


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 — NLP HELPER (Input-level combination)
# ══════════════════════════════════════════════════════════════════════════════

def get_sentiment(text):
    """
    Run VADER sentiment analysis on any text.
    Translates to English first so Malay/Manglish reviews are scored correctly.
    Returns compound score: -1.0 (very negative) to +1.0 (very positive).
    """
    if not text or not str(text).strip():
        return 0.0
    try:
        translated = GoogleTranslator(source='auto', target='en').translate(str(text))
    except Exception:
        translated = str(text)
    return round(
        SentimentIntensityAnalyzer().polarity_scores(translated)["compound"],
        4
    )


def compute_adjusted_rating(raw_rating, review_text):
    """
    Input-level hybrid combination from proposal Section 3.5.1:
      adjusted = rating × (1 + 0.3 × sentiment_score)
      clamped between 1 and 5

    SVD trains on adjusted_rating, not raw star ratings.
    This means peer ratings are enriched with sentiment context
    before collaborative filtering begins.
    """
    sentiment = get_sentiment(review_text)
    adjusted  = float(raw_rating) * (1 + 0.3 * sentiment)
    return round(max(1.0, min(5.0, adjusted)), 2), sentiment


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 1b — IMPLICIT FEEDBACK HELPER
#
#  Converts a raw interaction record into an effective rating value.
#  Explicit adjusted_rating (from VADER-enriched star ratings) takes priority.
#  When absent, interaction_type is mapped to a pseudo-rating using
#  IMPLICIT_WEIGHTS, reflecting relative strength of user intent
#  (Hu et al., 2008 — "Collaborative Filtering for Implicit Feedback Datasets").
# ══════════════════════════════════════════════════════════════════════════════

def _derive_rating(row: dict) -> float:
    """
    Return an effective rating for one interaction record.
    Priority: explicit adjusted_rating → explicit raw rating → implicit signal.
    """
    explicit = row.get("adjusted_rating") or row.get("rating")
    if explicit and float(explicit) > 0:
        return float(explicit)
    itype = str(row.get("interaction_type") or "").lower().strip()
    return IMPLICIT_WEIGHTS.get(itype, IMPLICIT_DEFAULT)


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 1c — HYPERPARAMETER TUNING
#
#  Grid searches for the optimal SVD n_components by minimising RMSE on
#  known interaction ratings (non-zero entries in the user-item matrix).
#
#  Blend weights (cbf_w, svd_w, pref_w) are selected via a data-density
#  heuristic defined in BLEND_WEIGHT_TIERS: as the interaction matrix grows
#  denser, SVD predictions become more reliable, so its share increases.
#
#  Results are cached at module level (_tuned_params) and refreshed only
#  when RETUNE_INTERVAL new interactions have accumulated, avoiding
#  expensive recomputation on every recommendation request.
# ══════════════════════════════════════════════════════════════════════════════

def tune_hyperparameters(interactions: list, verbose: bool = False) -> dict:
    """
    Select optimal SVD n_components and blend weights for the current
    interaction matrix.

    Parameters:
      interactions : list of UserInteraction dicts from database
      verbose      : print RMSE per n_components when True

    Returns:
      dict with keys: n_components, cbf_w, svd_w, pref_w, rmse
    """
    n_int = len(interactions)

    # Select blend weights based on interaction density (BLEND_WEIGHT_TIERS)
    cbf_w, svd_w, pref_w = 0.35, 0.25, 0.40
    for min_n, cw, sw, pw in BLEND_WEIGHT_TIERS:
        if n_int >= min_n:
            cbf_w, svd_w, pref_w = cw, sw, pw
            break

    # Insufficient data for a meaningful grid search — return density-based weights
    if n_int < 10:
        return {
            "n_components": SVD_COMPONENT_GRID[0],
            "cbf_w": cbf_w, "svd_w": svd_w, "pref_w": pref_w,
            "rmse": None,
        }

    df = pd.DataFrame(interactions)
    df["_eff"] = df.apply(_derive_rating, axis=1)
    matrix = df.pivot_table(
        index="user_id", columns="property_id",
        values="_eff", aggfunc="mean", fill_value=0,
    )

    best_n    = SVD_COMPONENT_GRID[0]
    best_rmse = float("inf")

    for n in SVD_COMPONENT_GRID:
        n_capped = min(n, matrix.shape[0] - 1, matrix.shape[1] - 1)
        if n_capped < 1:
            continue
        svd   = TruncatedSVD(n_components=n_capped, random_state=42)
        U     = svd.fit_transform(matrix.values)
        V     = svd.components_.T
        recon = U @ V.T

        known = matrix.values > 0
        if not known.any():
            continue
        rmse = float(np.sqrt(((matrix.values[known] - recon[known]) ** 2).mean()))

        if verbose:
            print(f"    [tune] n_components={n_capped:2d}  RMSE={rmse:.4f}")

        if rmse < best_rmse:
            best_rmse = rmse
            best_n    = n_capped

    return {
        "n_components": best_n,
        "cbf_w":        cbf_w,
        "svd_w":        svd_w,
        "pref_w":       pref_w,
        "rmse":         round(best_rmse, 4),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — CONTENT-BASED FILTERING (Stage 1)
#
#  How it works:
#    1. Each property is represented as a text document combining
#       its description, facilities, type, location, and price range.
#    2. The student's preferences are converted into a similar text query.
#    3. TF-IDF converts both into numerical vectors.
#    4. Cosine similarity measures how closely each property matches
#       the student's preference query.
#    5. Top 50 properties by similarity score are returned.
#
#  Why TF-IDF:
#    Words that appear often in one listing but rarely across all listings
#    get a higher weight — e.g. "near UiTM" is more distinctive than
#    "room" which appears in every listing.
# ══════════════════════════════════════════════════════════════════════════════

def build_property_text(prop, user_campus=None):
    """
    Combine all property attributes into one text string for TF-IDF.
    user_campus: the student's preferred campus (lowercase). When supplied,
    the distance token reflects real GPS distance to that campus instead of
    the stored nearest-campus distance.
    """
    parts = [
        str(prop.get("title",        "") or ""),
        str(prop.get("description",  "") or ""),
        str(prop.get("facilities",   "") or ""),
        str(prop.get("property_type","") or ""),
        str(prop.get("furnished",    "") or ""),
        str(prop.get("area",         "") or ""),
        str(prop.get("state",        "") or ""),
        str(prop.get("review_text",  "") or ""),
    ]
    # Repeat state and type tokens to boost their TF-IDF weight
    parts.append(str(prop.get("state", "") or ""))
    parts.append(str(prop.get("property_type", "") or ""))

    # Add price bracket as a text token so TF-IDF learns price ranges
    price = prop.get("rental_price", 0) or 0
    if price < 400:
        parts.append("budget cheap affordable low price budget cheap affordable")
    elif price < 700:
        parts.append("mid range moderate price mid range moderate")
    else:
        parts.append("premium higher price premium expensive")

    # Distance token — use GPS distance to user's campus when known.
    if user_campus:
        dist = dist_to_campus(prop, user_campus)
    else:
        dist = prop.get("distance_to_campus", 0) or 0
    if dist and dist <= 1:
        parts.append("very near campus walking distance near campus uitm")
    elif dist and dist <= 3:
        parts.append("near campus short distance near uitm")
    elif dist and dist <= 10:
        parts.append("close campus moderate distance uitm")
    elif dist:
        parts.append("far campus longer distance far uitm")

    return " ".join(filter(None, parts)).lower()


def build_preference_query(preferences):
    """
    Convert a student's preferences into a text query for TF-IDF matching.
    Mirrors the same format as build_property_text() so cosine similarity
    can meaningfully compare them.

    preferences: dict from UserPreference.to_dict()
    """
    parts = []

    # Add preferred property type
    if preferences.get("preferred_type"):
        parts.append(preferences["preferred_type"])

    # Add preferred state
    if preferences.get("preferred_state"):
        parts.append(preferences["preferred_state"])

    # Add campus location
    if preferences.get("uitm_campus"):
        parts.append(preferences["uitm_campus"])
        parts.append("near campus uitm")

    # Add price preference as text
    price_max = preferences.get("preferred_price_max", 1500)
    if price_max <= 400:
        parts.append("budget cheap affordable low price")
    elif price_max <= 700:
        parts.append("mid range moderate price")
    else:
        parts.append("premium higher price")

    # Add distance preference — preferred_distance is a MAX, so always use "near campus"
    max_dist = preferences.get("preferred_distance")
    if max_dist:
        if float(max_dist) <= 2:
            parts.append("very near campus walking distance near uitm")
        elif float(max_dist) <= 5:
            parts.append("near campus short distance uitm")
        else:
            parts.append("near campus uitm distance")

    # Add facilities preference
    if preferences.get("preferred_facilities"):
        parts.append(preferences["preferred_facilities"])

    return " ".join(parts).lower()


def content_based_filter(properties, preferences, top_n=50):
    """
    Stage 1 of the hybrid system.

    Parameters:
      properties  : list of property dicts (from database)
      preferences : student preference dict (from UserPreference)
      top_n       : number of candidates to return (default 50)

    Returns:
      List of (property_dict, cbf_score) tuples, sorted by score descending.

    Steps:
      1. Build text document for every property
      2. Build query from student preferences
      3. TF-IDF vectorise all documents + query
      4. Compute cosine similarity between query and each property
      5. Return top_n properties sorted by similarity
    """
    if not properties:
        return []

    # Hard pre-filter: only consider properties matching the user's state and price range.
    # TF-IDF is text similarity — it cannot enforce hard constraints like state or budget.
    # Without this, listings from the wrong state/price can rank high on text alone.
    pref_campus = (preferences.get("uitm_campus") or "").lower().strip()
    price_max   = float(preferences.get("preferred_price_max") or 9999)
    price_min   = float(preferences.get("preferred_price_min") or 0)
    pref_type   = (preferences.get("preferred_type")   or "").lower().strip()

    # Use the user's explicit max distance; default to 15 km when not set.
    # This ensures we always search near the preferred campus even if the user
    # never filled in the distance field.
    _explicit_dist = float(preferences.get("preferred_distance") or 0)
    base_dist = _explicit_dist if _explicit_dist > 0 else 15.0

    # Derive state from campus when preferred_state is not explicitly set.
    _CAMPUS_STATE = {
        "uitm pasir gudang (johor)": "johor",
        "uitm segamat (johor)":      "johor",
        "uitm seremban 3 (ns)":      "negeri sembilan",
        "uitm kuala pilah (ns)":     "negeri sembilan",
        "uitm rembau (ns)":          "negeri sembilan",
        "uitm bandaraya (melaka)":   "melaka",
        "uitm melaka (alor gajah)":  "melaka",
        "uitm jasin (melaka)":       "melaka",
    }
    _explicit_state = (preferences.get("preferred_state") or "").lower().strip()
    pref_state = _explicit_state or (_CAMPUS_STATE.get(pref_campus, "") if pref_campus else "")

    # A property outside the preferred state is only allowed through when it's
    # genuinely close to the preferred campus (border-town campuses like Jasin
    # or Rembau can have nearby properties registered in a neighbouring state).
    # Beyond this radius, out-of-state listings are hard-excluded — no fallback
    # tier below is allowed to bypass this, unlike price/type/distance which
    # progressively relax.
    STATE_EXCEPTION_KM = 10.0

    def _state_ok(p):
        if not pref_state:
            return True
        if pref_state in str(p.get("state") or "").lower():
            return True
        # Out-of-state — allow only if within the campus-proximity exception.
        if pref_campus:
            d = dist_to_campus(p, pref_campus)
            if d is not None and d <= STATE_EXCEPTION_KM:
                return True
        return False

    def _passes(p, check_type=True, max_km=base_dist, price_ceiling=None):
        """Return True if property passes the active filters."""
        ceiling = price_ceiling if price_ceiling is not None else price_max
        # State — always enforced (with the near-campus exception above).
        if not _state_ok(p):
            return False
        # Budget ceiling
        if float(p.get("rental_price") or 0) > ceiling:
            return False
        # Property type — exact match ("unit" must not match "house/unit")
        if check_type and pref_type:
            ptype = str(p.get("property_type") or "").lower().strip()
            if ptype and ptype != pref_type:
                return False
        # Distance — GPS km from property to the user's preferred campus.
        # max_km=None means no distance limit (state-wide fallback).
        if max_km is not None and pref_campus:
            d = dist_to_campus(p, pref_campus)
            if d is not None and d > max_km:
                return False
        return True

    # Progressive fallback — expand search radius / relax type / relax budget,
    # but every tier still goes through _passes(), so the state constraint
    # (with its near-campus exception) is never bypassed.
    pool = [p for p in properties if _passes(p)]                          # within base_dist
    if len(pool) < 20:
        pool = [p for p in properties if _passes(p, max_km=base_dist * 2)]   # 2× radius
    if len(pool) < 20:
        pool = [p for p in properties if _passes(p, max_km=None)]            # whole state
    if len(pool) < 20:
        # Relax budget 30% — still whole state, correct type
        pool = [p for p in properties if _passes(p, max_km=None,
                                                  price_ceiling=price_max * 1.3)]
    if len(pool) < 20:
        # Last resort: relax type — whole state, original budget
        pool = [p for p in properties if _passes(p, check_type=False, max_km=None)]
    if len(pool) < 20:
        # Relax budget further (130%) — state constraint still applies
        pool = [p for p in properties if _passes(p, check_type=False, max_km=None,
                                                  price_ceiling=price_max * 1.3)]
    if not pool:
        # Absolute last resort: state constraint still applies, everything else drops.
        pool = [p for p in properties if _state_ok(p)] or properties

    # Step 1 — Build text documents (pass user's campus so distance tokens
    # reflect actual GPS proximity to the student's campus, not nearest_campus)
    property_texts = [build_property_text(p, user_campus=pref_campus) for p in pool]
    query_text     = build_preference_query(preferences)

    # Step 2 — TF-IDF vectorisation
    # Combine all texts (properties + query) for fitting the vectoriser
    all_texts  = property_texts + [query_text]
    vectorizer = TfidfVectorizer(
        stop_words="english",    # ignore common words like "the", "a", "is"
        ngram_range=(1, 3),      # single words, 2-word and 3-word phrases
        min_df=1,                # include words that appear at least once
        max_df=0.85,             # ignore words that appear in >85% of docs (too common)
        sublinear_tf=True,       # dampen high freq counts: log(tf) instead of raw tf
    )
    tfidf_matrix = vectorizer.fit_transform(all_texts)

    # Step 3 — Split back into properties matrix and query vector
    property_matrix = tfidf_matrix[:-1]   # all rows except last
    query_vector    = tfidf_matrix[-1]    # last row = query

    # Step 4 — Cosine similarity: 0 = no match, 1 = perfect match
    similarities = cosine_similarity(query_vector, property_matrix).flatten()

    # Step 5 — Combine properties with their similarity scores
    scored = list(zip(pool, similarities))
    scored.sort(key=lambda x: x[1], reverse=True)   # highest score first

    return scored[:top_n]


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 — NUMERICAL FEATURE SIMILARITY
#
#  TF-IDF handles text. This section handles numerical attributes:
#  price, distance — comparing these directly with the student's preferences.
#  The score is combined with TF-IDF score in a weighted blend.
# ══════════════════════════════════════════════════════════════════════════════

def numerical_similarity(prop, preferences):
    """
    Calculate how well a property's numerical attributes match preferences.
    Returns a score between 0.0 and 1.0.

    Distance is applied as a MULTIPLICATIVE factor, not averaged — this
    prevents a perfect type/price/gender match from masking a very bad
    distance (e.g. 100 km when max is 5 km still scoring 0.80).
    """
    scores = []

    # State match — hard signal: wrong state = 0.0
    pref_state = (preferences.get("preferred_state") or "").lower().strip()
    if pref_state:
        prop_state = str(prop.get("state") or "").lower()
        scores.append(1.0 if pref_state in prop_state else 0.0)

    # Property type match — exact match; heavy penalty for mismatch
    pref_type = (preferences.get("preferred_type") or "").lower().strip()
    if pref_type:
        prop_type = str(prop.get("property_type") or "").lower().strip()
        scores.append(1.0 if prop_type == pref_type else 0.1)

    # Price score
    price     = prop.get("rental_price", 0) or 0
    price_min = float(preferences.get("preferred_price_min") or 150)
    price_max = float(preferences.get("preferred_price_max") or 1500)

    if price_min <= price <= price_max:
        scores.append(1.0)
    elif price < price_min:
        scores.append(0.8)   # cheaper than expected — still good
    else:
        over_by = (price - price_max) / price_max
        scores.append(max(0.0, 1.0 - over_by))

    # Gender preference match
    pref_gender = (preferences.get("preferred_gender") or "any").lower()
    prop_gender = (prop.get("gender_preference") or "any").lower()
    if pref_gender == "any" or prop_gender == "any" or pref_gender == prop_gender:
        scores.append(1.0)
    else:
        scores.append(0.0)

    base_score = sum(scores) / len(scores) if scores else 0.5

    # Distance — multiplicative factor so a very bad distance can't be
    # diluted by other good scores. Applied AFTER the base average.
    max_dist    = float(preferences.get("preferred_distance") or 0)
    pref_campus = (preferences.get("uitm_campus") or "").strip()
    prop_dist   = dist_to_campus(prop, pref_campus) if pref_campus else None
    if prop_dist is None:
        prop_dist = prop.get("distance_to_campus")

    if max_dist > 0 and prop_dist is not None:
        d = float(prop_dist)
        m = float(max_dist)
        if d <= m:
            dist_factor = 1.0         # within preferred distance — no penalty
        elif d <= m * 1.5:
            dist_factor = 0.75        # up to 1.5× — slight penalty
        elif d <= m * 3:
            dist_factor = 0.40        # up to 3× — significant penalty
        elif d <= m * 6:
            dist_factor = 0.15        # up to 6× — very poor match
        else:
            dist_factor = 0.05        # way too far — near-zero score
        base_score *= dist_factor

    return round(base_score, 4)


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 — COLLABORATIVE FILTERING WITH SVD (Stage 2)
#
#  How it works:
#    1. Build a user-item matrix: rows = users, columns = properties,
#       values = adjusted_rating (0 if no interaction)
#    2. Apply SVD to decompose the matrix into latent factors.
#       SVD finds hidden patterns — e.g. "students who save properties
#       in Seremban under RM500 tend to also like properties in Nilai"
#    3. Predict the target student's rating for each candidate property.
#    4. Re-rank the 50 CBF candidates using SVD predictions.
#    5. Return top 10.
#
#  Cold-start: if the user has no interaction history, SVD cannot
#  predict for them. In that case, return CBF results directly.
# ══════════════════════════════════════════════════════════════════════════════

def collaborative_filter(interactions, candidate_property_ids, target_user_id,
                         top_n=10, n_components_override=None):
    """
    Stage 2 of the hybrid system.

    Parameters:
      interactions         : list of all UserInteraction dicts from database
      candidate_property_ids : list of property IDs from Stage 1 (CBF top 50)
      target_user_id       : the student we are generating recommendations for
      top_n                : final number of recommendations (default 10)

    Returns:
      List of (property_id, svd_score) tuples, or empty list if cold-start.

    Steps:
      1. Build user-item matrix from interaction history
      2. Apply SVD to find latent factors
      3. Predict ratings for target user on candidate properties
      4. Return top_n by predicted rating
    """
    if not interactions:
        return []   # no interaction data — trigger cold-start fallback

    # Step 1 — Build user-item matrix using adjusted_rating
    df = pd.DataFrame(interactions)

    # Check if target user has any history
    user_history = df[df["user_id"] == target_user_id]
    if len(user_history) == 0:
        return []   # new user — cold-start, use CBF only

    # Derive effective rating per row: explicit adjusted_rating takes priority;
    # implicit signals (save, enquiry, etc.) fill gaps for users without ratings.
    df["_eff_rating"] = df.apply(_derive_rating, axis=1)

    # Pivot to user-item matrix
    # Rows = users, Columns = properties, Values = effective rating
    # Fill missing interactions with 0
    matrix = df.pivot_table(
        index="user_id",
        columns="property_id",
        values="_eff_rating",
        aggfunc="mean",
        fill_value=0
    )

    # Need at least 2 users and 2 items for SVD to work
    if matrix.shape[0] < 2 or matrix.shape[1] < 2:
        return []

    # Step 2 — Apply SVD
    # n_components = number of latent factors
    # Start with 10, reduce if matrix is smaller
    n_components = min(
        n_components_override if n_components_override else 20,
        matrix.shape[0] - 1, matrix.shape[1] - 1
    )
    if n_components < 1:
        return []

    svd           = TruncatedSVD(n_components=n_components, random_state=42)
    user_factors  = svd.fit_transform(matrix.values)   # users in latent space
    item_factors  = svd.components_.T                   # items in latent space

    # Step 3 — Predict ratings for target user
    if target_user_id not in matrix.index:
        return []

    user_idx    = matrix.index.get_loc(target_user_id)
    user_vector = user_factors[user_idx]    # this user's latent factor vector

    # Predicted rating = dot product of user vector and item vector
    all_predictions = user_vector @ item_factors.T   # shape: (n_items,)
    property_ids    = matrix.columns.tolist()

    # Step 4 — Filter to only candidate properties from Stage 1
    predictions = []
    for pid in candidate_property_ids:
        if pid in property_ids:
            idx   = property_ids.index(pid)
            score = float(all_predictions[idx])
            predictions.append((pid, score))
        else:
            # Property not in matrix — assign neutral score
            predictions.append((pid, 0.0))

    predictions.sort(key=lambda x: x[1], reverse=True)
    return predictions[:top_n]


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 5 — HYBRID COMBINER (Full pipeline)
#
#  This is the main function called by the API.
#  Implements Figure 3.11 from your proposal:
#
#    User logs in
#    ↓
#    Is new user? ──Yes──→ CBF only → normalise → top 10 → display
#    ↓ No
#    CBF (top 50) → SVD re-rank → weighted blend → top 10 → display
#
#  Output-level combination:
#    final_score = (CBF_weight × cbf_score) + (SVD_weight × svd_score)
#    CBF_weight = 0.4, SVD_weight = 0.6 (SVD gets more weight for
#    returning users since it learns personalised patterns)
# ══════════════════════════════════════════════════════════════════════════════

def hybrid_recommend(properties, preferences, interactions,
                     target_user_id, top_n=10,
                     cbf_w=0.35, svd_w=0.25, pref_w=0.40,
                     n_components=20):
    """
    Full hybrid recommendation pipeline.

    Parameters:
      properties     : list of all available property dicts
      preferences    : the student's preference dict
      interactions   : all UserInteraction records from database
      target_user_id : user ID to generate recommendations for
      top_n          : number of final recommendations (default 10)

    Returns:
      List of dicts — each containing property data + recommendation scores.
      Includes a 'reason' field explaining why each property was recommended
      (transparency / explainability as mentioned in proposal Section 2.5).
    """
    global _tuned_params, _tuned_at_n_interactions

    # ── Adaptive hyperparameter selection ─────────────────────────────────────
    # Re-tune when RETUNE_INTERVAL new interactions have accumulated since last
    # tune. Uses cached result otherwise to avoid recomputing on every request.
    n_int = len(interactions)
    if n_int >= RETUNE_INTERVAL and (n_int - _tuned_at_n_interactions) >= RETUNE_INTERVAL:
        _tuned_params              = tune_hyperparameters(interactions)
        _tuned_at_n_interactions   = n_int

    if _tuned_params:
        cbf_w        = _tuned_params["cbf_w"]
        svd_w        = _tuned_params["svd_w"]
        pref_w       = _tuned_params["pref_w"]
        n_components = _tuned_params["n_components"]

    # ── Stage 1: Content-Based Filtering ─────────────────────────────────────
    cbf_results = content_based_filter(properties, preferences, top_n=100)

    if not cbf_results:
        return []

    # ── Gender hard-filter ────────────────────────────────────────────────────
    # If the student prefers male-only or female-only, remove properties that
    # explicitly cater to the opposite gender. Properties marked "any" always pass.
    pref_gender = (preferences.get("preferred_gender") or "any").lower().strip()
    if pref_gender not in ("any", ""):
        cbf_results = [
            (p, s) for p, s in cbf_results
            if (p.get("gender_preference") or "any").lower().strip() in ("any", pref_gender)
        ]

    # Build lookup: property_id → (property_dict, cbf_score)
    cbf_lookup  = {p["id"]: (p, score) for p, score in cbf_results}
    cbf_prop_ids = list(cbf_lookup.keys())

    # ── Check if new user (cold-start) ────────────────────────────────────────
    user_interactions = [i for i in interactions
                         if i["user_id"] == target_user_id]
    is_new_user = len(user_interactions) == 0

    # ── Stage 2: Collaborative Filtering (returning users only) ───────────────
    if is_new_user:
        # Cold-start: use CBF results directly
        # Rank by combined CBF + numerical similarity
        final_candidates = []
        for prop, cbf_score in cbf_results[:top_n]:
            num_score   = numerical_similarity(prop, preferences)
            # Import weights from user preferences
            raw_w = preferences.get("importance_weights",
                                    '{"price":0.4,"distance":0.3,"facilities":0.3}')
            weights = raw_w if isinstance(raw_w, dict) else json.loads(raw_w)
            # 40% text similarity, 60% hard preference match (state + type + price + distance)
            combined = (cbf_score * 0.4) + (num_score * 0.6)

            reason = _build_reason(prop, preferences, cbf_score, None,
                                   is_new_user=True)
            final_candidates.append({
                **prop,
                "cbf_score":    round(float(cbf_score), 4),
                "svd_score":    None,
                "final_score":  round(float(combined), 4),
                "reason":       reason,
                "method":       "content-based (new user)",
            })

        final_candidates.sort(key=lambda x: x["final_score"], reverse=True)
        final_candidates = final_candidates[:top_n]
        return _apply_preference_sort(final_candidates, preferences)

    else:
        # Returning user: full hybrid (CBF + SVD)

        # Stage 2 — SVD scores ALL CBF candidates (no pre-filter here;
        # the final blend decides what makes the top_n cut).
        svd_results = collaborative_filter(
            interactions, cbf_prop_ids, target_user_id, top_n=len(cbf_prop_ids),
            n_components_override=n_components,
        )

        if not svd_results:
            # SVD failed (not enough data yet) — fall back to CBF
            final_candidates = []
            for prop, cbf_score in cbf_results[:top_n]:
                num_score = numerical_similarity(prop, preferences)
                combined  = (cbf_score * 0.6) + (num_score * 0.4)
                reason    = _build_reason(prop, preferences, cbf_score, None,
                                          is_new_user=False)
                final_candidates.append({
                    **prop,
                    "cbf_score":   round(float(cbf_score), 4),
                    "svd_score":   None,
                    "final_score": round(float(combined), 4),
                    "reason":      reason,
                    "method":      "content-based (fallback)",
                })
            final_candidates.sort(key=lambda x: x["final_score"], reverse=True)
            final_candidates = final_candidates[:top_n]
            return _apply_preference_sort(final_candidates, preferences)

        # Output-level combination:
        # Blend CBF, SVD, and hard-preference (numerical) scores.
        # PREF_WEIGHT is highest because it enforces hard constraints
        # (distance, price, type) that SVD cannot learn directly.
        CBF_WEIGHT  = cbf_w   # default 35% content/text match
        SVD_WEIGHT  = svd_w   # default 25% collaborative (peer preference)
        PREF_WEIGHT = pref_w  # default 40% hard numerical preference match

        # Normalise SVD scores to [0, 1] range for fair blending
        svd_scores_raw = [s for _, s in svd_results]
        if max(svd_scores_raw) != min(svd_scores_raw):
            svd_min  = min(svd_scores_raw)
            svd_max  = max(svd_scores_raw)
            svd_norm = {pid: (s - svd_min) / (svd_max - svd_min)
                        for pid, s in svd_results}
        else:
            svd_norm = {pid: 0.5 for pid, _ in svd_results}

        final_candidates = []
        for pid, raw_svd in svd_results:
            if pid not in cbf_lookup:
                continue
            prop, cbf_score = cbf_lookup[pid]
            svd_score_n     = svd_norm[pid]
            num_score       = numerical_similarity(prop, preferences)

            # Final score: weighted blend including hard preference match
            final_score = (CBF_WEIGHT  * float(cbf_score)
                           + SVD_WEIGHT  * svd_score_n
                           + PREF_WEIGHT * num_score)

            reason = _build_reason(prop, preferences, cbf_score,
                                   svd_score_n, is_new_user=False)

            final_candidates.append({
                **prop,
                "cbf_score":   round(float(cbf_score), 4),
                "svd_score":   round(svd_score_n, 4),
                "final_score": round(final_score, 4),
                "reason":      reason,
                "method":      "hybrid (content + collaborative)",
            })

        final_candidates.sort(key=lambda x: x["final_score"], reverse=True)
        final_candidates = final_candidates[:top_n]
        return _apply_preference_sort(final_candidates, preferences)


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 6 — PREFERENCE ATTRIBUTE SCORING
#
#  Counts how many of the user's explicit preferences a property satisfies.
#  Used as the PRIMARY sort key for final output order, so the recommendation
#  list is ordered: most attributes matched first → closest campus second.
#
#  Scoring:
#    Property type match     : 3 pts  (highest weight — most critical filter)
#    Price within budget     : 2 pts
#    Gender preference match : 2 pts
#    Distance within max     : 2 pts  (1 pt if only slightly over)
#    Each matching facility  : 1 pt   (capped at 4 pts total)
#
#  Maximum possible score: 3 + 2 + 2 + 2 + 4 = 13 pts
# ══════════════════════════════════════════════════════════════════════════════

def preference_attribute_score(prop, preferences):
    """
    Return an integer score representing how many preference attributes
    the property satisfies. Higher = better match.
    """
    score = 0
    pref_campus = (preferences.get("uitm_campus") or "").lower().strip()

    # 1. Property type — 3 pts (most critical: wrong type = major mismatch)
    pref_type = (preferences.get("preferred_type") or "").lower().strip()
    if pref_type:
        prop_type = (prop.get("property_type") or "").lower().strip()
        if prop_type == pref_type:
            score += 3

    # 2. Price within budget — 2 pts (1 pt if cheaper than min, still good)
    price_min = float(preferences.get("preferred_price_min") or 0)
    price_max = float(preferences.get("preferred_price_max") or 9999)
    price     = float(prop.get("rental_price") or 0)
    if price_min <= price <= price_max:
        score += 2
    elif price < price_min:
        score += 1   # cheaper than expected, not bad

    # 3. Gender preference — 2 pts
    pref_gender = (preferences.get("preferred_gender") or "any").lower()
    prop_gender = (prop.get("gender_preference") or "any").lower()
    if pref_gender == "any" or prop_gender == "any" or pref_gender == prop_gender:
        score += 2

    # 4. Distance within preferred max — 2 pts (1 pt if ≤150% of max)
    max_dist = float(preferences.get("preferred_distance") or 0)
    if max_dist > 0 and pref_campus:
        dist = dist_to_campus(prop, pref_campus)
        if dist is not None:
            if dist <= max_dist:
                score += 2
            elif dist <= max_dist * 1.5:
                score += 1

    # 5. Facilities keywords — 1 pt each, capped at 4 pts
    pref_fac = (preferences.get("preferred_facilities") or "").lower()
    prop_fac = (prop.get("facilities") or "").lower()
    if pref_fac and prop_fac:
        keywords = [kw.strip() for kw in pref_fac.replace(",", " ").split() if kw.strip()]
        matched  = sum(1 for kw in keywords if kw in prop_fac)
        score   += min(matched, 4)

    return score


def _apply_preference_sort(candidates, preferences):
    """
    Final re-rank: primary = attribute match score (desc),
    secondary = distance to user's campus (asc).
    Adds 'attribute_score' field to each candidate for transparency.
    """
    pref_campus = (preferences.get("uitm_campus") or "").lower().strip()

    for c in candidates:
        c["attribute_score"] = preference_attribute_score(c, preferences)
        dist = dist_to_campus(c, pref_campus) if pref_campus else None
        c["_sort_dist"] = dist if dist is not None else 9999

    candidates.sort(key=lambda c: (-c["attribute_score"], c["_sort_dist"]))

    for c in candidates:
        c.pop("_sort_dist", None)

    return candidates


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 7 — EXPLAINABILITY
#
#  Proposal Section 2.5 mentions transparency / explainability as important.
#  Each recommendation includes a human-readable reason string.
#  Example: "Matched your budget (RM 450) · Near campus · WiFi available"
# ══════════════════════════════════════════════════════════════════════════════

def _build_reason(prop, preferences, cbf_score, svd_score, is_new_user):
    """Build a short explanation of why this property was recommended."""
    reasons = []

    price     = prop.get("rental_price", 0)
    price_max = preferences.get("preferred_price_max", 1500)
    if price and price <= price_max:
        reasons.append(f"Within your budget (RM {price:.0f}/month)")

    pref_campus_r = (preferences.get("uitm_campus") or "").strip()
    dist = dist_to_campus(prop, pref_campus_r) if pref_campus_r else None
    if dist is None:
        dist = prop.get("distance_to_campus")
    max_dist = preferences.get("preferred_distance")
    if dist and max_dist and dist <= max_dist:
        reasons.append(f"{dist:.1f} km from campus")
    elif dist and dist <= 2:
        reasons.append(f"Near campus ({dist:.1f} km)")

    pref_type = preferences.get("preferred_type", "").lower()
    prop_type = (prop.get("property_type") or "").lower()
    if pref_type and pref_type in prop_type:
        reasons.append(f"{prop_type.title()} room as preferred")

    facilities = (prop.get("facilities") or "").lower()
    if "wifi" in facilities or "wi-fi" in facilities:
        reasons.append("WiFi available")

    furnished = (prop.get("furnished") or "").lower()
    if "fully" in furnished:
        reasons.append("Fully furnished")

    if svd_score and svd_score > 0.6:
        reasons.append("Popular with similar UiTM students")
    elif not is_new_user and svd_score:
        reasons.append("Recommended by students with similar preferences")

    return " · ".join(reasons) if reasons else "Matches your search criteria"
