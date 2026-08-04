"""
================================================================================
  recompute_property_ratings.py — one-off cleanup script

  Property.adjusted_rating was baked in once at data-generation/import time
  from a single synthetic review sample, completely disconnected from the
  actual Feedback table shown on PropertyDetail. That's why some listings
  show "Highly rated" with zero real reviews.

  This recomputes each property's adjusted_rating as the average of its
  actual Feedback rows:
      adjusted = clamp(satisfaction_level * (1 + 0.3 * sentiment_score), 1, 5)

  Properties with zero real reviews are reset to the model default (3.0)
  so they no longer qualify for "Highly rated" (frontend also now checks
  review_count, but this keeps the underlying data honest too — this value
  also feeds the SVD recommender, not just the badge).

  Run from the backend/ folder:
      python recompute_property_ratings.py            (preview only)
      python recompute_property_ratings.py --apply     (actually updates the DB)
================================================================================
"""

import sys
from app import create_app
from models import db, Property, Feedback

DEFAULT_RATING = 3.0


def compute_rating(feedbacks):
    if not feedbacks:
        return DEFAULT_RATING
    scores = [
        max(1.0, min(5.0, f.satisfaction_level * (1 + 0.3 * (f.sentiment_score or 0))))
        for f in feedbacks
    ]
    return round(sum(scores) / len(scores), 2)


def main():
    apply_changes = "--apply" in sys.argv

    app = create_app()
    with app.app_context():
        properties = Property.query.all()
        print(f"Checking {len(properties)} properties.\n")

        updates = []
        for p in properties:
            new_rating = compute_rating(p.feedbacks)
            if new_rating != p.adjusted_rating:
                updates.append((p, p.adjusted_rating, new_rating, len(p.feedbacks)))

        print("Preview (first 20):")
        for p, old, new, n in updates[:20]:
            print(f"  [{p.id}] {p.title!r}  {old} -> {new}  ({n} real review(s))")

        wrongly_highly_rated = [u for u in updates if u[1] and u[1] >= 4 and u[3] == 0]
        print(f"\n{len(updates)} properties would be updated.")
        print(f"  of which {len(wrongly_highly_rated)} currently show 'Highly rated' with 0 real reviews.")

        if not apply_changes:
            print("\nRe-run with --apply to actually write these changes to the database.")
            return

        for p, old, new, n in updates:
            p.adjusted_rating = new
        db.session.commit()
        print(f"\nOK Updated {len(updates)} properties.")


if __name__ == "__main__":
    main()
