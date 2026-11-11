"""TEST ONLY: isolated SQLite, fake identities and deterministic AI for browser tests.

Never launch this module as a deployment server. Requires an explicit temporary DB path.
"""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from conftest import FakeRepo
from test_interactive import CONTENT
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import deps
from app.deps import get_repo
from app.interactive_schema import Content
from app.interactive_store import TABLES, InteractiveStore, get_interactive_store
from app.main import app
from app.routers import interactive

database = Path(os.environ["INTERACTIVE_E2E_DB"]).resolve()
engine = create_engine(f"sqlite:///{database.as_posix()}", connect_args={"check_same_thread": False})
for table in TABLES:
    table.create(engine, checkfirst=True)
repo = FakeRepo()
repo.enrollments["approved"] = {"course_id": "c1", "student_id": "u_s1", "status": "approved"}
deps.decode_token = lambda token: {"sub": token}
# Opt-in local manual testing uses the real configured provider. Production's
# app.main entrypoint never imports this fixture or its test identity overrides.
if os.environ.get("INTERACTIVE_E2E_REAL_AI") != "1":
    interactive.generate_content = lambda *args: Content.model_validate(CONTENT)
app.dependency_overrides[get_repo] = lambda: repo

def store():
    with Session(engine, expire_on_commit=False) as session:
        yield InteractiveStore(session)

app.dependency_overrides[get_interactive_store] = store
