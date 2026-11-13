-- Additive only. Review and execute separately, never at application startup.
create table if not exists learning_path_adjustments (
  id varchar(36) not null primary key,
  attempt_id varchar(36) not null,
  kind varchar(16) not null,
  preview json not null,
  applied_at datetime(6) null,
  created_at datetime(6) not null,
  unique key uk_lp_adjustment_attempt (attempt_id),
  foreign key (attempt_id) references learning_path_attempts(id) on delete cascade,
  check (kind in ('review', 'practice', 'challenge', 'continue'))
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;
