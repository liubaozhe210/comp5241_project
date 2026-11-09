"""课程：建课、发布、目录级与详情级两层可见性、越权修改。"""
STUDENT = "u_s1"
TEACHER = "u_t1"
OTHER_TEACHER = "u_t2"
ADMIN = "u_admin"


def test_student_cannot_create_course(login):
    res = login(STUDENT).post("/courses", json={"code": "C1", "name": "X"})
    assert res.status_code == 403


def test_teacher_creates_draft_invisible_to_students(login):
    teacher = login(TEACHER)
    created = teacher.post(
        "/courses",
        json={"code": "COMP6001", "name": "New Course", "capacity": 10, "enrollment_policy": "approval"},
    )
    assert created.status_code == 201, created.text
    course = created.json()
    assert course["status"] == "draft"

    # 学生目录里看不到草稿
    catalog = login(STUDENT).get("/courses").json()
    assert all(c["code"] != "COMP6001" for c in catalog)

    # 直接访问草稿详情：学生 404、管理员可见
    assert login(STUDENT).get(f"/courses/{course['id']}").status_code == 404
    assert login(ADMIN).get(f"/courses/{course['id']}").status_code == 200


def test_publish_makes_course_visible(login):
    teacher = login(TEACHER)
    created = teacher.post("/courses", json={"code": "COMP6002", "name": "Publish Me", "capacity": 5}).json()
    assert teacher.patch(f"/courses/{created['id']}", json={"status": "published"}).status_code == 200

    catalog = login(STUDENT).get("/courses").json()
    assert any(c["code"] == "COMP6002" for c in catalog)


def test_other_teacher_cannot_edit_course(login):
    res = login(OTHER_TEACHER).patch("/courses/c1", json={"name": "Hijacked"})
    assert res.status_code == 403
    assert res.json()["code"] == "NOT_COURSE_TEACHER"


def test_teacher_sees_only_own_courses_in_mine(login):
    mine = login(TEACHER).get("/courses/mine").json()
    assert all(c["teacher_id"] == TEACHER for c in mine)
    assert any(c["id"] == "c1" for c in mine)


def test_course_detail_hides_members_from_non_member_teacher(login):
    # u_t2 既不是 c1 的任课教师也不是管理员，也没有选课记录
    res = login(OTHER_TEACHER).get("/courses/c1")
    assert res.status_code == 403


def test_approved_count_is_exposed(login):
    detail = login(STUDENT).get("/courses/c_full").json()
    assert detail["approved_count"] == 1
    assert detail["capacity"] == 1
