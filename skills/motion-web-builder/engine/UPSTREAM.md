# 상류(upstream) 출처와 동기화 기록

이 폴더의 `scrollcraft.js`, `scrollcraft.css`와 `../scripts/serve.mjs`, `../scripts/shoot.mjs`,
`../references/device-diag.html`은 아래 저장소에서 가져온 파일이다. MIT 라이선스이며
사본은 이 폴더의 `LICENSE`에 있다. 저작권자는 Nate Herk이다.

| 항목 | 값 |
|---|---|
| 저장소 | https://github.com/nateherkai/scroll-craft |
| 원본 경로 | `plugins/nateherk-design/skills/scroll-craft/` |
| 버전 | 0.3.1 (CHANGELOG 기준, 2026-09-30) |
| 커밋 | `75d81f74e83692add18cd7a8a8e078b8a887a579` |
| 가져온 날짜 | 2026-10-20 |

## 가져온 파일과 수정 여부

| 이 스킬의 경로 | 원본 경로 | 수정 |
|---|---|---|
| `engine/scrollcraft.js` | `engine/scrollcraft.js` | 없음 (바이트 동일) |
| `engine/scrollcraft.css` | `engine/scrollcraft.css` | 없음 (바이트 동일) |
| `scripts/serve.mjs` | `scripts/serve.mjs` | 없음 (바이트 동일) |
| `scripts/shoot.mjs` | `scripts/shoot.mjs` | 없음 (바이트 동일) |
| `references/device-diag.html` | `references/device-diag.html` | 없음 (바이트 동일) |
| `references/scroll-template.html` | `references/template.html` | 주석·예시 문구를 한국어로 다시 쓰고 `lang`을 `ko`, 서체 토큰을 `system-ui`로 바꿈. 2번 act의 마지막 cue를 원본 `"0.82"`(중간 act의 유지)에서 `"0.82 1"`로 고쳐 "마지막 act만 유지" 규칙과 맞춤. 마크업 구조는 유지 |
| `references/scroll-engine.md` | `references/devices.md`, `references/verify.md`, `SKILL.md` 일부 | 기계적 계약과 검증 절차만 발췌해 한국어로 재작성 |

원본 파일은 수정하지 않고 그대로 두는 것을 원칙으로 한다. 상류와 비교할 때 아래
체크섬(SHA-256)으로 동일 여부를 확인할 수 있다.

```
4a419b3ede51f64790af7b56c0195ea01c98a84df8e0e768ebf343956b922f39  engine/scrollcraft.js
e19eb3aa73b0944626ca56e6e427c76f44753481e04d60f4bac20e8cf1d7758a  engine/scrollcraft.css
3dff774c47f1ebecb22f6bb2618d1ec13c99f21a92ce53e984ed0ae525c3327e  scripts/serve.mjs
963b1f2f0425783979b41ce0fcd2c668d47376735612816a83ca8142bb225be0  scripts/shoot.mjs
```

## 의도적으로 가져오지 않은 것

- `references/taste.md`, `approved-collection.md`, `uniqueness.md`, `feel.md`, `worlds.md`,
  `hero-depth.md`, `worldflight.md`: 특정 마케팅 사이트 취향과 "승인된 10개 사이트 표준".
  이 스킬은 특정 취향을 보편 규칙으로 승격하지 않으므로 제외했다.
- `scripts/kie.mjs`, `scripts/encode.sh`, `references/assets.md`: kie.ai 유료 API 자산 생성과
  그 인코딩 파이프라인. 외부 유료 서비스 연동은 스킬 범위 밖이다.
- `scripts/doctor.mjs`, `scripts/workspace.mjs`, `scripts/worldflight-assert.mjs`,
  `templates/FINGERPRINTS.md`: 원본 작업 공간 구조와 사이트 레지스트리에 묶인 스크립트.
- `CHANGELOG.md`: 상류 변경 이력. 필요하면 저장소에서 직접 본다.

엔진 자체는 worldflight 모드 코드를 포함하고 있다. 문서를 가져오지 않았으므로 이 스킬에서는
act 모드(`data-sc-act`)만 지원 범위로 다루고, worldflight는 상류 문서를 직접 확인한 뒤 사용한다.

## 재동기화 절차

1. 상류 저장소를 얕게 클론하고 `CHANGELOG.md`에서 변경 내용을 읽는다.
2. 위 표의 "없음" 파일은 그대로 덮어쓰고 체크섬을 갱신한다.
3. `scroll-template.html`과 `scroll-engine.md`는 상류 diff를 읽고 해당 부분만 손으로 반영한다.
4. 이 문서의 버전·커밋·날짜·체크섬을 갱신한다.
5. `references/scroll-template.html`을 `scripts/serve.mjs`로 띄워 `ScrollCraft.mount`가
   콘솔 오류 없이 동작하는지 확인한다.
