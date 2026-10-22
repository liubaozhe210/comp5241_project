"""业务规则：选课状态机、课程可见性、审计写入。

状态机（设计文档 4.1）：
    未选课 --学生申请--> PENDING --教师同意--> APPROVED
                         PENDING --拒绝--> REJECTED --重新申请--> PENDING
                         PENDING --撤回--> WITHDRAWN
    未选课 --教师直接添加--> APPROVED
                         APPROVED --退课/移除--> DROPPED
非法迁移一律 409，不静默忽略。
"""
from datetime import datetime, timezone
from typing import Optional

from .errors import Conflict, Forbidden, NotFound, Unprocessable
from .repo import SupabaseRepo

# 允许的迁移
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"approved", "rejected", "withdrawn"},
    "approved": {"dropped"},
    "rejected": {"pending"},
    "withdrawn": {"pending"},
    "dropped": {"pending", "approved"},
}

VISIBLE_COURSE_STATUSES = ("published",)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def assert_transition(current: Optional[str], target: str) -> None:
    if current is None:
        return
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise Conflict(
            "INVALID_TRANSITION",
            {"from": current, "to": target, "allowed": sorted(allowed)},
        )


def course_is_full(repo: SupabaseRepo, course: dict) -> bool:
    return repo.count_approved(course["id"]) >= int(course["capacity"])


def assert_course_open(course: dict) -> None:
    if course.get("status") != "published":
        raise Conflict("COURSE_NOT_PUBLISHED", {"status": course.get("status")})
    if course.get("enrollment_policy") == "closed":
        raise Conflict("ENROLLMENT_CLOSED")


def can_view_course_detail(repo: SupabaseRepo, user: dict, course: dict) -> bool:
    """详情级可见性：任课教师 / 管理员 / 已通过审批的学生。"""
    if user["role"] == "admin" or course["teacher_id"] == user["id"]:
        return True
    enrollment = repo.get_enrollment(course["id"], user["id"])
    return bool(enrollment and enrollment["status"] == "approved")


def require_course_teacher(user: dict, course: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] != "teacher" or course["teacher_id"] != user["id"]:
        raise Forbidden("NOT_COURSE_TEACHER")


def apply_for_course(repo: SupabaseRepo, student: dict, course: dict) -> dict:
    """学生发起申请。open 策略直接通过，approval 策略进入 pending。"""
    assert_course_open(course)
    if course_is_full(repo, course):
        raise Conflict("ENROLLMENT_FULL", {"capacity": course["capacity"]})

    existing = repo.get_enrollment(course["id"], student["id"])
    auto = course["enrollment_policy"] == "open"
    target = "approved" if auto else "pending"

    if existing:
        assert_transition(existing["status"], target)
        patch = {
            "status": target,
            "source": "self_apply",
            "applied_at": now_iso(),
            "decided_at": now_iso() if auto else None,
            "decided_by": "system" if auto else None,
        }
        return repo.update_enrollment(existing["id"], patch)

    return repo.insert_enrollment(
        {
            "course_id": course["id"],
            "student_id": student["id"],
            "status": target,
            "source": "self_apply",
            "applied_at": now_iso(),
            "decided_at": now_iso() if auto else None,
        }
    )


def withdraw(repo: SupabaseRepo, student: dict, course_id: str) -> dict:
    enrollment = repo.get_enrollment(course_id, student["id"])
    if not enrollment:
        raise NotFound("ENROLLMENT_NOT_FOUND")
    assert_transition(enrollment["status"], "withdrawn")
    return repo.update_enrollment(enrollment["id"], {"status": "withdrawn", "decided_at": now_iso()})


def decide(repo: SupabaseRepo, actor: dict, enrollment: dict, approve: bool) -> dict:
    course = repo.get_course(enrollment["course_id"])
    if not course:
        raise NotFound("COURSE_NOT_FOUND")
    require_course_teacher(actor, course)
    target = "approved" if approve else "rejected"
    assert_transition(enrollment["status"], target)
    if approve and course_is_full(repo, course):
        raise Conflict("ENROLLMENT_FULL", {"capacity": course["capacity"]})
    return repo.update_enrollment(
        enrollment["id"],
        {"status": target, "decided_at": now_iso(), "decided_by": actor["id"]},
    )


def add_student_directly(repo: SupabaseRepo, actor: dict, course: dict, student: dict) -> dict:
    """教师按学号/邮箱直接加人：跳过审批，直接 approved。"""
    require_course_teacher(actor, course)
    if course_is_full(repo, course):
        raise Conflict("ENROLLMENT_FULL", {"capacity": course["capacity"]})

    existing = repo.get_enrollment(course["id"], student["id"])
    if existing:
        if existing["status"] == "approved":
            raise Conflict("ALREADY_MEMBER")
        assert_transition(existing["status"], "approved")
        return repo.update_enrollment(
            existing["id"],
            {
                "status": "approved",
                "source": "teacher_add",
                "decided_at": now_iso(),
                "decided_by": actor["id"],
            },
        )

    return repo.insert_enrollment(
        {
            "course_id": course["id"],
            "student_id": student["id"],
            "status": "approved",
            "source": "teacher_add",
            "applied_at": now_iso(),
            "decided_at": now_iso(),
            "decided_by": actor["id"],
        }
    )


def remove_member(repo: SupabaseRepo, actor: dict, course: dict, enrollment: dict) -> dict:
    require_course_teacher(actor, course)
    if enrollment["course_id"] != course["id"]:
        raise Unprocessable("ENROLLMENT_NOT_IN_COURSE")
    assert_transition(enrollment["status"], "dropped")
    return repo.update_enrollment(
        enrollment["id"], {"status": "dropped", "decided_at": now_iso(), "decided_by": actor["id"]}
    )


def audit(
    repo: SupabaseRepo,
    actor: dict,
    action: str,
    target_type: str,
    target_id: str,
    detail: Optional[dict] = None,
) -> None:
    """敏感操作统一留痕（设计文档 2.3）。"""
    repo.insert_audit(
        {
            "actor_id": actor["id"],
            "action": action,
            "target_type": target_type,
            "target_id": str(target_id),
            "detail": detail or {},
        }
    )
