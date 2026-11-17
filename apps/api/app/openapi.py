"""Write the OpenAPI schema to apps/api/openapi.json (source for the web app's TS types)."""

import json
from pathlib import Path

from app.main import app

if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "openapi.json"
    out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
