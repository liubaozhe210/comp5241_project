"""运行配置。所有敏感值来自环境变量或 backend/.env（不进 git）。"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""          # 若项目仍用 HS256，填这里
    supabase_jwt_audience: str = "authenticated"
    supabase_jwks_url: str = ""            # 留空则用 {url}/auth/v1/.well-known/jwks.json

    # 业务约束
    max_pdf_bytes: int = 20 * 1024 * 1024  # 20 MB
    signed_url_ttl: int = 60               # 秒
    materials_bucket: str = "materials"

    # 允许跨域的前端来源，逗号分隔。部署后把 Vercel 域名加进来
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,null"

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
