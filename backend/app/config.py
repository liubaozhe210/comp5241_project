"""运行配置。敏感值来自环境变量或 backend/.env（不进 git）。

业务数据已从 Supabase 迁到自建 MySQL；Supabase 只剩两个职责：
  1) Auth —— 签发与校验 JWT、Admin API 建号 / 重置密码
  2) Storage —— 课件文件仍放 Supabase 私有桶
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- 业务数据库（MySQL）----
    database_url: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle: int = 1800   # 秒，需小于 MySQL 的 wait_timeout
    db_echo: bool = False

    # ---- Supabase：Auth 与 Storage ----
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""          # 若项目仍用 HS256，填这里
    supabase_jwt_audience: str = "authenticated"
    supabase_jwks_url: str = ""            # 留空则用 {url}/auth/v1/.well-known/jwks.json

    # 业务约束
    max_pdf_bytes: int = 20 * 1024 * 1024  # 20 MB
    signed_url_ttl: int = 60               # 秒
    materials_bucket: str = "materials"

    # OpenAI-compatible Chat Completions endpoint; credentials stay on the server.
    course_ai_base_url: str = ""
    course_ai_api_key: str = ""
    course_ai_model: str = ""
    course_ai_max_tokens: int = Field(default=3500, ge=1, le=65536)

    # Optional learning-path generator; never exposed through frontend variables.
    ai_generation_enabled: bool = False
    ai_chat_completions_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_timeout_seconds: int = 60

    # Interview Mastery has an isolated OpenRouter configuration and never
    # reuses the course/learning-path AI credentials or model selection.
    openrouter_api_key: str = ""
    openrouter_model: str = ""
    openrouter_ocr_model: str = "qwen/qwen3-vl-30b-a3b-instruct"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_timeout_seconds: int = 90
    openrouter_app_name: str = "CourseHub Interview Mastery"
    openrouter_site_url: str = "http://localhost:3000"

    # 允许跨域的前端来源，逗号分隔。前端换端口或上线后必须同步修改：
    # 来源不在白名单时，浏览器预检（OPTIONS）会直接拿到 400 Disallowed CORS origin。
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "http://localhost:3310,http://127.0.0.1:3310,null"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def jwks_url(self) -> str:
        return self.supabase_jwks_url or f"{self.supabase_url}/auth/v1/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
