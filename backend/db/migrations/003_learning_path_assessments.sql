-- Additive only. Review and execute separately, not during app startup.
create table if not exists learning_path_assessments (
  id varchar(36) not null primary key,
  anchor_task_id varchar(36) not null,
  locale varchar(8) not null,
  questions json not null,
  sources json not null,
  created_at datetime(6) not null,
  unique key uk_lp_assessment_anchor (anchor_task_id),
  foreign key (anchor_task_id) references learning_path_tasks(id) on delete cascade,
  check (locale in ('zh', 'en'))
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;

create table if not exists learning_path_attempts (
  id varchar(36) not null primary key,
  assessment_id varchar(36) not null,
  request_id varchar(36) not null,
  answers json not null,
  score int not null,
  created_at datetime(6) not null,
  unique key uk_lp_attempt_request (assessment_id, request_id),
  foreign key (assessment_id) references learning_path_assessments(id) on delete cascade,
  check (score between 0 and 5)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;
