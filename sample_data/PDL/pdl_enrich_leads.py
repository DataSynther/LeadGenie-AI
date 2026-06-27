import os
import json
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

print("Script started")

# ----------------------------------------------------
# Paths
# ----------------------------------------------------

# Folder containing this script
BASE_DIR = Path(__file__).resolve().parent

# Project root
PROJECT_ROOT = BASE_DIR.parent.parent

# Load .env from project root
load_dotenv(PROJECT_ROOT / ".env")

API_KEY = os.getenv("PDL_API_KEY")

if not API_KEY:
    raise ValueError("PDL_API_KEY not found in project .env")

URL = "https://api.peopledatalabs.com/v5/person/enrich"

HEADERS = {
    "X-api-key": API_KEY,
    "Content-Type": "application/json"
}

INPUT_FILE = BASE_DIR / "pdl_leads.json"
OUTPUT_FILE = BASE_DIR / "pdl_enriched_leads.json"

# ----------------------------------------------------
# Load Leads
# ----------------------------------------------------

try:
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        leads = json.load(f)

    print(f"Loaded {len(leads)} leads.")

except FileNotFoundError:
    print(f"Error: '{INPUT_FILE}' not found.")
    exit()

except json.JSONDecodeError as e:
    print(f"Invalid JSON in '{INPUT_FILE}'.")
    print(e)
    exit()

# ----------------------------------------------------
# Enrich Leads
# ----------------------------------------------------

results = []

for lead in leads:

    payload = {
        "first_name": lead["first_name"],
        "last_name": lead["last_name"],
        "company": lead["company"]
    }

    print(
        f"\nEnriching: {lead['first_name']} {lead['last_name']} ({lead['company']})"
    )

    try:

        response = requests.get(
            URL,
            headers=HEADERS,
            params=payload,
            timeout=30
        )

        status = response.status_code

        try:
            response_data = response.json()
        except ValueError:
            response_data = {
                "raw_response": response.text
            }

        results.append({
            "input": lead,
            "status_code": status,
            "response": response_data
        })

        print(f"✓ Success ({status})")

    except requests.exceptions.Timeout:

        print("✗ Request timed out")

        results.append({
            "input": lead,
            "status_code": None,
            "error": "Request timed out"
        })

    except requests.exceptions.ConnectionError:

        print("✗ Connection error")

        results.append({
            "input": lead,
            "status_code": None,
            "error": "Connection error"
        })

    except requests.exceptions.RequestException as e:

        print(f"✗ Request failed: {e}")

        results.append({
            "input": lead,
            "status_code": None,
            "error": str(e)
        })

    # Avoid hitting API rate limits
    time.sleep(1)

# ----------------------------------------------------
# Save Output
# ----------------------------------------------------

try:

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("\n---------------------------------------")
    print(f"Finished! {len(results)} leads processed.")
    print(f"Results saved to:\n{OUTPUT_FILE}")
    print("---------------------------------------")

except Exception as e:

    print(f"Failed to save output file: {e}")