"""账号相关：注册、登录、当前用户、语言偏好。

认证已从 Supabase Auth 迁到自托管：密码 bcrypt 哈希存 profiles.password_hash，
登录由后端校验并签发 HS256 JWT（见 app/security.py）。
"""
import uuid

from fastapi import APIRouter, Depends

from ..deps import get_current_user, get_repo
from ..errors import Conflict, Forbidden, Unauthorized, Unprocessable
from ..schemas import LoginRequest, ProfileOut, RegisterRequest, TokenOut, UpdateLocaleRequest
from ..security import create_access_token, hash_password
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, repo=Depends(get_repo)):
    """学生 / 教师注册（单阶段，直接写 MySQL）。教师必须带有效邀请码。"""
    code = (payload.invite_code or "").strip().upper()
    if payload.role == "teacher":
        if not code:
            raise Unprocessable("INVITE_CODE_REQUIRED")
        if not repo.check_invite_code(code):
            raise Unprocessable("INVALID_INVITE_CODE")

    login_id = payload.login_id.strip()
    name = payload.name.strip()
    email = payload.email.strip().lower()

    # 先查重，避免建号后才冲突
    if repo.find_profile(login_id) or repo.find_profile(email):
        raise Conflict("ACCOUNT_EXISTS")

    user_id = str(uuid.uuid4())
    profile = repo.insert_profile(
        {
            "id": user_id,
            "login_id": login_id,
            "name": name,
            "email": email,
            "password_hash": hash_password(payload.password),
            "role": payload.role,
            "status": "active",
            "locale": payload.locale,
        }
    )
    if payload.role == "teacher" and not repo.consume_invite_code(code):
        # 预校验通过但消费失败（并发被抢光）—— 删掉刚建的 profile 回滚
        repo.delete_profile(user_id)
        raise Unprocessable("INVALID_INVITE_CODE")

    audit(repo, profile, "actRegister", "profile", user_id, {"role": payload.role})
    return {"id": user_id, "email": email, "role": payload.role, "profile": profile}


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, repo=Depends(get_repo)):
    """登录：按 login_id 或 email 校验密码，签发自托管 JWT。"""
    profile = repo.authenticate(payload.identifier, payload.password)
    if profile is None:
        raise Unauthorized("INVALID_CREDENTIALS")
    if profile["status"] != "active":
        raise Forbidden("ACCOUNT_DISABLED")
    return {
        "access_token": create_access_token(profile["id"], profile["role"]),
        "token_type": "bearer",
    }


@router.get("/me", response_model=ProfileOut)
def me(user: dict = Depends(get_current_user)):
    return user


@router.patch("/me/locale", response_model=ProfileOut)
def set_locale(
    payload: UpdateLocaleRequest,
    user: dict = Depends(get_current_user),
    repo=Depends(get_repo),
):
    return repo.update_profile(user["id"], {"locale": payload.locale})
