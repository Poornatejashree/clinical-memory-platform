import asyncio
import json
import traceback

def test_extraction():
    try:
        from app.services.extraction_service import extractor
        from app.core.supabase import supabase
        
        print("Testing extraction...")
        # Get a real patient ID from the database
        res = supabase.table("patients").select("*").limit(1).execute()
        if not res.data:
            print("No patients in DB!")
            return
        patient_id = res.data[0]["id"]
        
        res = supabase.table("profiles").select("*").limit(1).execute()
        if not res.data:
            print("No profiles in DB!")
            return
        author_id = res.data[0]["id"]
        
        # Insert dummy handoff
        h = supabase.table("handoffs").insert({
            "patient_id": patient_id,
            "outgoing_doctor_id": author_id,
            "raw_transcript": "Patient is stable but heart rate is a bit elevated.",
            "department": "icu",
            "shift_type": "day",
        }).execute().data[0]
        
        extraction = extractor.extract_handoff(
            transcript="Patient is stable but heart rate is a bit elevated.",
            department="icu",
            patient_id=patient_id,
            author_id=author_id,
            handoff_id=h["id"],
        )
        print("Success:", json.dumps(extraction, indent=2))
        
    except Exception as e:
        print("Error!")
        traceback.print_exc()

if __name__ == "__main__":
    test_extraction()
