"""数据访问层。

业务数据在 **MySQL**（SQLAlchemy 2.0）；认证与课件存储也已自托管：
  * Auth —— 密码哈希存 profiles.password_hash，JWT 由后端自签（见 security.py）
  * Storage —— 课件文件存本地磁盘（settings.materials_dir）

上层（routers / services）只依赖本类方法，因此测试用内存假实现替换即可，
不需要网络与真实数据库。所有方法返回 dict 或 list[dict]。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import delete, func, or_, select, update

from .config import settings
from .db import get_session_factory
from .errors import Conflict, NotFound
from .models import AuditLog, Course, Enrollment, InviteCode, Material, Profile
from .security import verify_password


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    """库里统一存 UTC（连接层已 SET time_zone='+00:00'），这里给 naive UTC。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_dict(obj: Any) -> dict:
    """ORM 对象 → dict，并把 datetime 转成 ISO 字符串。

    路由层的 Pydantic 模型里时间字段是 `str | None`（沿用 PostgREST 的返回格式），
    所以这里统一转成 ISO 8601，避免下游再做一次适配。
    注意：password_hash 永不进入返回 dict，避免泄露。
    """
    if obj is None:
        return {}
    out = {}
    for column in obj.__table__.columns:
        if column.name == "password_hash":
            continue
        value = getattr(obj, column.name)
        if isinstance(value, datetime):
            value = value.replace(tzinfo=timezone.utc).isoformat()
        out[column.name] = value
    return out


