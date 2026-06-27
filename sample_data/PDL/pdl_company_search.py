import os
import json
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

print("Company Search Script Started")

# ----------------------------------------------------
# Paths
# ----------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent

load_dotenv(PROJECT_ROOT / ".env")

API_KEY = os.getenv("PDL_API_KEY")

if not API_KEY:
    raise ValueError("PDL_API_KEY not found in project .env")

URL = "https://api.peopledatalabs.com/v5/company/search"

HEADERS = {
    "X-api-key": API_KEY,
    "Content-Type": "application/json"
}

INPUT_FILE = BASE_DIR / "pdl_indian_companies.json"
OUTPUT_FILE = BASE_DIR / "pdl_indian_companies_enriched.json"

# ----------------------------------------------------
# Load Companies
# ----------------------------------------------------

try:
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        companies = json.load(f)

    print(f"Loaded {len(companies)} companies.")

except FileNotFoundError:
    print(f"Error: '{INPUT_FILE}' not found.")
    exit()

except json.JSONDecodeError as e:
    print(f"Invalid JSON in '{INPUT_FILE}'.")
    print(e)
    exit()

# ----------------------------------------------------
# Search Companies
# ----------------------------------------------------

results = []

for company in companies:

    website = company["website"]

    print(f"\nSearching company: {website}")

    payload = {
        "query": {
            "term": {
                "website": website
            }
        },
        "size": 1
    }

    try:

        response = requests.post(
            URL,
            headers=HEADERS,
            json=payload,
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
            "input": company,
            "status_code": status,
            "response": response_data
        })

        print(f"✓ Success ({status})")

    except requests.exceptions.Timeout:

        print("✗ Request timed out")

        results.append({
            "input": company,
            "status_code": None,
            "error": "Request timed out"
        })

    except requests.exceptions.ConnectionError:

        print("✗ Connection error")

        results.append({
            "input": company,
            "status_code": None,
            "error": "Connection error"
        })

    except requests.exceptions.RequestException as e:

        print(f"✗ Request failed: {e}")

        results.append({
            "input": company,
            "status_code": None,
            "error": str(e)
        })

    time.sleep(1)

# ----------------------------------------------------
# Save Output
# ----------------------------------------------------

try:

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("\n---------------------------------------")
    print(f"Finished! {len(results)} companies processed.")
    print(f"Results saved to:\n{OUTPUT_FILE}")
    print("---------------------------------------")

except Exception as e:

    print(f"Failed to save output file: {e}")