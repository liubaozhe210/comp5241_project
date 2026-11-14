"""Reuse schema metadata within one request's Session, never across requests."""
from sqlalchemy import inspect


def schema_for(session):
    schema = inspect(session.connection())
    schema.info_cache = session.info.setdefault('learning_schema_cache', {})
    return schema


def has_learning_table(session, name):
    return name in schema_for(session).get_table_names()


def assessments_available(session):
    names = set(schema_for(session).get_table_names())
    return {'learning_path_task_sources', 'learning_path_assessments', 'learning_path_attempts'} <= names
