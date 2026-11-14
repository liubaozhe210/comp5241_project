from io import BytesIO

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app import material_reading as reading
from app.errors import Unprocessable


def pdf_bytes(text="Requirements analysis", blank=False, encrypted=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=400, height=400)
    if not blank:
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                                 NameObject('/Subtype'): NameObject('/Type1'),
                                 NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        stream = DecodedStreamObject()
        stream.set_data(f'BT /F1 12 Tf 20 300 Td ({text}) Tj ET'.encode())
        page[NameObject('/Contents')] = stream
    writer.add_blank_page(width=400, height=400)
    if encrypted:
        writer.encrypt("test-password")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


@pytest.fixture(autouse=True)
def clean_cache():
    reading._cache.clear()
    yield
    reading._cache.clear()


@pytest.fixture
def material(repo, monkeypatch):
    data = pdf_bytes()
    repo.materials['m_read'] = {'id': 'm_read', 'course_id': 'c1', 'title': 'Requirements',
                               'storage_path': 'c1/read.pdf', 'size_bytes': len(data)}
    repo.objects['c1/read.pdf'] = data
    monkeypatch.setattr(repo, 'download_object', lambda path: repo.objects[path], raising=False)
    return repo.materials['m_read']


def test_extract_real_pdf_preserves_pages_and_cache_is_independent():
    data = pdf_bytes()
    result = reading.extract_pdf(data)
    assert result['status'] == 'ready' and result['page_count'] == 2
    assert result['pages'][0]['number'] == 1
    assert 'Requirements analysis' in result['pages'][0]['text']
    assert result['pages'][1]['text'] == ''
    result['pages'][0]['text'] = 'tampered'
    assert 'Requirements analysis' in reading.extract_pdf(data)['pages'][0]['text']


def test_blank_encrypted_invalid_and_limits(monkeypatch):
    assert reading.extract_pdf(pdf_bytes(blank=True))['status'] == 'no_text'
    for data, code in [(pdf_bytes(encrypted=True), 'PDF_ENCRYPTED'),
                       (b'%PDF-1.7\nbroken', 'PDF_INVALID'), (b'not pdf', 'NOT_A_PDF')]:
        with pytest.raises(Unprocessable) as error:
            reading.extract_pdf(data)
        assert error.value.code == code
    monkeypatch.setattr(reading, 'MAX_PAGES', 1)
    with pytest.raises(Unprocessable) as error:
        reading.extract_pdf(pdf_bytes('Too many pages'))
    assert error.value.code == 'PDF_EXTRACTION_LIMIT'


def test_text_truncation_and_bounded_cache(monkeypatch):
    monkeypatch.setattr(reading, 'MAX_TOTAL_CHARS', 5)
    monkeypatch.setattr(reading, 'CACHE_ENTRIES', 2)
    for text in ['First text', 'Second text', 'Third text']:
        result = reading.extract_pdf(pdf_bytes(text))
        assert result['status'] == 'partial'
        assert sum(len(page['text']) for page in result['pages']) <= 5
        assert result['pages'][0]['truncated'] is True
    assert len(reading._cache) == 2


@pytest.mark.parametrize('user', ['u_t1', 'u_admin'])
def test_owner_teacher_and_admin_read(material, login, user):
    response = login(user).get('/materials/m_read/text')
    assert response.status_code == 200
    assert response.headers['cache-control'] == 'private, no-store'
    assert response.json()['course_id'] == 'c1'
    assert 'storage_path' not in response.json()


@pytest.mark.parametrize('status', [None, 'pending', 'rejected', 'withdrawn', 'dropped'])
def test_nonmembers_denied_before_storage_or_cache(material, repo, login, monkeypatch, status):
    reading.extract_pdf(repo.objects['c1/read.pdf'])
    if status:
        repo.enrollments['e_read'] = {'course_id': 'c1', 'student_id': 'u_s1', 'status': status}
    def forbidden_download(_):
        pytest.fail('Unauthorized request reached storage')
    monkeypatch.setattr(repo, 'download_object', forbidden_download)
    assert login('u_s1').get('/materials/m_read/text').status_code == 403
    assert login('u_t2').get('/materials/m_read/text').status_code == 403


def test_approved_student_revocation_and_file_replacement(material, repo, login):
    repo.enrollments['e_read'] = {'course_id': 'c1', 'student_id': 'u_s1', 'status': 'approved'}
    student = login('u_s1')
    first = student.get('/materials/m_read/text').json()
    repo.objects['c1/read.pdf'] = pdf_bytes('Changed content')
    changed = student.get('/materials/m_read/text').json()
    assert changed['fingerprint'] != first['fingerprint']
    assert 'Changed content' in changed['pages'][0]['text']
    repo.enrollments['e_read']['status'] = 'dropped'
    assert student.get('/materials/m_read/text').status_code == 403


def test_missing_anonymous_disabled_storage_error_and_no_mutation(material, repo, login, client, monkeypatch):
    assert client.get('/materials/m_read/text').status_code == 401
    assert login('u_t1').get('/materials/missing/text').status_code == 404
    repo.profiles['u_s1']['status'] = 'disabled'
    assert login('u_s1').get('/materials/m_read/text').status_code == 403
    def fail(_):
        raise RuntimeError('private-storage-details')
    monkeypatch.setattr(repo, 'download_object', fail)
    response = login('u_t1').get('/materials/m_read/text')
    assert response.status_code == 502
    assert response.json()['code'] == 'MATERIAL_DOWNLOAD_FAILED'
    assert 'private-storage-details' not in response.text
    assert repo.audit == [] and repo.enrollments.get('e_read') is None


def test_limits_before_download_and_actual_bytes(material, login, monkeypatch):
    monkeypatch.setattr(reading.settings, 'max_pdf_bytes', 10)
    assert login('u_t1').get('/materials/m_read/text').json()['code'] == 'FILE_TOO_LARGE'
    with pytest.raises(Unprocessable) as error:
        reading.extract_pdf(pdf_bytes())
    assert error.value.code == 'FILE_TOO_LARGE'
