"""
================================================================================
  fix_location_consistency.py — one-off cleanup script

  Cross-checking every live property against the 8 UiTM campus coordinates
  found that nearest_campus, distance_to_campus, and state had drifted out
  of sync with each other for a large share of properties (likely stale
  from an earlier data-generation step that never got resynced):

    - distance_to_campus didn't match reality for 4,997 / 8,025 properties
    - nearest_campus was stale (a genuinely closer campus existed) for 57
    - state contradicted its own nearest_campus's actual state for 77

  This recomputes nearest_campus, distance_to_campus, and state PURELY from
  each property's existing latitude/longitude — no geocoding, no API calls,
  no cost. Properties with missing or clearly-invalid coordinates (outside
  Peninsular Malaysia, where every campus is) are skipped and reported
  separately — those need re-geocoding (fix_coords.py), not this script.

  Run from the backend/ folder:
      python fix_location_consistency.py            (preview only)
      python fix_location_consistency.py --apply     (actually updates the DB)
================================================================================
"""

import sys
import math
from app import create_app
from models import db, Property

CAMPUSES = {
    "UiTM Seremban 3 (NS)":      (2.6703, 101.9353),
    "UiTM Kuala Pilah (NS)":     (2.7890, 102.2180),
    "UiTM Rembau (NS)":          (2.5111, 102.0633),
    "UiTM Melaka (Alor Gajah)":  (2.3679, 102.1801),
    "UiTM Jasin (Melaka)":       (2.2212, 102.4523),
    "UiTM Bandaraya (Melaka)":   (2.1907, 102.2465),
    "UiTM Segamat (Johor)":      (2.4880, 102.7293),
    "UiTM Pasir Gudang (Johor)": (1.5267, 103.8780),
}
CAMPUS_STATE = {
    "UiTM Seremban 3 (NS)":      "Negeri Sembilan",
    "UiTM Kuala Pilah (NS)":     "Negeri Sembilan",
    "UiTM Rembau (NS)":          "Negeri Sembilan",
    "UiTM Melaka (Alor Gajah)":  "Melaka",
    "UiTM Jasin (Melaka)":       "Melaka",
    "UiTM Bandaraya (Melaka)":   "Melaka",
    "UiTM Segamat (Johor)":      "Johor",
    "UiTM Pasir Gudang (Johor)": "Johor",
}
# Peninsular Malaysia bounding box — every campus sits well inside this.
# Coordinates outside it are broken data, not a location this script can fix.
MY_LAT = (0.8, 7.5)
MY_LNG = (99.5, 104.6)


def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return round(R * 2 * math.asin(math.sqrt(a)), 2)


def nearest_campus(lat, lng):
    best_name, best_dist = None, float("inf")
    for name, (clat, clng) in CAMPUSES.items():
        d = haversine_km(lat, lng, clat, clng)
        if d < best_dist:
            best_dist, best_name = d, name
    return best_name, best_dist


def main():
    apply_changes = "--apply" in sys.argv
    app = create_app()
    with app.app_context():
        properties = Property.query.all()
        print(f"Checking {len(properties)} properties.\n")

        updates = []
        invalid_coords = []

        for p in properties:
            lat, lng = p.latitude, p.longitude
            if lat is None or lng is None:
                invalid_coords.append((p.id, "missing coordinates"))
                continue
            lat, lng = float(lat), float(lng)
            if not (MY_LAT[0] <= lat <= MY_LAT[1] and MY_LNG[0] <= lng <= MY_LNG[1]):
                invalid_coords.append((p.id, f"outside Malaysia ({lat}, {lng})"))
                continue

            new_campus, new_dist = nearest_campus(lat, lng)
            new_state = CAMPUS_STATE[new_campus]

            old_campus = p.nearest_campus or ""
            old_dist   = p.distance_to_campus
            old_state  = p.state or ""

            changed = (
                old_campus.strip() != new_campus
                or old_state.strip().lower() != new_state.lower()
                or old_dist is None
                or abs(float(old_dist) - new_dist) > 0.5
            )
            if changed:
                updates.append((p, old_campus, old_dist, old_state,
                                 new_campus, new_dist, new_state))

        print("Preview (first 20 changes):")
        for p, oc, od, os_, nc, nd, ns in updates[:20]:
            print(f"  [{p.id}] campus: {oc!r} -> {nc!r}  |  "
                  f"dist: {od} -> {nd}  |  state: {os_!r} -> {ns!r}")

        print(f"\n{len(updates)} properties would be updated.")
        print(f"{len(invalid_coords)} properties skipped (bad/missing coordinates "
              f"— need re-geocoding, not this script):")
        for pid, reason in invalid_coords[:20]:
            print(f"  [{pid}] {reason}")

        if not apply_changes:
            print("\nRe-run with --apply to actually write these changes to the database.")
            return

        for p, oc, od, os_, nc, nd, ns in updates:
            p.nearest_campus     = nc
            p.distance_to_campus = nd
            p.state              = ns
        db.session.commit()
        print(f"\nOK Updated {len(updates)} properties.")


if __name__ == "__main__":
    main()
