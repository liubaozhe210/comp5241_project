-- Additive migration. Review and execute against the agreed database separately.
-- Does not modify existing CourseHub tables. Requires MySQL 8.0.16+.
create table if not exists learning_paths (
  id varchar(36) primary key,
  student_id char(36) not null,
  current_version_id varchar(36) not null,
  created_at datetime(6) not null,
  index idx_lp_student (student_id),
  foreign key (student_id) references profiles(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;

create table if not exists learning_path_versions (
  id varchar(36) primary key,
  path_id varchar(36) not null,
  number int not null,
  topic varchar(120) not null,
  goal text not null,
  level varchar(16) not null,
  budget_minutes int not null,
  course_id char(36) null,
  status varchar(16) not null default 'draft',
  created_at datetime(6) not null,
  unique key uk_lp_version (path_id, number),
  foreign key (path_id) references learning_paths(id),
  foreign key (course_id) references courses(id),
  check (number > 0),
  check (budget_minutes between 60 and 12000 and mod(budget_minutes, 30) = 0),
  check (level in ('beginner', 'intermediate', 'advanced')),
  check (status in ('draft', 'generating', 'ready', 'failed'))
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;

create table if not exists learning_path_tasks (
  id varchar(36) primary key,
  version_id varchar(36) not null,
  position int not null,
  stage varchar(120) not null,
  title varchar(200) not null,
  instructions text not null,
  minutes int not null,
  done boolean not null default false,
  completed_at datetime(6) null,
  unique key uk_lp_task_position (version_id, position),
  foreign key (version_id) references learning_path_versions(id),
  check (minutes > 0),
  check (position >= 0)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;
