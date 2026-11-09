"""数据库连接层（MySQL / SQLAlchemy 2.0）。

引擎与 Session 都是惰性创建：单元测试会用内存假实现替换 repo，
不会触碰到真实数据库，所以这里不能在 import 阶段就要求 DATABASE_URL 存在。
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import settings

_engine = None
_session_factory: sessionmaker[Session] | None = None


def get_engine():
    global _engine
    if _engine is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL 未配置（见 backend/.env.example）")
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,          # 阿里云会掐空闲连接，取用前先探活
            pool_recycle=settings.db_pool_recycle,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            echo=settings.db_echo,
            # 统一以 UTC 存 DATETIME，避免服务器 CST 与客户端时区不一致
            connect_args={"init_command": "SET time_zone = '+00:00'"},
        )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            expire_on_commit=False,      # 提交后仍能读对象属性，便于转 dict
        )
    return _session_factory


@contextmanager
def session_scope() -> Iterator[Session]:
    """脚本里用的短事务上下文。"""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI 依赖：每个请求一个 Session，请求结束必定关闭。"""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
