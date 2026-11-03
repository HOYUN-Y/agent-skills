#!/usr/bin/env python3
"""두 스킬을 지정한 폴더에 설치한다. 기존 설치본은 덮어쓰지 않는다."""
import argparse
from pathlib import Path
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skills-dir', type=Path, required=True, help='에이전트의 스킬 설치 폴더')
    parser.add_argument('--target-root', type=Path, help='기록할 작업 폴더 (출력: 해당 폴더/changelog)')
    args = parser.parse_args()
    target = args.target_root.expanduser().resolve() if args.target_root else None
    if target and (not target.is_dir() or '\n' in str(target) or '\r' in str(target)):
        parser.error('--target-root는 줄바꿈 없는 기존 디렉터리여야 합니다.')
    destination = args.skills_dir.expanduser().resolve()
    source = Path(__file__).resolve().parent / 'skills'
    names = ('changelog-update', 'changelog-verify')
    for name in names:
        if (destination / name).exists() or (destination / name).is_symlink():
            parser.error(f'기존 설치본을 보존합니다. 다른 설치 위치를 지정하세요: {destination / name}')
    # 스킬 폴더 내부에 설치해 재귀 복사되는 경우를 막는다.
    if destination == source or source in destination.parents:
        parser.error('저장소의 skills 폴더 내부에는 설치할 수 없습니다.')
    destination.mkdir(parents=True, exist_ok=True)
    for name in names:
        shutil.copytree(source / name, destination / name)
        for script in (destination / name / 'scripts').glob('*.sh'):
            script.chmod(script.stat().st_mode | 0o111)
    if target:
        (destination / names[0] / 'target-root.txt').write_text(str(target) + '\n')
    print(f'설치 완료: {destination}')
    print(f'작업 폴더: {target}' if target else '첫 실행에서 작업 폴더를 지정하세요.')


if __name__ == '__main__':
    main()
