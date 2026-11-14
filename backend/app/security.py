"""自托管认证与课件下载签名（不再依赖 Supabase Auth / Storage）。

- 密码用 bcrypt 哈希，存 profiles.password_hash。
- JWT 用 HS256 自签（密钥来自 settings.jwt_secret）。
- 课件下载 URL 用 HMAC 签名（`{expiry}.{hmac(material_id + expiry)}`），
  与旧 Supabase 签名 URL 一样可脱离 Authorization 头直接打开。
"""
from __future__ import annotations

import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=settings.jwt_ttl_seconds),
        "aud": settings.jwt_audience,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _signature(message: str) -> str:
    return hmac.new(settings.jwt_secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_material_token(material_id: str, ttl: int) -> str:
    exp = int(time.time()) + ttl
    return f"{exp}.{_signature(f'{material_id}.{exp}')}"


def verify_material_token(material_id: str, token: str) -> bool:
    try:
        exp_str, sig = token.split(".", 1)
        exp = int(exp_str)
    except (ValueError, AttributeError):
        return False
    if exp < int(time.time()):
        return False
    return hmac.compare_digest(sig, _signature(f"{material_id}.{exp}"))
