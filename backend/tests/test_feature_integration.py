"""Both feature families remain available through the production application."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.mark.parametrize("path", [
    "/courses/test-course/interactive",
    "/me/learning-paths",
    "/materials/test-material/text",
    "/learning-paths/test-path/tasks/test-task/study",
    "/learning-paths/test-path/stages",
    "/learning-paths/test-path/attempts/test-attempt/adjustment",
])
def test_combined_feature_routes_require_authentication(path):
    # Without a token, both modules must reject access before reading the database.
    with TestClient(app) as client:
        response = client.get(path)
    assert response.status_code == 401
    assert response.json()["code"] == "MISSING_TOKEN"
