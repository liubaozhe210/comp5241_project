"""Real model smoke check without MySQL or Supabase.

Run from backend: python scripts/check_course_ai.py
Sends only the built-in example below; a configured provider may charge for this call.
Never prints credentials or raw provider error bodies.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.errors import AppError
from app.pdf_generation import generate_content

SAMPLE = [{"page": 1, "text": (
    "Requirements engineering. A functional requirement describes an observable behavior, "
    "such as allowing a student to submit an enrollment request. A non-functional requirement "
    "describes a quality constraint, such as displaying search results within two seconds "
    "under a specified load. Acceptance criteria make requirements testable. For example: "
    "given a signed-in student and a published course, when the student applies, then a "
    "pending enrollment is recorded and shown to that student. Avoid vague terms such as "
    "fast or easy without measurable criteria. Review requirements with stakeholders."
)}]


def main():
    try:
        content = generate_content(SAMPLE, "en", "beginner", "Write testable requirements", "both")
    except AppError as exc:
        print(f"FAILED: {exc.code}")
        return 1
    print(f"PASS: AI generated and validated {len(content.lessons)} lessons, quizzes and a scenario.")
    print("No database or authentication service was used.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