class Repo:
    """MySQL 数据访问 + 本地课件存储。"""

    def __init__(self, session: Any = None):
        if session is None:
            self.session = get_session_factory()()
            self._owns_session = True
        else:
            self.session = session
            self._owns_session = False

    # ---------- 生命周期 ----------
    def close(self) -> None:
        if self._owns_session:
            self.session.close()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()

    # ---------------- profiles ----------------
    def get_profile(self, user_id: str) -> Optional[dict]:
        obj = self.session.get(Profile, user_id)
        return _to_dict(obj) if obj else None

    def find_profile(self, query: str) -> Optional[dict]:
        stmt = select(Profile).where(
            or_(Profile.login_id == query, Profile.email == (query or "").lower())
        ).limit(1)
        obj = self.session.execute(stmt).scalar_one_or_none()
        return _to_dict(obj) if obj else None

    def list_profiles(self, role: Optional[str] = None, q: Optional[str] = None) -> list[dict]:
        stmt = select(Profile)
        if role:
            stmt = stmt.where(Profile.role == role)
        if q:
            needle = f"%{q.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(Profile.name).like(needle),
                    func.lower(Profile.login_id).like(needle),
                    func.lower(Profile.email).like(needle),
                )
            )
        stmt = stmt.order_by(Profile.created_at.asc())
        return [_to_dict(r) for r in self.session.execute(stmt).scalars()]

    def insert_profile(self, payload: dict) -> dict:
        row = Profile(
            id=payload["id"],
            login_id=payload["login_id"],
            name=payload["name"],
            email=payload["email"].lower(),
            password_hash=payload["password_hash"],
            role=payload.get("role", "student"),
            status=payload.get("status", "active"),
            locale=payload.get("locale", "en"),
        )
        self.session.add(row)
        try:
            self.session.commit()
        except Exception as exc:
            self.session.rollback()
            raise Conflict("ACCOUNT_EXISTS", {"reason": str(exc)}) from exc
        self.session.refresh(row)
        return _to_dict(row)

    def authenticate(self, identifier: str, password: str) -> Optional[dict]:
        """按 login_id 或 email 查用户并校验密码；成功返回 profile（不含密码哈希）。"""
        stmt = (
            select(Profile)
            .where(or_(Profile.login_id == identifier, Profile.email == (identifier or "").lower()))
            .limit(1)
        )
        obj = self.session.execute(stmt).scalar_one_or_none()
        if obj is None or not verify_password(password, obj.password_hash):
            return None
        return _to_dict(obj)

    def update_password(self, user_id: str, password_hash: str) -> None:
        self.session.execute(
            update(Profile).where(Profile.id == user_id).values(password_hash=password_hash)
        )
        self.session.commit()

    def update_profile(self, user_id: str, patch: dict) -> dict:
        obj = self.session.get(Profile, user_id)
        if not obj:
            raise NotFound("profile not found")
        for key, value in patch.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        self.session.commit()
        self.session.refresh(obj)
        return _to_dict(obj)

    def delete_profile(self, user_id: str) -> None:
        self.session.execute(delete(Profile).where(Profile.id == user_id))
        self.session.commit()

    # ---------------- 邀请码 ----------------
    def check_invite_code(self, code: str) -> bool:
        """只读预校验（不消费），用于给出友好的 422。"""
        normalized = (code or "").strip().upper()
        if not normalized:
            return False
        obj = self.session.get(InviteCode, normalized)
        if not obj:
            return False
        if obj.max_uses is not None and obj.used_count >= obj.max_uses:
            return False
        if obj.expires_at is not None and obj.expires_at <= _now():
            return False
        return True

    def consume_invite_code(self, code: str) -> bool:
        """原子消费一次。靠 UPDATE 的 rowcount 判断，并发下不会超发。"""
        normalized = (code or "").strip().upper()
        result = self.session.execute(
            update(InviteCode)
            .where(
                InviteCode.code == normalized,
                or_(InviteCode.max_uses.is_(None), InviteCode.used_count < InviteCode.max_uses),
                or_(InviteCode.expires_at.is_(None), InviteCode.expires_at > _now()),
            )
            .values(used_count=InviteCode.used_count + 1)
        )
        self.session.commit()
        return result.rowcount == 1

    # ---------------- courses ----------------
    def list_courses(self, status: Optional[str] = None, teacher_id: Optional[str] = None) -> list[dict]:
        stmt = select(Course)
        if status:
            stmt = stmt.where(Course.status == status)
        if teacher_id:
            stmt = stmt.where(Course.teacher_id == teacher_id)
        stmt = stmt.order_by(Course.created_at.desc())
        return [_to_dict(r) for r in self.session.execute(stmt).scalars()]

    def get_course(self, course_id: str) -> Optional[dict]:
        obj = self.session.get(Course, course_id)
        return _to_dict(obj) if obj else None

    def create_course(self, payload: dict) -> dict:
        row = Course(id=payload.get("id") or _uuid(), **{k: v for k, v in payload.items() if k != "id"})
        self.session.add(row)
        try:
            self.session.commit()
        except Exception as exc:
            self.session.rollback()
            raise Conflict("COURSE_CODE_TAKEN", {"reason": str(exc)}) from exc
        self.session.refresh(row)
        return _to_dict(row)

    def update_course(self, course_id: str, patch: dict) -> dict:
        obj = self.session.get(Course, course_id)
        if not obj:
            raise NotFound("course not found")
        for key, value in patch.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        self.session.commit()
        self.session.refresh(obj)
        return _to_dict(obj)

    # ---------------- enrollments ----------------
    def list_enrollments(
        self,
        course_id: Optional[str] = None,
        student_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        stmt = select(Enrollment)
        if course_id:
            stmt = stmt.where(Enrollment.course_id == course_id)
        if student_id:
            stmt = stmt.where(Enrollment.student_id == student_id)
        if status:
            stmt = stmt.where(Enrollment.status == status)
        return [_to_dict(r) for r in self.session.execute(stmt).scalars()]

    def get_enrollment(self, course_id: str, student_id: str) -> Optional[dict]:
        stmt = (
            select(Enrollment)
            .where(Enrollment.course_id == course_id, Enrollment.student_id == student_id)
            .limit(1)
        )
        obj = self.session.execute(stmt).scalar_one_or_none()
        return _to_dict(obj) if obj else None

    def get_enrollment_by_id(self, enrollment_id: str) -> Optional[dict]:
        obj = self.session.get(Enrollment, enrollment_id)
        return _to_dict(obj) if obj else None

    def insert_enrollment(self, payload: dict) -> dict:
        row = Enrollment(id=payload.get("id") or _uuid(), **{k: v for k, v in payload.items() if k != "id"})
        self.session.add(row)
        try:
            self.session.commit()
        except Exception as exc:
            self.session.rollback()
            raise Conflict("ENROLLMENT_EXISTS", {"reason": str(exc)}) from exc
        self.session.refresh(row)
        return _to_dict(row)

    def update_enrollment(self, enrollment_id: str, patch: dict) -> dict:
        obj = self.session.get(Enrollment, enrollment_id)
        if not obj:
            raise NotFound("enrollment not found")
        for key, value in patch.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
        self.session.commit()
        self.session.refresh(obj)
        return _to_dict(obj)

    def count_approved(self, course_id: str) -> int:
        stmt = select(func.count()).select_from(Enrollment).where(
            Enrollment.course_id == course_id, Enrollment.status == "approved"
        )
        return int(self.session.execute(stmt).scalar_one())

    def approved_counts(self, course_ids: list[str]) -> dict[str, int]:
        """一次查询拿到多门课的已通过人数，替代 N+1。"""
        if not course_ids:
            return {}
        stmt = (
            select(Enrollment.course_id, func.count())
            .where(Enrollment.course_id.in_(course_ids), Enrollment.status == "approved")
            .group_by(Enrollment.course_id)
        )
        rows = self.session.execute(stmt).all()
        counts = {cid: 0 for cid in course_ids}
        for course_id, count in rows:
            counts[course_id] = int(count)
        return counts

    # ---------------- materials ----------------
    def list_materials(self, course_id: str) -> list[dict]:
        stmt = (
            select(Material)
            .where(Material.course_id == course_id)
            .order_by(Material.sort_order.asc(), Material.created_at.asc())
        )
        return [_to_dict(r) for r in self.session.execute(stmt).scalars()]

    def get_material(self, material_id: str) -> Optional[dict]:
        obj = self.session.get(Material, material_id)
        return _to_dict(obj) if obj else None

    def insert_material(self, payload: dict) -> dict:
        row = Material(id=payload.get("id") or _uuid(), **{k: v for k, v in payload.items() if k != "id"})
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return _to_dict(row)

    def delete_material(self, material_id: str) -> None:
        self.session.execute(delete(Material).where(Material.id == material_id))
        self.session.commit()

    # ---------------- 课件文件（本地磁盘）----------------
    def _storage_path(self, path: str) -> Path:
        root = Path(settings.materials_dir).resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root):
            raise NotFound("INVALID_STORAGE_PATH")
        return target

    def upload_object(self, path: str, data: bytes, content_type: str) -> None:
        target = self._storage_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def download_object(self, path: str) -> bytes:
        target = self._storage_path(path)
        if not target.is_file():
            raise NotFound("MATERIAL_NOT_FOUND")
        return target.read_bytes()

    def delete_object(self, path: str) -> None:
        target = self._storage_path(path)
        if target.is_file():
            target.unlink()

    # ---------------- audit ----------------
    def insert_audit(self, payload: dict) -> None:
        row = AuditLog(
            actor_id=payload.get("actor_id"),
            action=payload["action"],
            target_type=payload.get("target_type"),
            target_id=payload.get("target_id"),
            detail=payload.get("detail") or {},
            ip=payload.get("ip"),
        )
        self.session.add(row)
        self.session.commit()

    def list_audit(self, limit: int = 100) -> list[dict]:
        stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
        return [_to_dict(r) for r in self.session.execute(stmt).scalars()]
