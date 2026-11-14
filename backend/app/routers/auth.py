"""账号相关：注册（服务端代确认）、当前用户、语言偏好。

数据库迁到 MySQL 后，账号创建变成**两阶段**：
  ① Supabase Auth 建账号（拿到 uid）
  ② MySQL 写 profiles（uid 与 auth 用户一一对应）
任一步失败都要补偿，避免出现"能登录但没有 profile"或"有 profile 但登录不了"。
"""
from fastapi import APIRouter, Depends

from ..deps import get_current_user, get_repo
from ..errors import Conflict, Unprocessable
from ..schemas import ProfileOut, RegisterRequest, UpdateLocaleRequest
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, repo=Depends(get_repo)):
    """学生 / 教师注册。

    账号由后端用 service_role 调 Admin API 创建（email_confirm=True），
    Supabase 即使开着邮箱确认也不会卡住注册。
    教师必须带有效邀请码：先在 MySQL 里只读预校验，建号成功后再**原子消费**一次。
    """
    code = (payload.invite_code or "").strip().upper()
    if payload.role == "teacher":
        if not code:
            raise Unprocessable("INVITE_CODE_REQUIRED")
        if not repo.check_invite_code(code):
            raise Unprocessable("INVALID_INVITE_CODE")

    login_id = payload.login_id.strip()
    name = payload.name.strip()
    email = payload.email.strip().lower()

    # 先查重，避免白建一个 Auth 账号
    if repo.find_profile(login_id) or repo.find_profile(email):
        raise Conflict("ACCOUNT_EXISTS")

    metadata = {
        "login_id": login_id,
        "name": name,
        "role": payload.role,
        "locale": payload.locale,
    }
    if payload.role == "teacher":
        # 兼容旧 Supabase 触发器：它仍会读这个字段。触发器删掉后该字段被忽略。
        metadata["invite_code"] = code

    created = repo.create_auth_user(email, payload.password, metadata)
    user_id = created.get("id")
    if not user_id:
        raise Conflict("ACCOUNT_CREATE_FAILED")

    try:
        profile = repo.insert_profile(
            {
                "id": user_id,
                "login_id": login_id,
                "name": name,
                "email": email,
                "role": payload.role,
                "status": "active",
                "locale": payload.locale,
            }
        )
        if payload.role == "teacher" and not repo.consume_invite_code(code):
            # 预校验通过但消费失败（并发被抢光）—— 整体回滚
            raise Unprocessable("INVALID_INVITE_CODE")
    except Exception:
        repo.delete_profile(user_id)
        repo.delete_auth_user(user_id)
        raise

    audit(repo, profile, "actRegister", "profile", user_id, {"role": payload.role})
    return {"id": user_id, "email": email, "role": payload.role, "profile": profile}


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
