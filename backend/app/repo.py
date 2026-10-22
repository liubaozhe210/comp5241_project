"""数据访问层：把 Supabase（PostgREST / Admin API / Storage）的调用集中在这里。

上层（routers/services）只依赖本类暴露的方法，因此测试里可以用内存假实现替换，
不需要网络与真实数据库。所有方法返回 dict 或 list[dict]。
"""
from typing import Any, Optional

from .config import settings
from .errors import Conflict, NotFound

TABLE_PROFILES = "profiles"
TABLE_COURSES = "courses"
TABLE_ENROLLMENTS = "enrollments"
TABLE_MATERIALS = "materials"
TABLE_AUDIT = "audit_logs"


def _first(rows: list[dict]) -> Optional[dict]:
    return rows[0] if rows else None


class SupabaseRepo:
    def __init__(self, client: Any = None):
        if client is None:
            from supabase import create_client  # 延迟导入：测试环境不需要装 supabase

            if not settings.supabase_url or not settings.supabase_service_role_key:
                raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置")
            client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        self.db = client

    # ---------------- profiles ----------------
    def get_profile(self, user_id: str) -> Optional[dict]:
        return _first(self.db.table(TABLE_PROFILES).select("*").eq("id", user_id).limit(1).execute().data)

    def find_profile(self, query: str) -> Optional[dict]:
        rows = self.db.table(TABLE_PROFILES).select("*").eq("login_id", query).limit(1).execute().data
        if rows:
            return rows[0]
        return _first(self.db.table(TABLE_PROFILES).select("*").eq("email", query.lower()).limit(1).execute().data)

    def list_profiles(self, role: Optional[str] = None, q: Optional[str] = None) -> list[dict]:
        req = self.db.table(TABLE_PROFILES).select("*")
        if role:
            req = req.eq("role", role)
        rows = req.order("created_at", desc=False).execute().data
        if q:
            needle = q.lower()
            rows = [r for r in rows if needle in (r.get("name", "") + r.get("login_id", "") + r.get("email", "")).lower()]
        return rows

    def update_profile(self, user_id: str, patch: dict) -> dict:
        rows = self.db.table(TABLE_PROFILES).update(patch).eq("id", user_id).execute().data
        if not rows:
            raise NotFound("profile not found")
        return rows[0]

    def create_auth_user(self, email: str, password: str, metadata: dict) -> dict:
        """通过 Admin API 建账号（email_confirm=True，绕过邮件确认）；触发器会建 profile。"""
        try:
            res = self.db.auth.admin.create_user(
                {
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": metadata,
                }
            )
        except Exception as exc:  # 邮箱/学号重复等
            raise Conflict("ACCOUNT_EXISTS", {"reason": str(exc)}) from exc
        user = getattr(res, "user", None) or res
        return {"id": getattr(user, "id", None), "email": email}

    def reset_password(self, user_id: str, password: str) -> None:
        self.db.auth.admin.update_user_by_id(user_id, {"password": password})

    # ---------------- courses ----------------
    def list_courses(self, status: Optional[str] = None, teacher_id: Optional[str] = None) -> list[dict]:
        req = self.db.table(TABLE_COURSES).select("*")
        if status:
            req = req.eq("status", status)
        if teacher_id:
            req = req.eq("teacher_id", teacher_id)
        return req.order("created_at", desc=True).execute().data

    def get_course(self, course_id: str) -> Optional[dict]:
        return _first(self.db.table(TABLE_COURSES).select("*").eq("id", course_id).limit(1).execute().data)

    def create_course(self, payload: dict) -> dict:
        try:
            rows = self.db.table(TABLE_COURSES).insert(payload).execute().data
        except Exception as exc:
            raise Conflict("COURSE_CODE_TAKEN", {"reason": str(exc)}) from exc
        return rows[0]

    def update_course(self, course_id: str, patch: dict) -> dict:
        rows = self.db.table(TABLE_COURSES).update(patch).eq("id", course_id).execute().data
        if not rows:
            raise NotFound("course not found")
        return rows[0]

    # ---------------- enrollments ----------------
    def list_enrollments(
        self,
        course_id: Optional[str] = None,
        student_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        req = self.db.table(TABLE_ENROLLMENTS).select("*")
        if course_id:
            req = req.eq("course_id", course_id)
        if student_id:
            req = req.eq("student_id", student_id)
        if status:
            req = req.eq("status", status)
        return req.execute().data

    def get_enrollment(self, course_id: str, student_id: str) -> Optional[dict]:
        rows = (
            self.db.table(TABLE_ENROLLMENTS)
            .select("*")
            .eq("course_id", course_id)
            .eq("student_id", student_id)
            .limit(1)
            .execute()
            .data
        )
        return _first(rows)

    def get_enrollment_by_id(self, enrollment_id: str) -> Optional[dict]:
        return _first(
            self.db.table(TABLE_ENROLLMENTS).select("*").eq("id", enrollment_id).limit(1).execute().data
        )

    def insert_enrollment(self, payload: dict) -> dict:
        return self.db.table(TABLE_ENROLLMENTS).insert(payload).execute().data[0]

    def update_enrollment(self, enrollment_id: str, patch: dict) -> dict:
        rows = self.db.table(TABLE_ENROLLMENTS).update(patch).eq("id", enrollment_id).execute().data
        if not rows:
            raise NotFound("enrollment not found")
        return rows[0]

    def count_approved(self, course_id: str) -> int:
        rows = (
            self.db.table(TABLE_ENROLLMENTS)
            .select("id")
            .eq("course_id", course_id)
            .eq("status", "approved")
            .execute()
            .data
        )
        return len(rows)

    # ---------------- materials ----------------
    def list_materials(self, course_id: str) -> list[dict]:
        return (
            self.db.table(TABLE_MATERIALS)
            .select("*")
            .eq("course_id", course_id)
            .order("sort_order", desc=False)
            .execute()
            .data
        )

    def get_material(self, material_id: str) -> Optional[dict]:
        return _first(
            self.db.table(TABLE_MATERIALS).select("*").eq("id", material_id).limit(1).execute().data
        )

    def insert_material(self, payload: dict) -> dict:
        return self.db.table(TABLE_MATERIALS).insert(payload).execute().data[0]

    def delete_material(self, material_id: str) -> None:
        self.db.table(TABLE_MATERIALS).delete().eq("id", material_id).execute()

    def upload_object(self, path: str, data: bytes, content_type: str) -> None:
        self.db.storage.from_(settings.materials_bucket).upload(
            path, data, {"content-type": content_type, "upsert": "false"}
        )

    def signed_url(self, path: str, ttl: int) -> str:
        res = self.db.storage.from_(settings.materials_bucket).create_signed_url(path, ttl)
        if isinstance(res, dict):
            return res.get("signedURL") or res.get("signedUrl") or ""
        return getattr(res, "signed_url", "") or ""

    def delete_object(self, path: str) -> None:
        self.db.storage.from_(settings.materials_bucket).remove([path])

    # ---------------- audit ----------------
    def insert_audit(self, payload: dict) -> None:
        self.db.table(TABLE_AUDIT).insert(payload).execute()

    def list_audit(self, limit: int = 100) -> list[dict]:
        return self.db.table(TABLE_AUDIT).select("*").order("created_at", desc=True).limit(limit).execute().data
