-- Review and execute separately. Only changes our assessment table's indexes.
-- Run once after 003. Keeps all existing questions, attempts and foreign keys.
-- The replacement index must exist before removing the FK-supporting unique index.
alter table learning_path_assessments
  add index ix_learning_path_assessments_anchor_task_id (anchor_task_id),
  drop index uk_lp_assessment_anchor;
