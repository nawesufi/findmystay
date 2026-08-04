"""
================================================================================
  fix_listing_titles.py — one-off cleanup script

  Two problems with synthetic listing titles, both fixed here:

  1. Leftover "#N" counter suffix (e.g. "#1234") that an older version of
     generate_synthetic_properties.py appended to keep titles unique.
     Real scraped titles (ibilik.com, mudah.my, propertyguru.com.my) never
     have this.

  2. Many synthetic titles collide once the counter is removed — the same
     estate only has ~15 title templates, so listings in a busy estate end
     up with the exact same title (e.g. 13 different rooms in Tampoi all
     titled "Clean room for student - Tampoi"). To make each title unique
     without inventing new facts, we fold in that listing's own real
     facilities (already stored on the row) as a distinguishing "hook":

       "Clean room for student - Nilai"
       -> "Clean room for student with Study Table & Near Shopping Mall - Nilai"

  Only rows with source='synthetic' are touched. Real scraped titles are
  left completely untouched.

  Run from the backend/ folder:
      python fix_listing_titles.py            (preview only, no changes)
      python fix_listing_titles.py --apply     (actually updates the DB)
================================================================================
"""

import os
import re
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DB_URL = os.environ.get("DB_URL")
if not DB_URL:
    print("ERROR: DB_URL not found in .env")
    sys.exit(1)

TITLE_COUNTER_RE = re.compile(r"\s*#\d+\s*")
TRAILING_JUNK_RE = re.compile(r"[\s\-]+$")


def build_title(title: str, area: str, facilities: str) -> str:
    # Strip the old "#N" counter, if present
    base_full = TITLE_COUNTER_RE.sub(" ", title).strip()
    base_full = TRAILING_JUNK_RE.sub("", base_full).strip()

    estate = (area or "").split(",")[0].strip()
    suffix = f" - {estate}"
    if estate and base_full.endswith(suffix):
        base = base_full[: -len(suffix)]
    else:
        # Title isn't in the expected "<descriptor> - <estate>" shape —
        # just return the counter-stripped version untouched.
        return base_full

    facs = [f.strip() for f in (facilities or "").split(",") if f.strip()]
    if len(facs) >= 2:
        hook = f"{facs[0]} & {facs[1]}"
    elif len(facs) == 1:
        hook = facs[0]
    else:
        hook = None

    if not hook:
        return base_full

    if " with " in base.lower():
        new_base = f"{base}, plus {hook}"
    else:
        new_base = f"{base} with {hook}"

    return f"{new_base} - {estate}"


def main():
    apply_changes = "--apply" in sys.argv

    engine = create_engine(DB_URL)
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, title, area, facilities FROM properties WHERE source = 'synthetic'"
        )).fetchall()

        print(f"Found {len(rows)} synthetic listings.\n")

        updates = []
        for row in rows:
            new_title = build_title(row.title, row.area, row.facilities)
            if new_title and new_title != row.title:
                updates.append((row.id, row.title, new_title))

        print("Preview (first 15):")
        for pid, old, new in updates[:15]:
            print(f"  [{pid}] {old!r}  ->  {new!r}")

        print(f"\n{len(updates)} listings would be updated.")
        before_unique = len({r.title for r in rows})
        after_titles = [build_title(r.title, r.area, r.facilities) for r in rows]
        print(f"Unique titles: {before_unique} -> {len(set(after_titles))} (out of {len(rows)})")

        if not apply_changes:
            print("\nRe-run with --apply to actually write these changes to the database.")
            return

        for pid, old, new in updates:
            conn.execute(
                text("UPDATE properties SET title = :t WHERE id = :id"),
                {"t": new, "id": pid},
            )
        conn.commit()
        print(f"\nOK Updated {len(updates)} listing titles.")


if __name__ == "__main__":
    main()
