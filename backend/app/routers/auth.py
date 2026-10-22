"""账号相关：注册（服务端代确认）、当前用户、语言偏好。"""
from fastapi import APIRouter, Depends

from ..deps import get_current_user, get_repo
from ..schemas import ProfileOut, RegisterRequest, UpdateLocaleRequest
from ..services import audit
from ..errors import Unprocessable

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, repo=Depends(get_repo)):
    """学生/教师注册。

    账号统一由后端用 service_role 调 Admin API 创建（email_confirm=True），
    因此 Supabase 那边即使开着邮箱确认也不会卡住演示。
    教师必须带有效邀请码 —— 邀请码的原子校验与消费在数据库触发器里完成，
    这里只做「有没有填」的前置检查，避免无谓地建出一个必然失败的账号。
    """
    if payload.role == "teacher":
        code = (payload.invite_code or "").strip()
        if not code:
            raise Unprocessable("INVITE_CODE_REQUIRED")
        # 预校验（只读）：拿不到友好错误的场景在 Admin API 侧，这里提前判掉
        if not repo.check_invite_code(code):
            raise Unprocessable("INVALID_INVITE_CODE")

    metadata = {
        "login_id": payload.login_id.strip(),
        "name": payload.name.strip(),
        "role": payload.role,
        "locale": payload.locale,
    }
    if payload.role == "teacher":
        metadata["invite_code"] = payload.invite_code.strip()

    created = repo.create_auth_user(payload.email, payload.password, metadata)
    profile = repo.get_profile(created["id"]) if created.get("id") else None
    audit(repo, {"id": created.get("id")}, "actRegister", "profile", created.get("id") or "", {"role": payload.role})
    return {"id": created.get("id"), "email": payload.email, "role": payload.role, "profile": profile}


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
