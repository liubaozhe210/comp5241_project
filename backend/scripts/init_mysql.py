"""初始化 MySQL 结构：建库（如缺）+ 建表。可重复执行。

用法（backend/ 目录下）：
    python scripts/init_mysql.py
"""
import os
import sys
from pathlib import Path

import pymysql
from sqlalchemy.engine import make_url

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402

SCHEMA = Path(__file__).resolve().parent.parent / "db" / "schema.mysql.sql"


def main() -> int:
    if not settings.database_url:
        print("FAILED: DATABASE_URL 未配置")
        return 1

    url = make_url(settings.database_url)
    database = url.database
    if not database:
        print("FAILED: DATABASE_URL 里没有库名")
        return 1

    # 1) 连到服务器（不指定库），确保库存在
    conn = pymysql.connect(
        host=url.host,
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=30,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"create database if not exists `{database}` "
                "default character set utf8mb4 collate utf8mb4_0900_ai_ci"
            )
        conn.commit()
        print(f"  database ready: {database}")
    finally:
        conn.close()

    # 2) 逐条执行建表语句（先去掉 -- 注释行，否则首段会被整段跳过）
    raw = SCHEMA.read_text(encoding="utf-8")
    cleaned = "\n".join(line for line in raw.splitlines() if not line.strip().startswith("--"))
    statements = [s.strip() for s in cleaned.split(";") if s.strip()]
    conn = pymysql.connect(
        host=url.host,
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=database,
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=30,
    )
    created = 0
    try:
        with conn.cursor() as cur:
            for sql in statements:
                cur.execute(sql)
                created += 1
        conn.commit()
    finally:
        conn.close()

    # 2b) 旧库迁移：profiles 缺 password_hash 列时补上（幂等，可重复执行）
    conn = pymysql.connect(
        host=url.host,
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=database,
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=30,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select count(*) from information_schema.columns "
                "where table_schema = %s and table_name = 'profiles' and column_name = 'password_hash'",
                (database,),
            )
            if cur.fetchone()[0] == 0:
                cur.execute(
                    "alter table profiles add column password_hash varchar(255) not null default ''"
                )
                conn.commit()
                print("  added profiles.password_hash (migration)")
    finally:
        conn.close()

    # 3) 回读确认
    conn = pymysql.connect(
        host=url.host,
        port=url.port or 3306,
        user=url.username,
        password=url.password or "",
        database=database,
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select table_name from information_schema.tables where table_schema = %s order by table_name",
                (database,),
            )
            tables = [row[0] for row in cur.fetchall()]
    finally:
        conn.close()

    print(f"  statements executed: {created}")
    print(f"  tables: {', '.join(tables) if tables else '(none)'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        print(f"\nFAILED: {type(error).__name__}: {error}")
        raise SystemExit(1)
