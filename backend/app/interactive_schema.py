"""Validated authoring contract, shared by AI output and teacher edits."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Short = Annotated[str, Field(min_length=1, max_length=300)]
Body = Annotated[str, Field(min_length=1, max_length=12000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Quiz(StrictModel):
    question: Short
    options: Annotated[list[Short], Field(min_length=2, max_length=6)]
    answer: Annotated[int, Field(strict=True, ge=0, le=5)]
    explanation: Body

    @model_validator(mode="after")
    def check_answer(self):
        if self.answer >= len(self.options) or len(set(self.options)) != len(self.options):
            raise ValueError("Invalid answer or duplicate options")
        return self


class Criterion(StrictModel):
    label: Short
    keywords: Annotated[list[Short], Field(min_length=1, max_length=10)]


class Scenario(StrictModel):
    prompt: Body
    example_answer: Body
    rubric: Annotated[list[Criterion], Field(min_length=1, max_length=8)]


class Lesson(StrictModel):
    title: Short
    explanation: Body
    example: Body
    source_pages: Annotated[list[Annotated[int, Field(strict=True, ge=1)]], Field(min_length=1, max_length=100)]
    quiz: Quiz | None = None


class Content(StrictModel):
    title: Short
    language: Literal["en", "zh"]
    level: Literal["beginner", "intermediate"]
    objectives: Annotated[list[Short], Field(min_length=1, max_length=8)]
    lessons: Annotated[list[Lesson], Field(min_length=1, max_length=8)]
    scenario: Scenario | None = None

    @model_validator(mode="after")
    def activities(self):
        if not self.scenario and not any(lesson.quiz for lesson in self.lessons):
            raise ValueError("At least one interactive activity is required")
        return self


class SaveDraft(StrictModel):
    version: int = Field(ge=1)
    content: Content


class Publish(StrictModel):
    version: int = Field(ge=1)


class Activity(StrictModel):
    revision: int = Field(ge=1)
    kind: Literal["quiz", "scenario", "complete"]
    lesson: int = Field(default=0, ge=0, le=7)
    answer: int = Field(default=0, ge=0, le=5, strict=True)
    response: str = Field(default="", max_length=10000)


def validate_sources(content: Content, pages: list[dict]):
    available = {page["page"] for page in pages if page["text"].strip()}
    if any(not set(lesson.source_pages) <= available for lesson in content.lessons):
        from .errors import Unprocessable
        raise Unprocessable("INVALID_SOURCE_PAGES")


def learner_content(content: dict) -> dict:
    from copy import deepcopy
    result = deepcopy(content)
    for lesson in result["lessons"]:
        if lesson.get("quiz"):
            lesson["quiz"].pop("answer", None)
            lesson["quiz"].pop("explanation", None)
    if result.get("scenario"):
        result["scenario"].pop("example_answer", None)
        for item in result["scenario"]["rubric"]:
            item.pop("keywords", None)
    return result
