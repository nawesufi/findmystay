"""
import_interactions.py — Load ratings_matrix.csv into the SQLite user_interactions table.
Creates synthetic student accounts for CSV users that don't exist in the DB yet.

Run order:
  1. python generate_interactions.py
  2. python import_data.py          (properties must be in DB first)
  3. python import_interactions.py  (this script)
"""

import os
import sys
import random
import string
import json
import numpy as np
import pandas as pd
from datetime        import datetime, timedelta
from collections     import Counter
from werkzeug.security import generate_password_hash

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app        import create_app
from extensions import db
from models     import User, Houseowner, Property, UserInteraction, UserPreference, Feedback

BASE_DIR       = os.path.join(os.path.dirname(__file__), '..', 'findmystay_data')
RATINGS_CSV    = os.path.join(BASE_DIR, 'ratings_matrix.csv')
PROPERTIES_CSV = os.path.join(BASE_DIR, 'rental_dataset_final.csv')

EXTRA_SYNTH = 20   # additional rated interactions per synthetic user
EXTRA_DEMO  = 15   # additional rated interactions per demo student


def _match_score(prop, state, price_max, dist_max, pref_type):
    """0–1 score: how well a DB property fits a user profile."""
    score = total = 0.0
    if state.lower() in (prop.state or "").lower():
        score += 3.0
    total += 3.0
    if pref_type.lower() in (prop.property_type or "").lower():
        score += 2.0
    total += 2.0
    price = float(prop.rental_price or 0)
    if price_max and price <= price_max:          score += 2.0
    elif price_max and price <= price_max * 1.2:  score += 1.0
    total += 2.0
    dist = float(prop.distance_to_campus or 0)
    if dist_max and dist <= dist_max:             score += 2.0
    elif dist_max and dist <= dist_max * 1.5:     score += 0.8
    total += 2.0
    return score / total if total else 0.0


def _to_rating(match, bias=0.0):
    raw = 1.0 + match * 4.0 + bias
    return round(max(1.0, min(5.0, raw + np.random.normal(0, 0.7))), 1)


def _adjusted_rating(rating, sentiment):
    return round(max(1.0, min(5.0, rating * (1 + 0.3 * float(sentiment or 0)))), 2)


def build_pid_map(props_df, db_props):
    """Map P0001-format IDs to real DB property IDs by matching title + price."""
    db_lookup = {}
    for p in db_props:
        key = (str(p.title or '')[:100].strip().lower(),
               round(float(p.rental_price or 0), 2))
        if key not in db_lookup:
            db_lookup[key] = p.id

    pid_map = {}
    for i, row in props_df.iterrows():
        pid   = f"P{i+1:04d}"
        title = str(row.get('title', '') or '')[:100].strip().lower()
        try:
            price = round(float(row.get('price_rm', 0) or 0), 2)
        except (ValueError, TypeError):
            price = 0.0
        if (title, price) in db_lookup:
            pid_map[pid] = db_lookup[(title, price)]

    return pid_map


def get_or_create_synthetic_user(uid_str, email_cache):
    """Return DB user id for a synthetic user, creating them if needed."""
    email = f"synth_{uid_str.lower()}@findmystay.local"
    if email in email_cache:
        return email_cache[email]

    user = User(
        email     = email,
        password  = generate_password_hash(
            ''.join(random.choices(string.ascii_letters + string.digits, k=20))
        ),
        full_name = f"Synthetic Student {uid_str}",
        role      = 'student',
    )
    db.session.add(user)
    db.session.flush()
    email_cache[email] = user.id
    return user.id


