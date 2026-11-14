-- CourseHub 业务表（MySQL 8.0.16+）
-- 与 Supabase 版本的差异：
--   * 没有行级安全（MySQL 不支持），权限全部由后端判
--   * 没有 auth.users 外键：profiles.id 仍等于 Supabase auth 用户的 uid
--   * uuid → char(36)（应用层生成）；jsonb → json；timestamptz → datetime(6)（统一存 UTC）
-- 可重复执行。

create table if not exists profiles (
  id         char(36)     not null primary key,
  login_id   varchar(32)  not null,
  name       varchar(64)  not null,
  email      varchar(255) not null,
  role       varchar(16)  not null default 'student',
  status     varchar(16)  not null default 'active',
  locale     varchar(8)   not null default 'en',
  created_at datetime(6)  not null default current_timestamp(6),
  unique key uk_profiles_login_id (login_id),
  unique key uk_profiles_email (email),
  constraint ck_profiles_role check (role in ('admin', 'teacher', 'student')),
  constraint ck_profiles_status check (status in ('active', 'disabled'))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_0900_ai_ci;

create table if not exists courses (
  id                char(36)     not null primary key,
  code              varchar(24)  not null,
  name              varchar(120) not null,
  description       text         not null,
  teacher_id        char(36)     not null,
  semester          varchar(40)  not null default '',
  status            varchar(16)  not null default 'draft',
  enrollment_policy varchar(16)  not null default 'approval',
  capacity          int          not null default 30,
  created_at        datetime(6)  not null default current_timestamp(6),
  unique key uk_courses_code (code),
  key idx_courses_teacher (teacher_id),
  key idx_courses_status (status),
  constraint fk_courses_teacher foreign key (teacher_id) references profiles (id),
  constraint ck_courses_status check (status in ('draft', 'published', 'archived')),
  constraint ck_courses_policy check (enrollment_policy in ('open', 'approval', 'closed')),
  constraint ck_courses_capacity check (capacity > 0)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_0900_ai_ci;

create table if not exists enrollments (
  id         char(36)    not null primary key,
  course_id  char(36)    not null,
  student_id char(36)    not null,
  status     varchar(16) not null default 'pending',
  source     varchar(16) not null default 'self_apply',
  applied_at datetime(6) not null default current_timestamp(6),
  decided_at datetime(6) null,
  decided_by char(36)    null,
  unique key uk_enroll_course_student (course_id, student_id),
  key idx_enroll_status (status),
  key idx_enroll_student (student_id),
  constraint fk_enroll_course foreign key (course_id) references courses (id) on delete cascade,
  constraint fk_enroll_student foreign key (student_id) references profiles (id),
  constraint ck_enroll_status check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'dropped')),
  constraint ck_enroll_source check (source in ('self_apply', 'teacher_add'))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_0900_ai_ci;

create table if not exists materials (
  id            char(36)     not null primary key,
  course_id     char(36)     not null,
  title         varchar(200) not null,
  description   varchar(500) not null default '',
  storage_path  varchar(255) not null,
  original_name varchar(200) not null,
  size_bytes    bigint       not null,
  mime          varchar(64)  not null default 'application/pdf',
  pages         int          null,
  uploader_id   char(36)     not null,
  sort_order    int          not null default 0,
  created_at    datetime(6)  not null default current_timestamp(6),
  key idx_materials_course (course_id),
  constraint fk_materials_course foreign key (course_id) references courses (id) on delete cascade,
  constraint fk_materials_uploader foreign key (uploader_id) references profiles (id),
  constraint ck_materials_size check (size_bytes > 0)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_0900_ai_ci;

create table if not exists audit_logs (
  id          bigint       not null auto_increment primary key,
  actor_id    char(36)     null,
  action      varchar(40)  not null,
  target_type varchar(32)  null,
  target_id   varchar(64)  null,
  detail      json         null,
  ip          varchar(45)  null,
  created_at  datetime(6)  not null default current_timestamp(6),
  key idx_audit_actor (actor_id),
  key idx_audit_created (created_at)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_0900_ai_ci;

create table if not exists invite_codes (
  code       varchar(32)  not null primary key,
  note       varchar(120) not null default '',
  max_uses   int          null,
  used_count int          not null default 0,
  expires_at datetime(6)  null,
  created_by char(36)     null,
  created_at datetime(6)  not null default current_timestamp(6),
  constraint ck_invite_used check (used_count >= 0)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_0900_ai_ci;
