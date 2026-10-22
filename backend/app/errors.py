"""统一错误模型。

设计文档 7.3：后端只返回稳定的错误码，不拼面向用户的句子；文案由前端按语言映射。
响应体形状：{"code": "ENROLLMENT_FULL", "message": "...", "detail": {...}}
"""
from typing import Any


class AppError(Exception):
    """用法：`raise Conflict("ENROLLMENT_FULL", {"capacity": 30})`。

    第一个位置参数是**错误码**（前端按码映射文案），第二个是 detail；
    没有传码时回退到类上的默认码。
    """

    status_code: int = 400
    code: str = "BAD_REQUEST"

    def __init__(self, code: str = "", detail: dict[str, Any] | None = None, message: str | None = None):
        self.code = code or type(self).code
        self.detail = detail or {}
        self.message = message or self.code
        super().__init__(self.message)

    def to_body(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "detail": self.detail}


class Unauthorized(AppError):
    status_code = 401
    code = "UNAUTHORIZED"


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"


class Unprocessable(AppError):
    status_code = 422
    code = "VALIDATION_FAILED"
