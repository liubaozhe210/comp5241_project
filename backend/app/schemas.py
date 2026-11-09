"""请求/响应模型。字段命名与数据库列保持一致（snake_case），前端负责展示层命名。"""
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

Role = Literal["student", "teacher", "admin"]
CourseStatus = Literal["draft", "published", "archived"]
EnrollPolicy = Literal["open", "approval", "closed"]
EnrollStatus = Literal["pending", "approved", "rejected", "withdrawn", "dropped"]


# ---------------- 账号 ----------------
class RegisterRequest(BaseModel):
    login_id: str = Field(min_length=3, max_length=32)
    name: str = Field(min_length=1, max_length=64)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: Literal["student", "teacher"] = "student"
    invite_code: Optional[str] = None
    locale: Literal["en", "zh"] = "en"


class ProfileOut(BaseModel):
    id: str
    login_id: str
    name: str
    email: str
    role: Role
    status: Literal["active", "disabled"]
    locale: str


class UpdateLocaleRequest(BaseModel):
    locale: Literal["en", "zh"]


# ---------------- 课程 ----------------
class CourseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=24)
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    semester: str = ""
    capacity: int = Field(default=30, ge=1, le=1000)
    enrollment_policy: EnrollPolicy = "approval"


class CourseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = None
    semester: Optional[str] = None
    capacity: Optional[int] = Field(default=None, ge=1, le=1000)
    enrollment_policy: Optional[EnrollPolicy] = None
    status: Optional[CourseStatus] = None


class CourseOut(BaseModel):
    id: str
    code: str
    name: str
    description: str
    teacher_id: str
    teacher_name: Optional[str] = None
    semester: str
    status: CourseStatus
    enrollment_policy: EnrollPolicy
    capacity: int
    approved_count: int = 0


# ---------------- 选课 ----------------
class EnrollmentOut(BaseModel):
    id: str
    course_id: str
    student_id: str
    student_name: Optional[str] = None
    student_login_id: Optional[str] = None
    status: EnrollStatus
    source: Literal["self_apply", "teacher_add"]
    applied_at: Optional[str] = None
    decided_at: Optional[str] = None


class AddStudentRequest(BaseModel):
    """按学号或邮箱添加学生"""
    query: str = Field(min_length=1, max_length=120)


# ---------------- 课件 ----------------
class MaterialOut(BaseModel):
    id: str
    course_id: str
    title: str
    description: str
    original_name: str
    size_bytes: int
    pages: Optional[int] = None
    storage_path: str
    created_at: Optional[str] = None


class SignedUrlOut(BaseModel):
    url: str
    expires_in: int
    download_name: str


# ---------------- 管理端 ----------------
class UserAdminOut(ProfileOut):
    created_at: Optional[str] = None


class ChangeRoleRequest(BaseModel):
    role: Role
