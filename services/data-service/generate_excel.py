#!/usr/bin/env python3
"""Generate faculty_data.xlsx from the latest data export.

Columns:
  1. Faculty Name (scraped)
  2. OpenAlex ID
  3. OpenAlex Citation Number
  4. OpenAlex Citation (empty - manual)
  5. Google Scholar Citation (empty - manual)
"""

import json
import os
from pathlib import Path
import pandas as pd


def main():
    # Find the latest data export
    exports_dir = Path("data_exports")
    if not exports_dir.exists():
        print("No data_exports directory found. Run the pipeline first.")
        return
    
    latest = sorted([d for d in exports_dir.iterdir() if d.is_dir()])[-1]
    authors_file = latest / "authors.json"
    print(f"Using data export: {latest}")
    
    with open(authors_file, "r") as f:
        authors = json.load(f)
    
    # Filter to faculty-only authors
    faculty = [a for a in authors if a.get("is_faculty")]
    print(f"Faculty authors: {len(faculty)}")
    
    records = []
    for a in faculty:
        records.append({
            "Faculty Name": a.get("name", ""),
            "OpenAlex ID": a.get("id", ""),
            "OpenAlex Citation Number": a.get("cited_by_count", ""),
            "OpenAlex Citation": "",
            "Google Scholar Citation": "",
        })
    
    # Sort by name
    records.sort(key=lambda x: x["Faculty Name"])
    
    df = pd.DataFrame(records)
    output = "faculty_data.xlsx"
    df.to_excel(output, index=False)
    print(f"Saved to {output} ({len(records)} rows)")


if __name__ == "__main__":
    main()
