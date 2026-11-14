"""Authorized PDF reading; no AI calls, database writes or learning completion."""
from collections import OrderedDict
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
from threading import Lock

from fastapi import APIRouter, Depends, Response

from .config import settings
from .deps import get_current_user, get_repo
from .errors import AppError, Forbidden, NotFound, Unprocessable
from .services import can_view_course_detail

router = APIRouter(tags=["material-reading"])
MAX_PAGES = 200
MAX_PAGE_CHARS = 20000
MAX_TOTAL_CHARS = 300000
MAX_STREAM_BYTES = 5 * 1024 * 1024
CACHE_ENTRIES = 8
_cache: OrderedDict[str, dict] = OrderedDict()
_cache_lock = Lock()


class MaterialUnavailable(AppError):
    status_code = 502


class ExtractionUnavailable(AppError):
    status_code = 503


def extract_pdf(data: bytes) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ExtractionUnavailable("PDF_DEPENDENCY_MISSING") from exc
    if len(data) > settings.max_pdf_bytes:
        raise Unprocessable("FILE_TOO_LARGE")
    if not data.startswith(b"%PDF-"):
        raise Unprocessable("NOT_A_PDF")
    fingerprint = sha256(data).hexdigest()
    with _cache_lock:
        if fingerprint in _cache:
            _cache.move_to_end(fingerprint)
            return deepcopy(_cache[fingerprint])
    try:
        reader = PdfReader(BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise Unprocessable("PDF_ENCRYPTED")
        if len(reader.pages) > MAX_PAGES:
            raise Unprocessable("PDF_EXTRACTION_LIMIT")
        pages, used, truncated = [], 0, False
        for number, page in enumerate(reader.pages, 1):
            # Check decoded streams before text interpretation; this is not a process memory limit.
            contents = page.get_contents()
            if contents is not None and len(contents.get_data()) > MAX_STREAM_BYTES:
                raise Unprocessable("PDF_EXTRACTION_LIMIT")
            text = (page.extract_text() or "").strip().replace("\x00", "")
            limit = min(MAX_PAGE_CHARS, MAX_TOTAL_CHARS - used)
            shortened = len(text) > limit
            truncated = truncated or shortened
            text = text[:limit]
            used += len(text)
            pages.append({"number": number, "text": text, "truncated": shortened})
        result = {"fingerprint": fingerprint, "page_count": len(pages), "pages": pages,
                  "status": "partial" if truncated else "ready" if used else "no_text"}
    except AppError:
        raise
    except Exception as exc:
        raise Unprocessable("PDF_INVALID") from exc
    with _cache_lock:
        _cache[fingerprint] = result
        _cache.move_to_end(fingerprint)
        while len(_cache) > CACHE_ENTRIES:
            _cache.popitem(last=False)
    return deepcopy(result)


@router.get("/materials/{material_id}/text")
def read_material(material_id: str, response: Response,
                  user=Depends(get_current_user), repo=Depends(get_repo)):
    material = repo.get_material(material_id)
    if material is None:
        raise NotFound("MATERIAL_NOT_FOUND")
    course = repo.get_course(material["course_id"])
    if course is None:
        raise NotFound("COURSE_NOT_FOUND")
    # Always authorize before touching storage or the extraction cache.
    if not can_view_course_detail(repo, user, course):
        raise Forbidden("NOT_COURSE_MEMBER")
    if material["size_bytes"] > settings.max_pdf_bytes:
        raise Unprocessable("FILE_TOO_LARGE")
    try:
        data = repo.download_object(material["storage_path"])
    except Exception as exc:
        raise MaterialUnavailable("MATERIAL_DOWNLOAD_FAILED") from exc
    result = extract_pdf(data)
    response.headers["Cache-Control"] = "private, no-store"
    return {"material_id": material_id, "course_id": course["id"],
            "title": material["title"], **result}