def main():
    app = create_app()

    with app.app_context():
        # ── Load CSVs ────────────────────────────────────────────────────────
        if not os.path.exists(RATINGS_CSV):
            print(f"ratings_matrix.csv not found. Run generate_interactions.py first.")
            return
        if not os.path.exists(PROPERTIES_CSV):
            print(f"rental_dataset_final.csv not found.")
            return

        ratings_df = pd.read_csv(RATINGS_CSV)
        props_df   = pd.read_csv(PROPERTIES_CSV)
        print(f"Ratings rows    : {len(ratings_df)}")
        print(f"CSV properties  : {len(props_df)}")

        # ── Build property ID map ────────────────────────────────────────────
        db_props = Property.query.order_by(Property.id).all()
        print(f"DB properties   : {len(db_props)}")

        if not db_props:
            print("No properties in DB. Run import_data.py first.")
            return

        pid_map = build_pid_map(props_df, db_props)
        print(f"Mapped P-IDs    : {len(pid_map)} / {len(props_df)}")

        # ── Remove old synthetic interactions to avoid duplicates ────────────
        synth_user_ids = [
            u.id for u in User.query.filter(
                User.email.like('%@findmystay.local')
            ).all()
        ]
        if synth_user_ids:
            deleted = UserInteraction.query.filter(
                UserInteraction.user_id.in_(synth_user_ids)
            ).delete(synchronize_session='fetch')
            db.session.commit()
            print(f"Cleared {deleted} old synthetic interactions")

        # ── Build existing user email cache ──────────────────────────────────
        email_cache = {u.email: u.id for u in User.query.all()}

        # ── Import interactions ──────────────────────────────────────────────
        imported = 0
        skipped  = 0

        for _, row in ratings_df.iterrows():
            uid_str = str(row['user_id'])
            item_id = str(row['item_id'])
            rating  = float(row.get('rating', 3.0) or 3.0)
            adj     = float(row.get('adjusted_rating', rating) or rating)

            if item_id not in pid_map:
                skipped += 1
                continue

            db_prop_id = pid_map[item_id]
            db_user_id = get_or_create_synthetic_user(uid_str, email_cache)

            db.session.add(UserInteraction(
                user_id          = db_user_id,
                property_id      = db_prop_id,
                interaction_type = 'rating',
                rating           = rating,
                adjusted_rating  = adj,
            ))
            imported += 1

            if imported % 300 == 0:
                db.session.commit()
                print(f"  {imported} imported...")

        db.session.commit()

        print(f"\nDone!")
        print(f"  Imported  : {imported} interactions")
        print(f"  Skipped   : {skipped}  (property not matched in DB)")
        print(f"  Total interactions in DB : {UserInteraction.query.count()}")
        print(f"  Total users in DB        : {User.query.count()}")

        # Seed realistic demo accounts inside the same app context
        seed_demo_accounts()

        print("\n-- Extra ratings --")
        seed_extra_ratings()


# ── Demo accounts ─────────────────────────────────────────────────────────────
# Realistic named students (2 per campus) and landlords added directly to DB.
# All student passwords : password123
# All landlord passwords: landlord123

_CAMPUS_STATE = {
    "UiTM Seremban 3 (NS)":      "Negeri Sembilan",
    "UiTM Kuala Pilah (NS)":     "Negeri Sembilan",
    "UiTM Rembau (NS)":          "Negeri Sembilan",
    "UiTM Melaka (Alor Gajah)":  "Melaka",
    "UiTM Jasin (Melaka)":       "Melaka",
    "UiTM Bandaraya (Melaka)":   "Melaka",
    "UiTM Segamat (Johor)":      "Johor",
    "UiTM Pasir Gudang (Johor)": "Johor",
}

