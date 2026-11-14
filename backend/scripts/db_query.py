"""查询 CourseHub 的 MySQL 数据（复用 backend/.env 的 DATABASE_URL）。

用法（在 backend/ 目录下）：
    python scripts/db_query.py                    # 打印各表行数 + 样例（隐藏密码哈希）
    python scripts/db_query.py "SELECT * FROM profiles WHERE role='admin'"
"""
import os
import sys

import pymysql
from sqlalchemy.engine import make_url

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402

TABLES = ["profiles", "courses", "enrollments", "materials", "audit_logs", "invite_codes"]

# 默认概览时隐藏的列（密码哈希等长噪音列）
_HIDDEN = {"profiles": {"password_hash"}}


def _connect():
    u = make_url(settings.database_url)
    return pymysql.connect(
        host=u.host,
        port=u.port or 3306,
        user=u.username,
        password=u.password or "",
        database=u.database,
        charset="utf8mb4",
    )


def _print_rows(cur, table, limit=20):
    hidden = _HIDDEN.get(table, set())
    cur.execute(f"SELECT * FROM `{table}` LIMIT {limit}")
    keep = [i for i, d in enumerate(cur.description) if d[0] not in hidden]
    cols = [cur.description[i][0] for i in keep]
    rows = cur.fetchall()
    print(f"\n=== {table} ===")
    print(" | ".join(cols))
    for row in rows:
        print(" | ".join(str(row[i]) for i in keep))


def _run_sql(cur, sql):
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(" | ".join(cols))
    for row in rows:
        print(" | ".join(str(v) for v in row))
    print(f"\n共 {len(rows)} 行")


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001 —— 某些终端不支持
        pass
    conn = _connect()
    try:
        with conn.cursor() as cur:
            if len(sys.argv) > 1:
                _run_sql(cur, sys.argv[1])
                return 0
            print(f"数据库：{make_url(settings.database_url).database}\n")
            for t in TABLES:
                cur.execute(f"SELECT COUNT(*) FROM `{t}`")
                print(f"{t:<14} {cur.fetchone()[0]} 行")
            for t in TABLES:
                _print_rows(cur, t)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"\nFAILED: {type(error).__name__}: {error}")
        raise SystemExit(1)
