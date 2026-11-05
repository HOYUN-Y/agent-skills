import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../scripts/build-agents.mjs';

const temporary = await mkdtemp(join(tmpdir(), 'reviewer test '));
try {
  const project = join(temporary, '공백 있는 프로젝트');
  await mkdir(project);
  const { paths, hash } = await build(project);
  const before = await Promise.all(paths.map(path => readFile(path, 'utf8')));
  const parsed = JSON.parse(execFileSync('python3', ['-c',
    'import json, sys, tomllib; print(json.dumps(tomllib.loads(sys.stdin.read())))',
  ], { input: before[1], encoding: 'utf8' }));
  const body = before[0].split('\n---\n\n')[1].trimEnd();
  assert.equal(parsed.name, 'code-reviewer');
  assert.equal(parsed.developer_instructions.trimEnd(), body);
  assert.ok(body.startsWith(`지침 버전: sha256:${hash}\n`));
  await build(project, true);
  await build(project);
  assert.deepEqual(await Promise.all(paths.map(path => readFile(path, 'utf8'))), before);

  // 두 번째 출력의 충돌도 첫 번째 출력 생성 전에 중단해야 합니다.
  const conflict = join(temporary, 'conflict');
  await mkdir(join(conflict, '.codex/agents'), { recursive: true });
  const original = join(conflict, '.codex/agents/code-reviewer.toml');
  await writeFile(original, '사용자가 작성한 기존 에이전트');
  await assert.rejects(build(conflict), /기존 파일을 보존/);
  assert.equal(await readFile(original, 'utf8'), '사용자가 작성한 기존 에이전트');
  await assert.rejects(readFile(join(conflict, '.claude/agents/code-reviewer.md')), { code: 'ENOENT' });

  const missing = join(temporary, 'missing');
  await mkdir(missing);
  await assert.rejects(build(missing, true), /생성 파일이 없습니다/);
  await assert.rejects(readFile(join(missing, '.claude/agents/code-reviewer.md')), { code: 'ENOENT' });

  const linked = join(temporary, 'linked');
  const outside = join(temporary, 'outside');
  await mkdir(linked);
  await mkdir(outside);
  await symlink(outside, join(linked, '.claude'), 'dir');
  await assert.rejects(build(linked), /심볼릭 링크/);
  await assert.rejects(readFile(join(outside, 'agents/code-reviewer.md')), { code: 'ENOENT' });

  const blocked = join(temporary, 'blocked');
  await mkdir(blocked);
  await writeFile(join(blocked, '.claude'), '일반 파일');
  await assert.rejects(build(blocked), /디렉터리가 아닙니다/);

  // 지침 안의 TOML 특수문자와 치환 문자열도 손실 없이 두 환경에 전달해야 합니다.
  const sandbox = join(temporary, 'builder');
  await mkdir(join(sandbox, 'scripts'), { recursive: true });
  await mkdir(join(sandbox, 'adapters'));
  await writeFile(join(sandbox, 'scripts/build-agents.mjs'), await readFile(new URL('../scripts/build-agents.mjs', import.meta.url)));
  for (const file of ['claude.md', 'codex.toml']) {
    await writeFile(join(sandbox, 'adapters', file), await readFile(new URL(`../adapters/${file}`, import.meta.url)));
  }
  const unusual = '한글 """ \\ 경로\n$& $` ${value}\t끝\n';
  await writeFile(join(sandbox, 'reviewer-spec.md'), unusual);
  execFileSync(process.execPath, [join(sandbox, 'scripts/build-agents.mjs'), '--project', missing]);
  const special = JSON.parse(execFileSync('python3', ['-c',
    'import json, sys, tomllib; print(json.dumps(tomllib.loads(sys.stdin.read())))',
  ], { input: await readFile(join(missing, '.codex/agents/code-reviewer.toml')), encoding: 'utf8' }));
  assert.ok(special.developer_instructions.endsWith(unusual));
  assert.ok((await readFile(join(missing, '.claude/agents/code-reviewer.md'), 'utf8')).includes(unusual));
  console.log('공통 지침 일치·TOML 파싱·중복 실행·검사 모드·충돌 보존·링크 차단·특수문자 전달: 통과');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
