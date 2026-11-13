"""Persistent snapshots and progress. Optimistic locking prevents lost teacher edits."""
import copy
import hashlib
import uuid
from datetime import datetime, timezone

from fastapi import Depends
from sqlalchemy import Integer, JSON, LargeBinary, String, select, update
from sqlalchemy.dialects.mysql import LONGBLOB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, mapped_column

from .db import get_session
from .errors import Conflict, NotFound
from .models import Base


class InteractiveCourse(Base):
    __tablename__ = "interactive_courses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    course_id: Mapped[str] = mapped_column(String(36), index=True)
    owner_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer, default=1)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    source_name: Mapped[str] = mapped_column(String(200))
    source_sha256: Mapped[str] = mapped_column(String(64))
    source_pages: Mapped[list] = mapped_column(JSON)
    content: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))
    source_data: Mapped[bytes] = mapped_column(LargeBinary().with_variant(LONGBLOB(), "mysql"), deferred=True)


class InteractiveRevision(Base):
    __tablename__ = "interactive_revisions"
    interactive_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[dict] = mapped_column(JSON)


class InteractiveProgress(Base):
    __tablename__ = "interactive_progress"
    interactive_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    data: Mapped[dict] = mapped_column(JSON)


TABLES = [InteractiveCourse.__table__, InteractiveRevision.__table__, InteractiveProgress.__table__]


class InteractiveStore:
    def __init__(self, session):
        self.session = session

    def get(self, iid):
        row = self.session.get(InteractiveCourse, iid)
        if row is None:
            raise NotFound("INTERACTIVE_NOT_FOUND")
        return row

    def list(self, course_id):
        return self.session.scalars(select(InteractiveCourse).where(
            InteractiveCourse.course_id == course_id).order_by(InteractiveCourse.created_at.desc())).all()

    def create(self, course_id, owner, name, data, pages, content):
        row = InteractiveCourse(id=str(uuid.uuid4()), course_id=course_id, owner_id=owner,
            source_name=name, source_data=data, source_sha256=hashlib.sha256(data).hexdigest(),
            source_pages=pages, content=content, version=1, revision=0,
            created_at=datetime.now(timezone.utc).isoformat())
        self.session.add(row)
        self.session.commit()
        return row

    def save(self, row, version, content):
        result = self.session.execute(update(InteractiveCourse).where(
            InteractiveCourse.id == row.id, InteractiveCourse.version == version
        ).values(content=content, version=version + 1).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            self.session.rollback()
            raise Conflict("INTERACTIVE_EDIT_CONFLICT")
        self.session.commit()
        self.session.refresh(row)
        return row

    def snapshot(self, row, revision=None):
        revision = row.revision if revision is None else revision
        snap = self.session.get(InteractiveRevision, (row.id, revision))
        if snap is None:
            raise NotFound("INTERACTIVE_NOT_PUBLISHED")
        return copy.deepcopy(snap.content)

    def publish(self, row, version):
        if row.version != version:
            raise Conflict("INTERACTIVE_EDIT_CONFLICT")
        if row.revision and self.snapshot(row) == row.content:
            return row
        revision = row.revision + 1
        result = self.session.execute(update(InteractiveCourse).where(
            InteractiveCourse.id == row.id, InteractiveCourse.version == version
        ).values(revision=revision, version=version + 1).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            self.session.rollback()
            raise Conflict("INTERACTIVE_EDIT_CONFLICT")
        self.session.add(InteractiveRevision(interactive_id=row.id, revision=revision,
                                            content=copy.deepcopy(row.content)))
        self.session.commit()
        self.session.refresh(row)
        return row

    def progress(self, row, user_id, revision):
        record = self.session.get(InteractiveProgress, (row.id, revision, user_id))
        data = copy.deepcopy(record.data) if record else {"completed": [], "quizzes": {}, "scenario": None}
        return record, data

    def save_progress(self, row, user_id, revision, record, data):
        try:
            if record:
                result = self.session.execute(update(InteractiveProgress).where(
                    InteractiveProgress.interactive_id == row.id,
                    InteractiveProgress.revision == revision,
                    InteractiveProgress.user_id == user_id,
                    InteractiveProgress.version == record.version
                ).values(data=data, version=record.version + 1).execution_options(synchronize_session=False))
                if result.rowcount != 1:
                    self.session.rollback()
                    raise Conflict("INTERACTIVE_PROGRESS_CONFLICT")
            else:
                self.session.add(InteractiveProgress(interactive_id=row.id, revision=revision,
                                                     user_id=user_id, version=1, data=data))
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise Conflict("INTERACTIVE_PROGRESS_CONFLICT") from exc


def get_interactive_store(session=Depends(get_session)):
    return InteractiveStore(session)
