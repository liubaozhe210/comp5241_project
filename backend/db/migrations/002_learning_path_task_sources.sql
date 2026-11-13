-- Additive only. Execute separately after review; never run at app startup.
-- ON DELETE SET NULL preserves the existing ability to delete course materials.
create table if not exists learning_path_task_sources (
  task_id varchar(36) not null primary key,
  material_id char(36) null,
  fingerprint varchar(64) not null,
  page_start int not null,
  page_end int not null,
  foreign key (task_id) references learning_path_tasks(id) on delete cascade,
  foreign key (material_id) references materials(id) on delete set null,
  check (page_start >= 1),
  check (page_end >= page_start)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci;