_DEMO_STUDENTS = [
    # UiTM Seremban 3 (NS)
    {"email": "2022123456@student.uitm.edu.my", "full_name": "Ahmad Faris Bin Zulkifli",
     "gender": "Male",   "campus": "UiTM Seremban 3 (NS)",
     "budget_min": 200,  "budget_max": 500,  "pref_type": "room",  "pref_dist": 3.0,
     "pref_gender": "male",   "pref_facilities": "wifi, parking"},
    {"email": "2021987654@student.uitm.edu.my", "full_name": "Nurul Ain Binti Hashim",
     "gender": "Female", "campus": "UiTM Seremban 3 (NS)",
     "budget_min": 250,  "budget_max": 550,  "pref_type": "room",  "pref_dist": 2.0,
     "pref_gender": "female", "pref_facilities": "wifi, washing machine"},
    # UiTM Kuala Pilah (NS)
    {"email": "2023456789@student.uitm.edu.my", "full_name": "Muhammad Haziq Bin Azman",
     "gender": "Male",   "campus": "UiTM Kuala Pilah (NS)",
     "budget_min": 200,  "budget_max": 450,  "pref_type": "room",  "pref_dist": 2.5,
     "pref_gender": "male",   "pref_facilities": "wifi"},
    {"email": "2022345678@student.uitm.edu.my", "full_name": "Siti Nabilah Binti Roslan",
     "gender": "Female", "campus": "UiTM Kuala Pilah (NS)",
     "budget_min": 300,  "budget_max": 600,  "pref_type": "room",  "pref_dist": 3.0,
     "pref_gender": "female", "pref_facilities": "wifi, air conditioning"},
    # UiTM Rembau (NS)
    {"email": "2023567890@student.uitm.edu.my", "full_name": "Izzatul Syazwani Binti Kamarudin",
     "gender": "Female", "campus": "UiTM Rembau (NS)",
     "budget_min": 200,  "budget_max": 400,  "pref_type": "room",  "pref_dist": 2.0,
     "pref_gender": "female", "pref_facilities": "wifi"},
    {"email": "2021234567@student.uitm.edu.my", "full_name": "Amirul Hakim Bin Sulaiman",
     "gender": "Male",   "campus": "UiTM Rembau (NS)",
     "budget_min": 250,  "budget_max": 500,  "pref_type": "room",  "pref_dist": 3.0,
     "pref_gender": "male",   "pref_facilities": "wifi, parking"},
    # UiTM Melaka (Alor Gajah)
    {"email": "2022678901@student.uitm.edu.my", "full_name": "Nur Syafiqah Binti Ismail",
     "gender": "Female", "campus": "UiTM Melaka (Alor Gajah)",
     "budget_min": 250,  "budget_max": 550,  "pref_type": "room",  "pref_dist": 3.0,
     "pref_gender": "female", "pref_facilities": "wifi, air conditioning"},
    {"email": "2023789012@student.uitm.edu.my", "full_name": "Mohd Ridhwan Bin Abdullah",
     "gender": "Male",   "campus": "UiTM Melaka (Alor Gajah)",
     "budget_min": 300,  "budget_max": 700,  "pref_type": "unit", "pref_dist": 5.0,
     "pref_gender": "any",    "pref_facilities": "wifi, parking, air conditioning"},
    # UiTM Jasin (Melaka)
    {"email": "2022890123@student.uitm.edu.my", "full_name": "Farah Adlina Binti Othman",
     "gender": "Female", "campus": "UiTM Jasin (Melaka)",
     "budget_min": 200,  "budget_max": 450,  "pref_type": "room",  "pref_dist": 2.0,
     "pref_gender": "female", "pref_facilities": "wifi"},
    {"email": "2021901234@student.uitm.edu.my", "full_name": "Khairul Hafizi Bin Mohd Noor",
     "gender": "Male",   "campus": "UiTM Jasin (Melaka)",
     "budget_min": 250,  "budget_max": 500,  "pref_type": "room",  "pref_dist": 3.0,
     "pref_gender": "male",   "pref_facilities": "wifi, parking"},
    # UiTM Bandaraya (Melaka)
    {"email": "2023012345@student.uitm.edu.my", "full_name": "Anis Nadhirah Binti Ramli",
     "gender": "Female", "campus": "UiTM Bandaraya (Melaka)",
     "budget_min": 300,  "budget_max": 700,  "pref_type": "unit", "pref_dist": 5.0,
     "pref_gender": "female", "pref_facilities": "wifi, air conditioning, washing machine"},
    {"email": "2022109876@student.uitm.edu.my", "full_name": "Fadzillah Bin Mazlan",
     "gender": "Male",   "campus": "UiTM Bandaraya (Melaka)",
     "budget_min": 350,  "budget_max": 800,  "pref_type": "unit", "pref_dist": 6.0,
     "pref_gender": "any",    "pref_facilities": "wifi, parking"},
    # UiTM Segamat (Johor)
    {"email": "2023198765@student.uitm.edu.my", "full_name": "Syarifah Nur Atikah Binti Syed Ali",
     "gender": "Female", "campus": "UiTM Segamat (Johor)",
     "budget_min": 200,  "budget_max": 480,  "pref_type": "room",  "pref_dist": 2.5,
     "pref_gender": "female", "pref_facilities": "wifi"},
    {"email": "2022287654@student.uitm.edu.my", "full_name": "Zulhilmi Bin Zakaria",
     "gender": "Male",   "campus": "UiTM Segamat (Johor)",
     "budget_min": 250,  "budget_max": 550,  "pref_type": "room",  "pref_dist": 3.0,
     "pref_gender": "male",   "pref_facilities": "wifi, parking"},
    # UiTM Pasir Gudang (Johor)
    {"email": "2021376543@student.uitm.edu.my", "full_name": "Nur Izzati Binti Mohd Fauzi",
     "gender": "Female", "campus": "UiTM Pasir Gudang (Johor)",
     "budget_min": 300,  "budget_max": 650,  "pref_type": "room",  "pref_dist": 3.0,
     "pref_gender": "female", "pref_facilities": "wifi, air conditioning"},
    {"email": "2023465432@student.uitm.edu.my", "full_name": "Hazwan Syafiq Bin Idris",
     "gender": "Male",   "campus": "UiTM Pasir Gudang (Johor)",
     "budget_min": 350,  "budget_max": 750,  "pref_type": "unit", "pref_dist": 5.0,
     "pref_gender": "any",    "pref_facilities": "wifi, parking, air conditioning"},
]

