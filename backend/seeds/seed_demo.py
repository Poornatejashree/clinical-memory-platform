"""Run: python -m seeds.seed_demo"""
from app.core.supabase import supabase
from app.services.hindsight_service import hindsight
from app.services.extraction_service import extractor

DEMO_PATIENTS = [
    {"mrn": "ICU-001", "name": "Robert Chen", "age": 67, "sex": "M",
     "department": "icu", "bed": "ICU-3", "diagnosis": "Post-op sepsis, ARDS",
     "stability_score": 72},
    {"mrn": "ICU-002", "name": "Maria Lopez", "age": 54, "sex": "F",
     "department": "icu", "bed": "ICU-7", "diagnosis": "Acute respiratory failure",
     "stability_score": 65},
    {"mrn": "ER-014", "name": "James Wright", "age": 41, "sex": "M",
     "department": "emergency", "bed": "ER-2", "diagnosis": "Chest pain, r/o ACS",
     "stability_score": 80},
]

DEMO_HANDOFFS = [
    {
        "mrn": "ICU-001",
        "transcript": """Robert is on day 4. Vitals look stable on paper — sats 95 on 2L,
        BP 118/74, HR 88 — but I've been watching his oxygen all night and it keeps
        dipping into the high 80s when he sleeps. The night nurse says it self-resolves
        but it's happened three times. I'm not sure if it's just positional or something
        brewing. Also his white count went from 11 to 13 today, only slightly up but
        in this guy I worry. Antibiotics seem to be working but I'd watch him closely
        overnight. Family had a long talk with palliative today, didn't go great.""",
        "department": "icu",
    },
]

def seed():
    print("Seeding patients...")
    for p in DEMO_PATIENTS:
        supabase.table("patients").upsert(p, on_conflict="mrn").execute()

    print("Done. Patients seeded.")
    print("Now log in as a doctor and submit the demo handoff above to populate memories.")

if __name__ == "__main__":
    seed()