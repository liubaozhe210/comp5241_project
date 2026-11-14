-- =============================================================================
-- COMP5241 在线教学系统 — Supabase 数据库 schema（v1）
--
-- 用法：Supabase Dashboard → SQL Editor → 新建查询 → 整份粘贴 → Run
--      可重复执行（幂等：都带 if not exists / or replace / drop policy if exists）
--
-- 包含：5 张业务表 + 邀请码表 + 注册触发器 + RLS 策略 + 私有 Storage 桶
-- 对应设计文档：product-design.md 第 6 节（数据模型）与 4.4（账号生命周期）
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. profiles：账号的业务属性（auth.users 只存凭据）
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  login_id    text not null unique,
  name        text not null,
  email       text not null unique,
  role        text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  status      text not null default 'active' check (status in ('active', 'disabled')),
  locale      text not null default 'en' check (locale in ('en', 'zh')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is '用户业务资料；凭据由 Supabase Auth 管理';

-- -----------------------------------------------------------------------------
-- 2. courses
-- -----------------------------------------------------------------------------
create table if not exists public.courses (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  name               text not null,
  description        text not null default '',
  teacher_id         uuid not null references public.profiles (id) on delete restrict,
  semester           text not null default '',
  status             text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  enrollment_policy  text not null default 'approval' check (enrollment_policy in ('open', 'approval', 'closed')),
  capacity           integer not null default 30 check (capacity > 0),
  created_at         timestamptz not null default now(),
  unique (code)
);

create index if not exists courses_teacher_idx on public.courses (teacher_id);
create index if not exists courses_status_idx on public.courses (status);

-- -----------------------------------------------------------------------------
-- 3. enrollments：选课状态机（五态）
-- -----------------------------------------------------------------------------
create table if not exists public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'dropped')),
  source      text not null default 'self_apply' check (source in ('self_apply', 'teacher_add')),
  applied_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles (id) on delete set null,
  unique (course_id, student_id)
);

create index if not exists enrollments_course_status_idx on public.enrollments (course_id, status);
create index if not exists enrollments_student_idx on public.enrollments (student_id);

-- -----------------------------------------------------------------------------
-- 4. materials：PDF 课件（文件在 Storage，这里只存元信息）
-- -----------------------------------------------------------------------------
create table if not exists public.materials (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  title         text not null,
  description   text not null default '',
  storage_path  text not null,
  original_name text not null,
  size_bytes    bigint not null check (size_bytes > 0),
  mime          text not null default 'application/pdf',
  pages         integer,
  uploader_id   uuid not null references public.profiles (id) on delete restrict,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists materials_course_idx on public.materials (course_id, sort_order);

-- -----------------------------------------------------------------------------
-- 5. audit_logs：敏感操作留痕（只追加，不提供修改）
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           bigserial primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  target_type  text,
  target_id    text,
  detail       jsonb not null default '{}'::jsonb,
  ip           inet,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);

