"""把业务数据从 Supabase 迁到 MySQL（保留原 UUID，可重复执行）。

用法（backend/ 目录下）：
    python scripts/init_mysql.py            # 先建表
    python scripts/migrate_from_supabase.py # 再搬数据

注意：
  * 只搬迁业务表；账号凭据仍在 Supabase Auth，profiles.id 就是 auth 用户 uid
  * 幂等：用 INSERT ... ON DUPLICATE KEY UPDATE，重复执行不会产生重复行
  * 迁移完成后建议在 Supabase 执行：drop trigger if exists on_auth_user_created on auth.users;
    否则新建账号时旧触发器还会往 Supabase 的 profiles 表里写一份
"""
import json
import os
import sys
from datetime import datetime, timezone

import httpx
import pymysql
from sqlalchemy.engine import make_url

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402

TABLES = [
    # (表名, 列, 主键更新列)
    (
        "profiles",
        ["id", "login_id", "name", "email", "role", "status", "locale", "created_at"],
        "id",
    ),
    (
        "courses",
        ["id", "code", "name", "description", "teacher_id", "semester",
         "status", "enrollment_policy", "capacity", "created_at"],
        "id",
    ),
    (
        "enrollments",
        ["id", "course_id", "student_id", "status", "source", "applied_at", "decided_at", "decided_by"],
        "id",
    ),
    (
        "materials",
        ["id", "course_id", "title", "description", "storage_path", "original_name",
         "size_bytes", "mime", "pages", "uploader_id", "sort_order", "created_at"],
        "id",
    ),
    (
        "audit_logs",
        ["id", "actor_id", "action", "target_type", "target_id", "detail", "ip", "created_at"],
        "id",
    ),
    (
        "invite_codes",
        ["code", "note", "max_uses", "used_count", "expires_at", "created_by", "created_at"],
        "code",
    ),
]

DATETIME_COLUMNS = {"created_at", "applied_at", "decided_at", "expires_at"}
JSON_COLUMNS = {"detail"}


def parse_dt(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    text = str(value).replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def normalize(column: str, value):
    if column in DATETIME_COLUMNS:
        return parse_dt(value)
    if column in JSON_COLUMNS:
        if value is None:
            return None
        return json.dumps(value, ensure_ascii=False)
    return value


def fetch_supabase(table: str, columns: list[str]) -> list[dict]:
    base = settings.supabase_url.rstrip("/")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }
    select = ",".join(columns)
    order = ""
    if "created_at" in columns:
        order = "&order=created_at.asc"
    elif "code" in columns:
        order = "&order=code.asc"
    resp = httpx.get(f"{base}/rest/v1/{table}?select={select}{order}", headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.json()


def main() -> int:
    if not settings.database_url:
        print("FAILED: DATABASE_URL 未配置")
        return 1
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("FAILED: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置（迁移源需要）")
        return 1

    url = make_url(settings.database_url)
    conn = pymysql.connect(
        host=url.host,
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=url.database,
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=60,
        autocommit=False,
    )

    try:
        with conn.cursor() as cur:
            # 迁移期间关闭外键检查，避免表间顺序造成失败；结束前恢复
            cur.execute("set foreign_key_checks = 0")
            for table, columns, key in TABLES:
                rows = fetch_supabase(table, columns)
                if not rows:
                    print(f"  {table:<14} 源库为空，跳过")
                    continue

                placeholders = ", ".join(["%s"] * len(columns))
                updates = ", ".join(f"`{c}` = values(`{c}`)" for c in columns if c != key)
                sql = (
                    f"insert into `{table}` ({', '.join(f'`{c}`' for c in columns)}) "
                    f"values ({placeholders}) on duplicate key update {updates}"
                )
                values = [
                    tuple(normalize(c, row.get(c)) for c in columns)
                    for row in rows
                ]
                cur.executemany(sql, values)
                conn.commit()
                print(f"  {table:<14} 写入 {len(values)} 行")

            cur.execute("set foreign_key_checks = 1")

            print("\n== 迁移后核对 ==")
            for table, _, _ in TABLES:
                cur.execute(f"select count(*) from `{table}`")
                print(f"  {table:<14} {cur.fetchone()[0]} 行")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"\nFAILED: {type(error).__name__}: {error}")
        raise SystemExit(1)
