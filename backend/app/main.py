"""FastAPI 应用入口。

启动：uvicorn app.main:app --reload（在 backend/ 目录下）
文档：/docs、/openapi.json
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .errors import AppError
from .routers import admin, auth, courses, enrollments

app = FastAPI(title="CourseHub API", version="0.1.0", description="COMP5241 在线教学系统后端")

# 允许的前端来源由 CORS_ORIGINS 控制（逗号分隔）；file:// 页面的 Origin 是 "null"
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
def handle_app_error(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content=exc.to_body())


app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(enrollments.router)
app.include_router(admin.router)


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "supabase_configured": bool(settings.supabase_url and settings.supabase_service_role_key),
        "jwt_mode": "hs256" if settings.supabase_jwt_secret else "jwks",
    }
