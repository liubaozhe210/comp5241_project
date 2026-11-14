"""管理端：用户治理与审计日志。所有写操作强制留痕。"""
from fastapi import APIRouter, Depends

from ..deps import get_repo, require_roles
from ..errors import Unprocessable
from ..schemas import ChangeRoleRequest, UserAdminOut
from ..services import audit

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    role: str | None = None,
    q: str | None = None,
    user: dict = Depends(require_roles("admin")),
    repo=Depends(get_repo),
):
    return repo.list_profiles(role=role, q=q)


@router.post("/users/{user_id}/disable", response_model=UserAdminOut)
def disable_user(user_id: str, user: dict = Depends(require_roles("admin")), repo=Depends(get_repo)):
    if user_id == user["id"]:
        raise Unprocessable("CANNOT_DISABLE_SELF")
    updated = repo.update_profile(user_id, {"status": "disabled"})
    audit(repo, user, "actDisable", "profile", user_id)
    return updated


@router.post("/users/{user_id}/enable", response_model=UserAdminOut)
def enable_user(user_id: str, user: dict = Depends(require_roles("admin")), repo=Depends(get_repo)):
    updated = repo.update_profile(user_id, {"status": "active"})
    audit(repo, user, "actEnable", "profile", user_id)
    return updated


@router.patch("/users/{user_id}/role", response_model=UserAdminOut)
def change_role(
    user_id: str,
    payload: ChangeRoleRequest,
    user: dict = Depends(require_roles("admin")),
    repo=Depends(get_repo),
):
    if user_id == user["id"]:
        raise Unprocessable("CANNOT_CHANGE_OWN_ROLE")
    updated = repo.update_profile(user_id, {"role": payload.role})
    audit(repo, user, "actRole", "profile", user_id, {"role": payload.role})
    return updated


@router.post("/users/{user_id}/reset-password", status_code=202)
def reset_password(user_id: str, user: dict = Depends(require_roles("admin")), repo=Depends(get_repo)):
    """生成一次性随机密码并写回；返回给管理员转交（演示用，正式环境应改为邮件重置）。"""
    import secrets

    temp = secrets.token_urlsafe(9)
    repo.reset_password(user_id, temp)
    audit(repo, user, "actResetPwd", "profile", user_id)
    return {"temporary_password": temp}


@router.get("/audit")
def list_audit(
    limit: int = 100,
    user: dict = Depends(require_roles("admin")),
    repo=Depends(get_repo),
):
    return repo.list_audit(limit=max(1, min(limit, 500)))
