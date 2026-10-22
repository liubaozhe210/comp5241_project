"""选课：申请/撤回/我的课程、教师审批与成员管理。"""
from fastapi import APIRouter, Depends

from ..deps import get_current_user, get_repo, require_roles
from ..errors import NotFound, Unprocessable
from ..schemas import AddStudentRequest, EnrollmentOut
from ..services import (
    add_student_directly,
    apply_for_course,
    audit,
    decide,
    remove_member,
    require_course_teacher,
    withdraw,
)

router = APIRouter(tags=["enrollments"])


def _course(repo, course_id: str) -> dict:
    course = repo.get_course(course_id)
    if not course:
        raise NotFound("COURSE_NOT_FOUND")
    return course


def _decorate(repo, rows: list[dict]) -> list[dict]:
    out = []
    for row in rows:
        item = dict(row)
        student = repo.get_profile(row["student_id"])
        if student:
            item["student_name"] = student.get("name")
            item["student_login_id"] = student.get("login_id")
        out.append(item)
    return out


# ---------------- 学生 ----------------
@router.post("/courses/{course_id}/enrollments", status_code=201, response_model=EnrollmentOut)
def apply(course_id: str, user: dict = Depends(require_roles("student")), repo=Depends(get_repo)):
    course = _course(repo, course_id)
    enrollment = apply_for_course(repo, user, course)
    audit(repo, user, "actApply", "course", course_id, {"status": enrollment["status"]})
    return enrollment


@router.delete("/courses/{course_id}/enrollments/me", response_model=EnrollmentOut)
def withdraw_mine(course_id: str, user: dict = Depends(require_roles("student")), repo=Depends(get_repo)):
    _course(repo, course_id)
    enrollment = withdraw(repo, user, course_id)
    audit(repo, user, "actWithdraw", "course", course_id)
    return enrollment


@router.get("/me/enrollments", response_model=list[EnrollmentOut])
def my_enrollments(user: dict = Depends(require_roles("student")), repo=Depends(get_repo)):
    return repo.list_enrollments(student_id=user["id"])


# ---------------- 教师 / 管理员 ----------------
@router.get("/courses/{course_id}/enrollments", response_model=list[EnrollmentOut])
def list_enrollments(
    course_id: str,
    status: str | None = None,
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    course = _course(repo, course_id)
    require_course_teacher(user, course)
    return _decorate(repo, repo.list_enrollments(course_id=course_id, status=status))


@router.post("/courses/{course_id}/enrollments/{enrollment_id}/approve", response_model=EnrollmentOut)
def approve(
    course_id: str,
    enrollment_id: str,
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    return _decide(repo, user, course_id, enrollment_id, approve=True)


@router.post("/courses/{course_id}/enrollments/{enrollment_id}/reject", response_model=EnrollmentOut)
def reject(
    course_id: str,
    enrollment_id: str,
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    return _decide(repo, user, course_id, enrollment_id, approve=False)


def _decide(repo, user: dict, course_id: str, enrollment_id: str, approve: bool) -> dict:
    _course(repo, course_id)
    enrollment = repo.get_enrollment_by_id(enrollment_id)
    if not enrollment or enrollment["course_id"] != course_id:
        raise NotFound("ENROLLMENT_NOT_FOUND")
    result = decide(repo, user, enrollment, approve)
    audit(repo, user, "actApprove" if approve else "actReject", "enrollment", enrollment_id)
    return result


@router.post("/courses/{course_id}/members", status_code=201, response_model=EnrollmentOut)
def add_member(
    course_id: str,
    payload: AddStudentRequest,
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    course = _course(repo, course_id)
    student = repo.find_profile(payload.query.strip())
    if not student or student.get("role") != "student":
        raise Unprocessable("STUDENT_NOT_FOUND", {"query": payload.query})
    enrollment = add_student_directly(repo, user, course, student)
    audit(repo, user, "actAddMember", "course", course_id, {"student": student["login_id"]})
    return enrollment


@router.delete("/courses/{course_id}/members/{enrollment_id}", response_model=EnrollmentOut)
def remove_member_endpoint(
    course_id: str,
    enrollment_id: str,
    user: dict = Depends(require_roles("teacher", "admin")),
    repo=Depends(get_repo),
):
    course = _course(repo, course_id)
    enrollment = repo.get_enrollment_by_id(enrollment_id)
    if not enrollment:
        raise NotFound("ENROLLMENT_NOT_FOUND")
    result = remove_member(repo, user, course, enrollment)
    audit(repo, user, "actRemoveMember", "course", course_id, {"enrollment": enrollment_id})
    return result
