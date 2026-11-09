"""选课状态机与课件鉴权。"""
STUDENT = "u_s1"
STUDENT2 = "u_s2"
TEACHER = "u_t1"
ADMIN = "u_admin"


# ---------------- 选课 ----------------
def test_apply_creates_pending(login):
    res = login(STUDENT).post("/courses/c1/enrollments")
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "pending"


def test_duplicate_apply_conflicts(login):
    student = login(STUDENT)
    student.post("/courses/c1/enrollments")
    res = student.post("/courses/c1/enrollments")
    assert res.status_code == 409
    assert res.json()["code"] == "INVALID_TRANSITION"


def test_withdraw_then_reapply(login):
    student = login(STUDENT)
    student.post("/courses/c1/enrollments")
    withdrawn = student.delete("/courses/c1/enrollments/me")
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"

    again = student.post("/courses/c1/enrollments")
    assert again.status_code == 201
    assert again.json()["status"] == "pending"


def test_full_course_rejects_application(login):
    res = login(STUDENT).post("/courses/c_full/enrollments")
    assert res.status_code == 409
    assert res.json()["code"] == "ENROLLMENT_FULL"


def test_approve_flow_unlocks_materials(login):
    student = login(STUDENT)
    teacher = login(TEACHER)

    created = student.post("/courses/c1/enrollments").json()
    # 待审批时看不到课件
    assert student.get("/courses/c1/materials").status_code == 403

    approved = teacher.post(f"/courses/c1/enrollments/{created['id']}/approve")
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    # 通过后可见（列表为空但 200）
    assert student.get("/courses/c1/materials").status_code == 200


def test_student_cannot_approve(login):
    student = login(STUDENT)
    created = student.post("/courses/c1/enrollments").json()
    res = student.post(f"/courses/c1/enrollments/{created['id']}/approve")
    assert res.status_code == 403


def test_teacher_adds_student_directly(login):
    teacher = login(TEACHER)
    res = teacher.post("/courses/c1/members", json={"query": "26072063g"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "approved"
    assert body["source"] == "teacher_add"

    # 重复添加 → 409
    again = teacher.post("/courses/c1/members", json={"query": "26072063g"})
    assert again.status_code == 409
    assert again.json()["code"] == "ALREADY_MEMBER"


def test_teacher_adds_unknown_student(login):
    res = login(TEACHER).post("/courses/c1/members", json={"query": "nobody"})
    assert res.status_code == 422
    assert res.json()["code"] == "STUDENT_NOT_FOUND"


def test_remove_member(login):
    teacher = login(TEACHER)
    added = teacher.post("/courses/c1/members", json={"query": "26072063g"}).json()
    res = teacher.delete(f"/courses/c1/members/{added['id']}")
    assert res.status_code == 200
    assert res.json()["status"] == "dropped"


def test_pending_list_only_for_course_teacher(login):
    login(STUDENT).post("/courses/c1/enrollments")
    assert login(TEACHER).get("/courses/c1/enrollments?status=pending").status_code == 200
    # 别的教师看不到
    assert login("u_t2").get("/courses/c1/enrollments").status_code == 403


# ---------------- 课件 ----------------
PDF = b"%PDF-1.4\n%fake pdf body\n"


def test_upload_requires_pdf_magic_bytes(login):
    teacher = login(TEACHER)
    bad = teacher.post(
        "/courses/c1/materials",
        files={"file": ("malware.pdf", b"MZ\x90\x00 not a pdf", "application/pdf")},
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "NOT_A_PDF"


def test_upload_and_signed_url(login, repo):
    teacher = login(TEACHER)
    student = login(STUDENT)
    # 学生先通过审批
    created = student.post("/courses/c1/enrollments").json()
    teacher.post(f"/courses/c1/enrollments/{created['id']}/approve")

    up = teacher.post(
        "/courses/c1/materials",
        files={"file": ("Lecture 01.pdf", PDF, "application/pdf")},
        data={"title": "Lecture 01", "description": "intro"},
    )
    assert up.status_code == 201, up.text
    material = up.json()
    assert material["size_bytes"] == len(PDF)
    assert material["storage_path"].startswith("c1/")
    assert repo.objects[material["storage_path"]] == PDF

    # 已通过审批的学生可以拿到签名 URL
    url = student.get(f"/materials/{material['id']}/url")
    assert url.status_code == 200
    assert url.json()["url"].startswith("https://example.test/")
    assert url.json()["download_name"] == "Lecture 01.pdf"


def test_signed_url_forbidden_for_non_member(login):
    teacher = login(TEACHER)
    up = teacher.post("/courses/c1/materials", files={"file": ("a.pdf", PDF, "application/pdf")})
    material = up.json()

    res = login("u_s2").get(f"/materials/{material['id']}/url")
    assert res.status_code == 403
    assert res.json()["code"] == "NOT_COURSE_MEMBER"


def test_student_cannot_delete_material(login):
    teacher = login(TEACHER)
    material = teacher.post("/courses/c1/materials", files={"file": ("a.pdf", PDF, "application/pdf")}).json()
    assert login(STUDENT).delete(f"/materials/{material['id']}").status_code == 403


def test_teacher_deletes_material(login, repo):
    teacher = login(TEACHER)
    material = teacher.post("/courses/c1/materials", files={"file": ("a.pdf", PDF, "application/pdf")}).json()
    assert teacher.delete(f"/materials/{material['id']}").status_code == 204
    assert repo.get_material(material["id"]) is None
    assert "actDeleteMat" in [a["action"] for a in repo.audit]
