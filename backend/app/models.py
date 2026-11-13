"""ORM 模型（MySQL）。

与 Supabase 版本的差异：
  * id 用 CHAR(36) 存 UUID，由应用层生成（MySQL 没有 gen_random_uuid）
  * DATETIME 统一存 UTC（连接层已 SET time_zone='+00:00'）
  * jsonb → JSON；bigserial → BIGINT AUTO_INCREMENT
  * 不再有 RLS 与 auth.users 外键：profiles.id 仍等于 Supabase auth 用户 id
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NOW = text("CURRENT_TIMESTAMP(6)")


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    login_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, server_default="student")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="active")
    locale: Mapped[str] = mapped_column(String(8), nullable=False, server_default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime(6), nullable=False, server_default=NOW)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    teacher_id: Mapped[str] = mapped_column(String(36), ForeignKey("profiles.id"), nullable=False, index=True)
    semester: Mapped[str] = mapped_column(String(40), nullable=False, server_default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="draft", index=True)
    enrollment_policy: Mapped[str] = mapped_column(String(16), nullable=False, server_default="approval")
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="30")
    created_at: Mapped[datetime] = mapped_column(DateTime(6), nullable=False, server_default=NOW)


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id"), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("profiles.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending", index=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="self_apply")
    applied_at: Mapped[datetime] = mapped_column(DateTime(6), nullable=False, server_default=NOW)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(6), nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(36), nullable=True)


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    storage_path: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(200), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime: Mapped[str] = mapped_column(String(64), nullable=False, server_default="application/pdf")
    pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploader_id: Mapped[str] = mapped_column(String(36), ForeignKey("profiles.id"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(6), nullable=False, server_default=NOW)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), nullable=False, server_default=NOW, index=True)


class InviteCode(Base):
    __tablename__ = "invite_codes"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    note: Mapped[str] = mapped_column(String(120), nullable=False, server_default="")
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(6), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), nullable=False, server_default=NOW)


class LearningPath(Base):
    __tablename__ = "learning_paths"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("profiles.id"), index=True)
    # Kept without a circular FK; maintained transactionally by the service.
    current_version_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)


class LearningPathVersion(Base):
    __tablename__ = "learning_path_versions"
    __table_args__ = (UniqueConstraint("path_id", "number", name="uk_lp_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    path_id: Mapped[str] = mapped_column(ForeignKey("learning_paths.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    topic: Mapped[str] = mapped_column(String(120))
    goal: Mapped[str] = mapped_column(Text)
    level: Mapped[str] = mapped_column(String(16))
    budget_minutes: Mapped[int] = mapped_column(Integer)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)


class LearningPathTask(Base):
    __tablename__ = "learning_path_tasks"
    __table_args__ = (UniqueConstraint("version_id", "position", name="uk_lp_task_position"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("learning_path_versions.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str] = mapped_column(Text)
    minutes: Mapped[int] = mapped_column(Integer)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(6), nullable=True)


class LearningPathTaskSource(Base):
    __tablename__ = "learning_path_task_sources"
    task_id: Mapped[str] = mapped_column(ForeignKey("learning_path_tasks.id", ondelete="CASCADE"), primary_key=True)
    material_id: Mapped[str | None] = mapped_column(ForeignKey("materials.id", ondelete="SET NULL"), nullable=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    page_start: Mapped[int] = mapped_column(Integer)
    page_end: Mapped[int] = mapped_column(Integer)


class LearningPathAssessment(Base):
    __tablename__ = "learning_path_assessments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    anchor_task_id: Mapped[str] = mapped_column(ForeignKey("learning_path_tasks.id", ondelete="CASCADE"), unique=True)
    locale: Mapped[str] = mapped_column(String(8))
    questions: Mapped[list] = mapped_column(JSON)
    sources: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)


class LearningPathAttempt(Base):
    __tablename__ = "learning_path_attempts"
    __table_args__ = (UniqueConstraint("assessment_id", "request_id", name="uk_lp_attempt_request"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("learning_path_assessments.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[str] = mapped_column(String(36))
    answers: Mapped[list] = mapped_column(JSON)
    score: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)
