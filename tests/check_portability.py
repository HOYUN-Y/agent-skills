"""임시 폴더에서 설치·최초 탐지·비밀 파일 제외·중복 설치 방지를 검증한다."""
from pathlib import Path
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='changelog test ') as tmp:
    root = Path(tmp) / 'work folder'
    root.mkdir()
    (root / 'notes.md').write_text('작업 결과')
    (root / '.env').write_text('test fixture')
    dest = Path(tmp) / 'custom skills'
    command = ['python3', str(REPO / 'install-changelog.py'), '--skills-dir', str(dest), '--target-root', str(root)]
    subprocess.run(command, check=True, capture_output=True)
    detect = dest / 'changelog-update/scripts/changed-files.sh'
    result = subprocess.check_output([str(detect)], text=True)
    assert result.splitlines() == ['notes.md'], result
    assert subprocess.run(command, capture_output=True).returncode != 0
    empty = root / 'empty.md'
    empty.touch()
    subprocess.run([str(dest / 'changelog-verify/scripts/check-detail.sh'), str(empty), str(empty), str(root)], check=True, capture_output=True)
    other = Path(tmp) / 'other root'
    other.mkdir()
    assert subprocess.check_output([str(detect), str(other)], text=True) == ''
    # 빈 작업 폴더에서는 CLI를 호출하지 않고 정상 종료해야 한다.
    subprocess.run([str(dest / 'changelog-update/scripts/cron-run.sh'), str(other)], check=True, capture_output=True)
    assert (other / 'changelog').is_dir()
    assert not (other / '.changelog-backups/.cron.lock').exists()
print('설치·경로 공백·첫 실행·비밀 파일 제외·인자 우선·검증기 실행 확인')