_DEMO_LANDLORDS = [
    {"email": "cikgu_azman@gmail.com",          "full_name": "Azman Bin Talib",
     "gender": "Male",   "phone": "0123456781", "company": "Azman Property Management"},
    {"email": "pn.rohani.hartanah@gmail.com",   "full_name": "Rohani Binti Abdul Razak",
     "gender": "Female", "phone": "0129876542", "company": "Rohani Home Rental"},
    {"email": "zulkarnain.property@yahoo.com",  "full_name": "Zulkarnain Bin Saad",
     "gender": "Male",   "phone": "0111234563", "company": "ZK Properties"},
    {"email": "haslinah.rental@gmail.com",      "full_name": "Haslinah Binti Mokhtar",
     "gender": "Female", "phone": "0173456784", "company": "Haslinah Accommodation Services"},
    {"email": "pak_long_sewa@gmail.com",        "full_name": "Lokman Bin Yusof",
     "gender": "Male",   "phone": "0197654325", "company": "Pak Long Rental"},
    {"email": "noraini_property@hotmail.com",   "full_name": "Noraini Binti Che Hassan",
     "gender": "Female", "phone": "0125432176", "company": "Noraini Student Housing"},
    {"email": "abang_farid.sewa@gmail.com",     "full_name": "Farid Bin Rahmat",
     "gender": "Male",   "phone": "0163210987", "company": "Farid Property"},
    {"email": "kak_wati_rental@gmail.com",      "full_name": "Norwati Binti Yusop",
     "gender": "Female", "phone": "0189876548", "company": "Wati Homestay & Rental"},
]

_FEEDBACK_COMMENTS = {
    "positive": [
        "Very clean and comfortable room. Landlord is very friendly and responsive.",
        "Great location, close to campus. WiFi is fast and stable.",
        "Affordable price with good facilities. Highly recommend!",
        "Spacious and well-furnished. Very happy staying here.",
        "Nice neighbourhood, quiet and safe. Easy access to campus.",
        "Excellent value for money. All amenities as described.",
        "Landlord helpful and property is well-maintained.",
        "Perfect location near campus gate. Only 5 minutes walk to class.",
    ],
    "neutral": [
        "Room is okay, nothing special but liveable. Price is fair.",
        "Average place. Could use better WiFi connection.",
        "Decent room but parking can get full sometimes.",
        "It is okay for the price. Location is acceptable.",
        "Basic accommodation. Suitable for budget-conscious students.",
    ],
    "negative": [
        "Water pressure is too low and maintenance takes too long.",
        "WiFi is unreliable and frequently disconnects.",
        "Room was not as clean as shown in photos.",
        "Landlord not responsive to maintenance requests.",
    ],
}


