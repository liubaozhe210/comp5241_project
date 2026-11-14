"""账号注册、鉴权链路与管理端治理。"""
from app.deps import get_current_user  # noqa: F401  （确保依赖图被加载）

STUDENT = "u_s1"
TEACHER = "u_t1"
ADMIN = "u_admin"


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_requires_token(client):
    res = client.get("/courses")
    assert res.status_code == 401
    assert res.json()["code"] == "MISSING_TOKEN"


def test_register_student_ok(client, repo):
    res = client.post(
        "/auth/register",
        json={
            "login_id": "26072999g",
            "name": "New Student",
            "email": "26072999g@connect.polyu.hk",
            "password": "Passw0rd!",
            "role": "student",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["role"] == "student"
    assert repo.get_profile(body["id"])["login_id"] == "26072999g"


def test_register_teacher_requires_invite(client):
    res = client.post(
        "/auth/register",
        json={
            "login_id": "t9001",
            "name": "New Teacher",
            "email": "t9001@polyu.edu.hk",
            "password": "Passw0rd!",
            "role": "teacher",
        },
    )
    assert res.status_code == 422
    assert res.json()["code"] == "INVITE_CODE_REQUIRED"


def test_register_teacher_with_invite(client, repo):
    res = client.post(
        "/auth/register",
        json={
            "login_id": "t9002",
            "name": "Invited Teacher",
            "email": "t9002@polyu.edu.hk",
            "password": "Passw0rd!",
            "role": "teacher",
            "invite_code": "TEACHER2026",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["role"] == "teacher"


def test_register_teacher_with_wrong_invite(client):
    res = client.post(
        "/auth/register",
        json={
            "login_id": "t9003",
            "name": "Bad Teacher",
            "email": "t9003@polyu.edu.hk",
            "password": "Passw0rd!",
            "role": "teacher",
            "invite_code": "WRONG-CODE",
        },
    )
    assert res.status_code == 422
    assert res.json()["code"] == "INVALID_INVITE_CODE"


def test_me_returns_profile(login):
    res = login(STUDENT).get("/auth/me")
    assert res.status_code == 200
    assert res.json()["login_id"] == "26072062g"


def test_admin_can_disable_and_disabled_user_is_blocked(login, repo):
    admin = login(ADMIN)
    res = admin.post("/admin/users/u_s2/disable")
    assert res.status_code == 200
    assert res.json()["status"] == "disabled"

    # 被禁用账号的下一次请求立刻被拒（不等 token 过期）
    blocked = login("u_s2").get("/auth/me")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "ACCOUNT_DISABLED"


def test_admin_cannot_disable_self(login):
    res = login(ADMIN).post(f"/admin/users/{ADMIN}/disable")
    assert res.status_code == 422
    assert res.json()["code"] == "CANNOT_DISABLE_SELF"


def test_student_cannot_access_admin(login):
    res = login(STUDENT).get("/admin/users")
    assert res.status_code == 403
    assert res.json()["code"] == "ROLE_NOT_ALLOWED"


def test_role_change_is_audited(login, repo):
    admin = login(ADMIN)
    res = admin.patch("/admin/users/u_s2/role", json={"role": "teacher"})
    assert res.status_code == 200
    assert res.json()["role"] == "teacher"
    actions = [a["action"] for a in repo.audit]
    assert "actRole" in actions


def test_locale_update(login):
    res = login(STUDENT).patch("/auth/me/locale", json={"locale": "zh"})
    assert res.status_code == 200
    assert res.json()["locale"] == "zh"


def test_create_user_error_mapping():
    """Admin API 的报错要翻译成正确的业务码，不能都算「账号已存在」。"""
    from app.errors import Conflict, Unprocessable
    from app.repo import map_create_user_error

    invite = map_create_user_error(Exception('P0001: INVALID_INVITE_CODE'))
    assert isinstance(invite, Unprocessable)
    assert invite.code == "INVALID_INVITE_CODE"
    assert invite.status_code == 422

    dup = map_create_user_error(Exception('duplicate key value violates unique constraint "profiles_email_key"'))
    assert isinstance(dup, Conflict)
    assert dup.code == "ACCOUNT_EXISTS"
    assert dup.status_code == 409

    other = map_create_user_error(Exception("network unreachable"))
    assert other.code == "ACCOUNT_CREATE_FAILED"

    # key 被轮换 / 失效：必须是 500 的配置错误，而不是 409 的"账号已存在"
    rotated = map_create_user_error(Exception("401: Unauthorized - Invalid API key"))
    assert rotated.status_code == 500
    assert rotated.code == "SUPABASE_KEY_INVALID"
