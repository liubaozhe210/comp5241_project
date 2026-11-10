"""运行配置。敏感值来自环境变量或 backend/.env（不进 git）。

业务数据在自建 MySQL；认证改为自托管（密码哈希存 MySQL + 后端自签 JWT），
课件文件存本地磁盘。不再依赖 Supabase。
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- 业务数据库（MySQL）----
    database_url: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle: int = 1800   # 秒，需小于 MySQL 的 wait_timeout
    db_echo: bool = False

    # ---- 认证（自托管 JWT，HS256）----
    jwt_secret: str = ""          # 自签 JWT 的密钥（必填，本地部署填随机串即可）
    jwt_algorithm: str = "HS256"
    jwt_audience: str = "coursehub"
    jwt_ttl_seconds: int = 43200  # access token 有效期（12 小时）

    # ---- 课件存储（本地磁盘）----
    materials_dir: str = "data/materials"

    # 业务约束
    max_pdf_bytes: int = 20 * 1024 * 1024  # 20 MB
    signed_url_ttl: int = 60               # 课件下载签名 URL 有效期（秒）

    # 允许跨域的前端来源，逗号分隔。前端换端口或上线后必须同步修改：
    # 来源不在白名单时，浏览器预检（OPTIONS）会直接拿到 400 Disallowed CORS origin。
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,null"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