def seed_demo_accounts():
    """Add realistic named students and landlords to the DB. Safe to re-run."""
    random.seed(77)
    props_by_state = {}
    for p in Property.query.with_entities(Property.id, Property.state).all():
        props_by_state.setdefault((p.state or "").strip(), []).append(p.id)

    s_created = s_skipped = l_created = l_skipped = 0

    print("\n-- Demo students --")
    for s in _DEMO_STUDENTS:
        if User.query.filter_by(email=s["email"]).first():
            print(f"   SKIP  {s['email']}")
            s_skipped += 1
            continue

        campus = s["campus"]
        state  = _CAMPUS_STATE.get(campus, "")
        user   = User(
            email       = s["email"],
            password    = generate_password_hash("password123"),
            full_name   = s["full_name"],
            gender      = s["gender"],
            role        = "student",
            uitm_campus = campus,
        )
        db.session.add(user)
        db.session.flush()

        db.session.add(UserPreference(
            user_id              = user.id,
            preferred_price_min  = s["budget_min"],
            preferred_price_max  = s["budget_max"],
            preferred_distance   = s.get("pref_dist", 3.0),
            preferred_type       = s.get("pref_type", "room"),
            preferred_gender     = s.get("pref_gender", "any"),
            preferred_state      = state,
            preferred_facilities = s.get("pref_facilities", "wifi"),
            uitm_campus          = campus,
            importance_weights   = json.dumps({"price": 0.4, "distance": 0.3, "facilities": 0.3}),
        ))

        pool = props_by_state.get(state, []) or [p for ids in props_by_state.values() for p in ids]
        sample = random.sample(pool, min(random.randint(8, 14), len(pool)))
        base_ts = datetime.utcnow() - timedelta(days=random.randint(10, 90))

        for i, pid in enumerate(sample):
            itype  = random.choice(["view", "save", "click", "inquiry"])
            rating = round(random.uniform(2.0, 5.0), 1)
            db.session.add(UserInteraction(
                user_id          = user.id,
                property_id      = pid,
                interaction_type = itype,
                rating           = rating,
                adjusted_rating  = round(rating * random.uniform(0.9, 1.1), 2),
                timestamp        = base_ts + timedelta(days=i, hours=random.randint(0, 12)),
            ))

        for pid in random.sample(sample, min(3, len(sample))):
            stars = random.randint(2, 5)
            if stars >= 4:
                comment, sentiment = random.choice(_FEEDBACK_COMMENTS["positive"]), round(random.uniform(0.3, 0.8), 3)
            elif stars == 3:
                comment, sentiment = random.choice(_FEEDBACK_COMMENTS["neutral"]),  round(random.uniform(-0.1, 0.2), 3)
            else:
                comment, sentiment = random.choice(_FEEDBACK_COMMENTS["negative"]), round(random.uniform(-0.6, -0.1), 3)
            db.session.add(Feedback(
                user_id            = user.id,
                property_id        = pid,
                satisfaction_level = stars,
                comment            = comment,
                sentiment_score    = sentiment,
                created_at         = base_ts + timedelta(days=random.randint(1, 30)),
            ))

        db.session.commit()
        print(f"   OK    {s['full_name']} ({campus})")
        s_created += 1

    print("\n-- Demo landlords --")
    for l in _DEMO_LANDLORDS:
        if User.query.filter_by(email=l["email"]).first():
            print(f"   SKIP  {l['email']}")
            l_skipped += 1
            continue

        user = User(
            email     = l["email"],
            password  = generate_password_hash("landlord123"),
            full_name = l["full_name"],
            gender    = l["gender"],
            role      = "houseowner",
        )
        db.session.add(user)
        db.session.flush()
        db.session.add(Houseowner(
            user_id             = user.id,
            phone_number        = l["phone"],
            company_name        = l.get("company"),
            verification_status = "verified",
        ))
        db.session.commit()
        print(f"   OK    {l['full_name']} ({l.get('company', '')})")
        l_created += 1

    print(f"""
-- Demo accounts summary --
  Students  created : {s_created}  (skipped: {s_skipped})
  Landlords created : {l_created}  (skipped: {l_skipped})
  Student password  : password123
  Landlord password : landlord123
---------------------------""")


