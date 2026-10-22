"""测试夹具：用内存版 repo 替换 Supabase，全部离线运行。

覆盖点：RBAC、课程两层可见性、选课状态机、课件鉴权、审计留痕。
"""
import itertools
import uuid

import pytest
from fastapi.testclient import TestClient

from app.deps import get_current_user, get_repo
from app.main import app


class FakeRepo:
    """按 SupabaseRepo 的方法签名实现的内存版本。"""

    def __init__(self):
        self.profiles: dict[str, dict] = {}
        self.courses: dict[str, dict] = {}
        self.enrollments: dict[str, dict] = {}
        self.materials: dict[str, dict] = {}
        self.audit: list[dict] = []
        self.objects: dict[str, bytes] = {}
        self._seq = itertools.count(1)
        self._seed()

    # ---------- 种子数据 ----------
    def _seed(self):
        def add_profile(uid, login_id, name, role):
            self.profiles[uid] = {
                "id": uid,
                "login_id": login_id,
                "name": name,
                "email": f"{login_id}@polyu.edu.hk",
                "role": role,
                "status": "active",
                "locale": "en",
                "created_at": "2026-10-01T00:00:00+00:00",
            }

        add_profile("u_admin", "admin", "Alice Chan", "admin")
        add_profile("u_t1", "t1001", "Dr. Michael Wong", "teacher")
        add_profile("u_t2", "t1002", "Prof. Sarah Lee", "teacher")
        add_profile("u_s1", "26072062g", "Lin Mohan", "student")
        add_profile("u_s2", "26072063g", "Chen Wei", "student")

        self.courses["c1"] = {
            "id": "c1", "code": "COMP5241", "name": "Software Engineering",
            "description": "SE course", "teacher_id": "u_t1", "semester": "2026/27 S1",
            "status": "published", "enrollment_policy": "approval", "capacity": 40,
        }
        self.courses["c_full"] = {
            "id": "c_full", "code": "COMP9999", "name": "Full Course",
            "description": "", "teacher_id": "u_t1", "semester": "2026/27 S1",
            "status": "published", "enrollment_policy": "open", "capacity": 1,
        }
        self.enrollments["e_full"] = {
            "id": "e_full", "course_id": "c_full", "student_id": "u_s2",
            "status": "approved", "source": "teacher_add", "applied_at": None, "decided_at": None,
        }

    def _next_id(self, prefix):
        return f"{prefix}_{next(self._seq)}"

    # ---------- profiles ----------
    def get_profile(self, user_id):
        return self.profiles.get(user_id)

    def find_profile(self, query):
        for p in self.profiles.values():
            if p["login_id"] == query or p["email"] == query.lower():
                return p
        return None

    def list_profiles(self, role=None, q=None):
        rows = list(self.profiles.values())
        if role:
            rows = [r for r in rows if r["role"] == role]
        if q:
            needle = q.lower()
            rows = [r for r in rows if needle in (r["name"] + r["login_id"] + r["email"]).lower()]
        return rows

    def update_profile(self, user_id, patch):
        self.profiles[user_id].update(patch)
        return self.profiles[user_id]

    def create_auth_user(self, email, password, metadata):
        uid = self._next_id("u")
        role = metadata.get("role", "student")
        self.profiles[uid] = {
            "id": uid,
            "login_id": metadata.get("login_id"),
            "name": metadata.get("name"),
            "email": email.lower(),
            "role": role,
            "status": "active",
            "locale": metadata.get("locale", "en"),
        }
        return {"id": uid, "email": email}

    def reset_password(self, user_id, password):
        self.profiles[user_id]["password_reset"] = True

    # ---------- courses ----------
    def list_courses(self, status=None, teacher_id=None):
        rows = list(self.courses.values())
        if status:
            rows = [r for r in rows if r["status"] == status]
        if teacher_id:
            rows = [r for r in rows if r["teacher_id"] == teacher_id]
        return rows

    def get_course(self, course_id):
        return self.courses.get(course_id)

    def create_course(self, payload):
        cid = self._next_id("c")
        row = {**payload, "id": cid}
        self.courses[cid] = row
        return row

    def update_course(self, course_id, patch):
        self.courses[course_id].update(patch)
        return self.courses[course_id]

    # ---------- enrollments ----------
    def list_enrollments(self, course_id=None, student_id=None, status=None):
        rows = list(self.enrollments.values())
        if course_id:
            rows = [r for r in rows if r["course_id"] == course_id]
        if student_id:
            rows = [r for r in rows if r["student_id"] == student_id]
        if status:
            rows = [r for r in rows if r["status"] == status]
        return rows

    def get_enrollment(self, course_id, student_id):
        for row in self.enrollments.values():
            if row["course_id"] == course_id and row["student_id"] == student_id:
                return row
        return None

    def get_enrollment_by_id(self, enrollment_id):
        return self.enrollments.get(enrollment_id)

    def insert_enrollment(self, payload):
        eid = self._next_id("e")
        row = {**payload, "id": eid}
        self.enrollments[eid] = row
        return row

    def update_enrollment(self, enrollment_id, patch):
        self.enrollments[enrollment_id].update(patch)
        return self.enrollments[enrollment_id]

    def count_approved(self, course_id):
        return len([e for e in self.enrollments.values() if e["course_id"] == course_id and e["status"] == "approved"])

    # ---------- materials ----------
    def list_materials(self, course_id):
        return [m for m in self.materials.values() if m["course_id"] == course_id]

    def get_material(self, material_id):
        return self.materials.get(material_id)

    def insert_material(self, payload):
        mid = self._next_id("m")
        row = {**payload, "id": mid}
        self.materials[mid] = row
        return row

    def delete_material(self, material_id):
        self.materials.pop(material_id, None)

    def upload_object(self, path, data, content_type):
        self.objects[path] = data

    def signed_url(self, path, ttl):
        return f"https://example.test/{path}?token={uuid.uuid4().hex[:8]}"

    def delete_object(self, path):
        self.objects.pop(path, None)

    # ---------- audit ----------
    def insert_audit(self, payload):
        self.audit.append({**payload, "id": self._next_id("a")})

    def list_audit(self, limit=100):
        return list(reversed(self.audit))[:limit]


@pytest.fixture
def repo():
    return FakeRepo()


@pytest.fixture(autouse=True)
def _wire(repo):
    """所有测试自动把 repo 依赖替换成内存版（无需网络与真实 Supabase）。"""
    app.dependency_overrides[get_repo] = lambda: repo
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    """未登录的客户端。"""
    return TestClient(app)


@pytest.fixture
def login(repo, monkeypatch):
    """切换身份：把 token 直接当 user id 解析，其余依赖链（查 profile、校验 status）真实执行。

    这样多个角色的 client 可以并存互不干扰（之前的全局 monkeypatch 会串号）。
    """
    from app import deps

    monkeypatch.setattr(deps, "decode_token", lambda token: {"sub": token})

    def _login(user_id: str) -> TestClient:
        return TestClient(app, headers={"Authorization": f"Bearer {user_id}"})

    return _login