-- -----------------------------------------------------------------------------
-- 6. invite_codes：教师邀请码（注册时由触发器校验并消费）
-- -----------------------------------------------------------------------------
create table if not exists public.invite_codes (
  code        text primary key,
  note        text not null default '',
  max_uses    integer check (max_uses is null or max_uses > 0),
  used_count  integer not null default 0,
  expires_at  timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 演示用固定邀请码（与原型一致）
insert into public.invite_codes (code, note, max_uses)
values ('TEACHER2026', 'demo teacher invite', 50)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 7. 权限判定辅助函数（security definer，避免 RLS 递归）
-- -----------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

create or replace function public.is_course_teacher(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c
    where c.id = cid and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_course_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = cid and e.student_id = auth.uid() and e.status = 'approved'
  );
$$;

-- 取当前用户角色。必须走 security definer：若在 profiles 自己的策略里直接
-- 子查询 profiles，Postgres 会判定策略递归并直接报错。
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Storage 对象判定：同样走 security definer，避免受 courses / enrollments 自身 RLS 影响
create or replace function public.can_read_course_object(cid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c where c.id::text = cid and c.teacher_id = auth.uid()
  ) or exists (
    select 1 from public.enrollments e
    where e.course_id::text = cid and e.student_id = auth.uid() and e.status = 'approved'
  );
$$;

create or replace function public.can_write_course_object(cid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c where c.id::text = cid and c.teacher_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- 8. 邀请码消费：注册时原子校验并占用一次
-- -----------------------------------------------------------------------------
create or replace function public.consume_invite_code(input_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  target public.invite_codes%rowtype;
begin
  if input_code is null or btrim(input_code) = '' then
    return false;
  end if;

  select * into target
  from public.invite_codes
  where code = upper(btrim(input_code))
    and (expires_at is null or expires_at > now())
    and (max_uses is null or used_count < max_uses)
  for update;

  if not found then
    return false;
  end if;

  update public.invite_codes
  set used_count = used_count + 1
  where code = target.code;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. 注册触发器：auth.users 插入时自动建 profile
--    角色只允许 student / teacher；teacher 必须在 user_metadata 里带有效邀请码
--    （客户端传 role=admin 会被强制降级为 student）
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  want_role  text := coalesce(lower(meta ->> 'role'), 'student');
  invite     text := meta ->> 'invite_code';
  v_login    text := nullif(btrim(coalesce(meta ->> 'login_id', '')), '');
  v_name     text := nullif(btrim(coalesce(meta ->> 'name', '')), '');
begin
  if want_role not in ('student', 'teacher') then
    want_role := 'student';
  end if;

  if want_role = 'teacher' then
    if not public.consume_invite_code(invite) then
      raise exception 'INVALID_INVITE_CODE' using errcode = '22023';
    end if;
  end if;

  insert into public.profiles (id, login_id, name, email, role)
  values (
    new.id,
    coalesce(v_login, split_part(new.email, '@', 1)),
    coalesce(v_name, split_part(new.email, '@', 1)),
    lower(new.email),
    want_role
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 10. RLS：默认关闭一切直连访问，按角色与课程成员资格开放
--     （FastAPI 用 service_role 运行时会绕过 RLS；这些策略是第二道防线）
-- -----------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.courses      enable row level security;
alter table public.enrollments  enable row level security;
alter table public.materials    enable row level security;
alter table public.audit_logs   enable row level security;
alter table public.invite_codes enable row level security;

-- profiles
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- courses：目录级公开（已发布），教师看自己的，管理员全量
drop policy if exists courses_select_published on public.courses;
create policy courses_select_published on public.courses
  for select to authenticated using (status = 'published' and public.is_active_user());

drop policy if exists courses_select_own on public.courses;
create policy courses_select_own on public.courses
  for select to authenticated using (teacher_id = auth.uid());

drop policy if exists courses_admin_all on public.courses;
create policy courses_admin_all on public.courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists courses_teacher_write on public.courses;
create policy courses_teacher_write on public.courses
  for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- enrollments：学生看自己的，教师看自己课的，管理员全量
drop policy if exists enrollments_select_student on public.enrollments;
create policy enrollments_select_student on public.enrollments
  for select to authenticated using (student_id = auth.uid());

drop policy if exists enrollments_select_teacher on public.enrollments;
create policy enrollments_select_teacher on public.enrollments
  for select to authenticated using (public.is_course_teacher(course_id));

drop policy if exists enrollments_admin_all on public.enrollments;
create policy enrollments_admin_all on public.enrollments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists enrollments_teacher_write on public.enrollments;
create policy enrollments_teacher_write on public.enrollments
  for update to authenticated
  using (public.is_course_teacher(course_id)) with check (public.is_course_teacher(course_id));

-- materials：仅已通过审批的学生 + 任课教师 + 管理员
drop policy if exists materials_select_member on public.materials;
create policy materials_select_member on public.materials
  for select to authenticated
  using (public.is_course_member(course_id) or public.is_course_teacher(course_id) or public.is_admin());

drop policy if exists materials_teacher_write on public.materials;
create policy materials_teacher_write on public.materials
  for all to authenticated
  using (public.is_course_teacher(course_id) or public.is_admin())
  with check (public.is_course_teacher(course_id) or public.is_admin());

-- audit_logs：只允许管理员读；写入只由后端（service_role）完成
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using (public.is_admin());

-- invite_codes：只允许管理员看
drop policy if exists invite_codes_admin_read on public.invite_codes;
create policy invite_codes_admin_read on public.invite_codes
  for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 11. Storage：私有桶 materials（路径约定 materials/{course_id}/{uuid}.pdf）
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materials', 'materials', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 20971520,
      allowed_mime_types = array['application/pdf'];

drop policy if exists materials_obj_read on storage.objects;
create policy materials_obj_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'materials'
    and (public.is_admin() or public.can_read_course_object((storage.foldername(name))[1]))
  );

drop policy if exists materials_obj_write on storage.objects;
create policy materials_obj_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'materials'
    and (public.is_admin() or public.can_write_course_object((storage.foldername(name))[1]))
  );

drop policy if exists materials_obj_delete on storage.objects;
create policy materials_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'materials'
    and (public.is_admin() or public.can_write_course_object((storage.foldername(name))[1]))
  );

-- -----------------------------------------------------------------------------
-- 12. 自检：跑完后应返回 6 行 true
-- -----------------------------------------------------------------------------
select
  to_regclass('public.profiles')     is not null as profiles_ok,
  to_regclass('public.courses')      is not null as courses_ok,
  to_regclass('public.enrollments')  is not null as enrollments_ok,
  to_regclass('public.materials')    is not null as materials_ok,
  to_regclass('public.audit_logs')   is not null as audit_ok,
  exists (select 1 from storage.buckets where id = 'materials') as bucket_ok;