def seed_extra_ratings():
    """
    Add more rated interactions directly using real DB property IDs.
    - Synthetic users (@findmystay.local): EXTRA_SYNTH new ratings each,
      sampled from same-state properties they haven't rated yet.
    - Demo students (@student.uitm.edu.my): EXTRA_DEMO new ratings each,
      from their preferred-state pool.
    Safe to re-run — skips properties already interacted with per user.
    """
    np.random.seed(99)
    random.seed(99)

    all_props = Property.query.filter_by(status='available').all()
    props_by_state = {}
    for p in all_props:
        props_by_state.setdefault((p.state or "").strip(), []).append(p)

    def _add(user_id, pool, existing_pids, n, state, price_max, dist_max, pref_type, bias):
        candidates = [p for p in pool if p.id not in existing_pids]
        if not candidates:
            return 0
        sample = random.sample(candidates, min(n, len(candidates)))
        added = 0
        for prop in sample:
            ms = _match_score(prop, state, price_max, dist_max, pref_type)
            if ms < 0.15:
                continue
            r = _to_rating(ms, bias=bias)
            a = _adjusted_rating(r, prop.sentiment_score)
            db.session.add(UserInteraction(
                user_id          = user_id,
                property_id      = prop.id,
                interaction_type = 'rating',
                rating           = r,
                adjusted_rating  = a,
            ))
            existing_pids.add(prop.id)
            added += 1
        return added

    # ── Synthetic users ───────────────────────────────────────────────────────
    synth_users = User.query.filter(User.email.like('%@findmystay.local')).all()
    synth_added = 0
    for user in synth_users:
        existing = {i.property_id
                    for i in UserInteraction.query.filter_by(user_id=user.id).all()}
        rated_objs = [p for p in all_props if p.id in existing]
        if not rated_objs:
            continue
        inferred_state = Counter(
            (p.state or "").strip() for p in rated_objs
        ).most_common(1)[0][0]
        prices    = [float(p.rental_price or 0)       for p in rated_objs if p.rental_price]
        dists     = [float(p.distance_to_campus or 0) for p in rated_objs if p.distance_to_campus]
        price_max = max(prices) * 1.1 if prices else 600
        dist_max  = max(dists)  * 1.1 if dists  else 5.0
        bias      = round(np.random.uniform(-0.5, 0.5), 2)
        pool      = props_by_state.get(inferred_state, all_props)
        synth_added += _add(user.id, pool, existing,
                            EXTRA_SYNTH, inferred_state, price_max, dist_max, "room", bias)
        if synth_added % 2000 == 0 and synth_added:
            db.session.commit()
    db.session.commit()
    print(f"  Synthetic users: +{synth_added} new rated interactions")

    # ── Demo students ─────────────────────────────────────────────────────────
    demo_users = User.query.filter(User.email.like('%@student.uitm.edu.my')).all()
    demo_added = 0
    for user in demo_users:
        existing = {i.property_id
                    for i in UserInteraction.query.filter_by(user_id=user.id).all()}
        pref = (UserPreference.query
                .filter_by(user_id=user.id)
                .order_by(UserPreference.created_at.desc())
                .first())
        if pref:
            state     = pref.preferred_state or (user.uitm_campus or "")
            price_max = float(pref.preferred_price_max or 600)
            dist_max  = float(pref.preferred_distance  or 5.0)
            pref_type = pref.preferred_type or "room"
        else:
            state     = user.uitm_campus or ""
            price_max = 600.0
            dist_max  = 5.0
            pref_type = "room"
        matched_state = next(
            (s for s in props_by_state
             if state.lower() in s.lower() or s.lower() in state.lower()), None
        )
        pool = props_by_state.get(matched_state, all_props) if matched_state else all_props
        bias = round(np.random.uniform(-0.3, 0.5), 2)
        demo_added += _add(user.id, pool, existing,
                           EXTRA_DEMO, state, price_max, dist_max, pref_type, bias)
    db.session.commit()
    print(f"  Demo students  : +{demo_added} new rated interactions")

    total      = UserInteraction.query.count()
    with_rating = UserInteraction.query.filter(UserInteraction.rating.isnot(None)).count()
    print(f"  Total in DB    : {total}  |  with ratings: {with_rating}")


if __name__ == '__main__':
    main()
