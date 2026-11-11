"""The opt-in local lab must keep its database and identity overrides isolated."""
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize('real_ai', ['0', '1'])
def test_local_lab_provider_switch_and_sqlite_isolation(tmp_path, real_ai):
    env = dict(os.environ, INTERACTIVE_E2E_DB=str(tmp_path / 'lab.sqlite'), INTERACTIVE_E2E_REAL_AI=real_ai)
    code = '''
import os
from app.pdf_generation import generate_content
from app.main import app
assert not app.dependency_overrides
from tests import serve_interactive_e2e as lab
assert (lab.interactive.generate_content is generate_content) == (os.environ['INTERACTIVE_E2E_REAL_AI'] == '1')
assert lab.engine.url.drivername == 'sqlite'
assert lab.repo.get_enrollment('c1', 'u_s1')['status'] == 'approved'
assert lab.repo.get_enrollment('c1', 'u_s2') is None
print('PASS')
'''
    result = subprocess.run([sys.executable, '-c', code], cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, 'Local lab isolation check failed'
    assert result.stdout.strip() == 'PASS'
