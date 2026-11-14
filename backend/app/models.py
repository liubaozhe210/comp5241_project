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
    anchor_task_id: Mapped[str] = mapped_column(ForeignKey("learning_path_tasks.id", ondelete="CASCADE"), index=True)
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


class LearningPathAdjustment(Base):
    __tablename__ = "learning_path_adjustments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("learning_path_attempts.id", ondelete="CASCADE"), unique=True)
    kind: Mapped[str] = mapped_column(String(16))
    preview: Mapped[dict] = mapped_column(JSON)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)


class IMResume(Base):
    __tablename__ = "im_resumes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(80))
    text: Mapped[str] = mapped_column(Text)
    source_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    job_title: Mapped[str] = mapped_column(String(120), default="")
    seniority: Mapped[str] = mapped_column(String(16), default="unspecified")
    job_description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now, onupdate=utc_now)


class IMAssessment(Base):
    __tablename__ = "im_assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    resume_id: Mapped[str] = mapped_column(ForeignKey("im_resumes.id", ondelete="CASCADE"), index=True)
    job_title: Mapped[str] = mapped_column(String(120), default="")
    seniority: Mapped[str] = mapped_column(String(16), default="unspecified")
    report_json: Mapped[dict] = mapped_column(JSON)
    model: Mapped[str] = mapped_column(String(160))
    consent_at: Mapped[datetime] = mapped_column(DateTime(6))
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)


class IMSession(Base):
    __tablename__ = "im_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    job_title: Mapped[str] = mapped_column(String(120), default="")
    seniority: Mapped[str] = mapped_column(String(16), default="junior")
    interview_type: Mapped[str] = mapped_column(String(16), default="mixed")
    status: Mapped[str] = mapped_column(String(16), default="in_progress", index=True)
    phase: Mapped[str] = mapped_column(String(16), default="introduction")
    question_limit: Mapped[int] = mapped_column(Integer)
    asked_count: Mapped[int] = mapped_column(Integer, default=0)
    resume_id: Mapped[str | None] = mapped_column(ForeignKey("im_resumes.id", ondelete="SET NULL"), nullable=True, index=True)
    privacy_consent_at: Mapped[datetime] = mapped_column(DateTime(6))
    privacy_policy_version: Mapped[str] = mapped_column(String(32), default="v1")
    report_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    report_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    current_turn_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    question_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(6), nullable=True)
    generation_request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    end_request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now, onupdate=utc_now)


class IMTurn(Base):
    __tablename__ = "im_turns"
    __table_args__ = (
        UniqueConstraint("session_id", "question_index", name="uk_im_turn_question"),
        UniqueConstraint("session_id", "request_id", name="uk_im_turn_request"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("im_sessions.id", ondelete="CASCADE"), index=True)
    question_index: Mapped[int] = mapped_column(Integer)
    phase: Mapped[str] = mapped_column(String(16))
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback: Mapped[str] = mapped_column(String(500), default="")
    answer_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    improvements: Mapped[list] = mapped_column(JSON, default=list)
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    review_recommended: Mapped[bool] = mapped_column(Boolean, default=False)
    question_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(6), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now, onupdate=utc_now)


class IMReviewItem(Base):
    __tablename__ = "im_review_items"
    __table_args__ = (
        UniqueConstraint("owner_id", "source_type", "source_id", name="uk_im_review_source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    source_type: Mapped[str] = mapped_column(String(24))
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    question: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32), default="behavioral")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    answer_framework: Mapped[str] = mapped_column(Text, default="")
    last_answer: Mapped[str] = mapped_column(Text, default="")
    last_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_feedback: Mapped[dict] = mapped_column(JSON, default=dict)
    mastery_status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    last_practiced_at: Mapped[datetime | None] = mapped_column(DateTime(6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(6), default=utc_now, onupdate=utc_now)
