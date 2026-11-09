"""认证与授权依赖：JWT 验签 → 取 profile → 校验角色/状态。

权限判定集中在这里（设计文档 1.3「授权集中」），业务代码不再重复判角色。
profile 现在来自 MySQL，每个请求一个 Session，请求结束自动归还连接。
"""
from typing import Iterator

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from .config import settings
from .db import get_session
from .errors import Forbidden, Unauthorized
from .repo import Repo

_jwks_client = None


def get_repo(session: Session = Depends(get_session)) -> Iterator[Repo]:
    """每个请求构造一个 Repo（绑定独立 Session），请求结束由 get_session 关闭。"""
    repo = Repo(session=session)
    try:
        yield repo
    finally:
        repo.close()


def _jwks():
    global _jwks_client
    if _jwks_client is None:
        from jwt import PyJWKClient

        _jwks_client = PyJWKClient(settings.jwks_url)
    return _jwks_client


def decode_token(token: str) -> dict:
    """支持两种项目配置：旧项目 HS256（JWT secret）、新项目非对称签名（JWKS）。"""
    if settings.supabase_jwt_secret:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.supabase_jwt_audience,
        )
    signing_key = _jwks().get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256", "ES256", "EdDSA"],
        audience=settings.supabase_jwt_audience,
    )


def get_current_user(
    authorization: str = Header(default=""),
    repo: Repo = Depends(get_repo),
) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise Unauthorized("MISSING_TOKEN")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except Exception as exc:
        raise Unauthorized("INVALID_TOKEN", {"reason": str(exc)}) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise Unauthorized("INVALID_TOKEN")

    profile = repo.get_profile(user_id)
    if not profile:
        raise Unauthorized("PROFILE_NOT_FOUND")
    # 禁用账号立即生效：不信 token，每次请求校验 status
    if profile.get("status") != "active":
        raise Forbidden("ACCOUNT_DISABLED")
    return profile


def require_roles(*roles: str):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise Forbidden("ROLE_NOT_ALLOWED", {"required": list(roles)})
        return user

    return dependency


require_admin = require_roles("admin")
require_teacher = require_roles("teacher")
require_student = require_roles("student")
