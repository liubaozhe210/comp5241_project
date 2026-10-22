"""课程：目录、详情（两层可见性）、教师建课/改课/发布、课件上传与签名 URL。"""
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse

from ..config import settings
from ..deps import get_current_user, get_repo, require_roles
from ..errors import Forbidden, NotFound, Unprocessable
from ..schemas import CourseCreate, CourseOut, CourseUpdate, MaterialOut, SignedUrlOut
from ..services import audit, can_view_course_detail, require_course_teacher

router = APIRouter(tags=["courses"])


def _with_counts(repo, courses: list[dict]) -> list[dict]:
    out = []
    for course in courses:
        row = dict(course)
        row["approved_count"] = repo.count_approved(course["id"])
        out.append(row)
    return out


def _get_course_or_404(repo, course_id: str) -> dict:
    course = repo.get_course(course_id)
    if not course:
        raise NotFound("COURSE_NOT_FOUND")
    return course


# ---------------- 目录与详情 ----------------
@router.get("/courses", response_model=list[CourseOut])
def list_published_courses(user: dict = Depends(get_current_user), repo=Depends(get_repo)):
    """目录级：所有已发布课程的公开信息。"""
    return _with_counts(repo, repo.list_courses(status="published"))


@router.get("/courses/mine", response_model=list[CourseOut])
def list_my_courses(user: dict = Depends(require_roles("teacher", "admin")), repo=Depends(get_repo)):
    """教师自己的课程（含草稿与归档）。"""
    if user["role"] == "admin":
        return _with_counts(repo, repo.list_courses())
    return _with_counts(repo, repo.list_courses(teacher_id=user["id"]))


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(course_id: str, user: dict = Depends(get_current_user), repo=Depends(get_repo)):
    course = _get_course_or_404(repo, course_id)
    # draft / archived 不对外可见；detail 内容仅成员、任课教师、管理员
    if course["status"] != "published" and not (
        user["role"] == "admin" or course["teacher_id"] == user["id"]
    ):
        raise NotFound("COURSE_NOT_FOUND")
    if not can_view_course_detail(repo, user, course) and user["role"] != "student":
        raise Forbidden("NOT_COURSE_MEMBER")
    return {**course, "approved_count": repo.count_approved(course_id)}


# ---------------- 教师的课程管理 ----------------
@router.post("/courses", status_code=201, response_model=CourseOut)
def create_course(
    payload: CourseCreate,
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    data = payload.model_dump()
    data["teacher_id"] = user["id"]
    data["status"] = "draft"
    course = repo.create_course(data)
    audit(repo, user, "actCreateCourse", "course", course["id"], {"code": course["code"]})
    return {**course, "approved_count": 0}


@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(
    course_id: str,
    payload: CourseUpdate,
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    course = _get_course_or_404(repo, course_id)
    require_course_teacher(user, course)
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not patch:
        return {**course, "approved_count": repo.count_approved(course_id)}
    updated = repo.update_course(course_id, patch)
    audit(repo, user, "actUpdateCourse", "course", course_id, patch)
    if patch.get("status") == "archived":
        audit(repo, user, "actArchive", "course", course_id)
    return {**updated, "approved_count": repo.count_approved(course_id)}


# ---------------- 课件 ----------------
@router.get("/courses/{course_id}/materials", response_model=list[MaterialOut])
def list_materials(course_id: str, user: dict = Depends(get_current_user), repo=Depends(get_repo)):
    course = _get_course_or_404(repo, course_id)
    if not can_view_course_detail(repo, user, course):
        # 未通过审批的学生看不到课件列表（设计文档 4.2）
        raise Forbidden("NOT_COURSE_MEMBER")
    return repo.list_materials(course_id)


@router.post("/courses/{course_id}/materials", status_code=201, response_model=MaterialOut)
def upload_material(
    course_id: str,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    description: str = Form(default=""),
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    course = _get_course_or_404(repo, course_id)
    require_course_teacher(user, course)
    if course["status"] == "archived":
        raise Unprocessable("COURSE_ARCHIVED")

    data = file.file.read()
    if not data:
        raise Unprocessable("EMPTY_FILE")
    if len(data) > settings.max_pdf_bytes:
        raise Unprocessable("FILE_TOO_LARGE", {"max_bytes": settings.max_pdf_bytes})
    # 校验文件头而不是只看扩展名
    if not data.startswith(b"%PDF-"):
        raise Unprocessable("NOT_A_PDF")

    safe_name = (file.filename or "material.pdf").replace("\\", "/").split("/")[-1]
    storage_path = f"{course_id}/{uuid.uuid4().hex}.pdf"
    repo.upload_object(storage_path, data, "application/pdf")

    material = repo.insert_material(
        {
            "course_id": course_id,
            "title": (title or safe_name.rsplit(".", 1)[0])[:120],
            "description": description[:500],
            "storage_path": storage_path,
            "original_name": safe_name[:200],
            "size_bytes": len(data),
            "mime": "application/pdf",
            "uploader_id": user["id"],
        }
    )
    audit(repo, user, "actUpload", "material", material["id"], {"name": safe_name, "size": len(data)})
    return material


@router.get("/materials/{material_id}/url", response_model=SignedUrlOut)
def material_url(material_id: str, user: dict = Depends(get_current_user), repo=Depends(get_repo)):
    """签名 URL：先鉴权再签发，未通过返回 403 且不泄露文件是否存在。"""
    material = repo.get_material(material_id)
    if not material:
        raise NotFound("MATERIAL_NOT_FOUND")
    course = _get_course_or_404(repo, material["course_id"])
    if not can_view_course_detail(repo, user, course):
        raise Forbidden("NOT_COURSE_MEMBER")
    url = repo.signed_url(material["storage_path"], settings.signed_url_ttl)
    return {
        "url": url,
        "expires_in": settings.signed_url_ttl,
        "download_name": material["original_name"],
    }


@router.delete("/materials/{material_id}", status_code=204)
def delete_material(material_id: str, user: dict = Depends(require_roles("teacher", "admin")), repo=Depends(get_repo)):
    material = repo.get_material(material_id)
    if not material:
        raise NotFound("MATERIAL_NOT_FOUND")
    course = _get_course_or_404(repo, material["course_id"])
    require_course_teacher(user, course)
    repo.delete_object(material["storage_path"])
    repo.delete_material(material_id)
    audit(repo, user, "actDeleteMat", "material", material_id, {"title": material["title"]})
    return JSONResponse(status_code=204, content=None)
