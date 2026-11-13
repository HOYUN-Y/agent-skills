#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function build(project, check = false, agent = 'code-reviewer') {
  if (!['code-reviewer', 'advisor'].includes(agent)) throw new Error('에이전트는 code-reviewer 또는 advisor를 지정하세요.');
  const source = fileURLToPath(new URL(agent === 'advisor' ? '../../advisor/' : '..', import.meta.url));
  const root = await realpath(project);
  if (!(await lstat(root)).isDirectory()) throw new Error('기존 프로젝트 디렉터리를 지정하세요.');
  const spec = await readFile(join(source, agent === 'advisor' ? 'advisor-spec.md' : 'reviewer-spec.md'), 'utf8');
  const hash = createHash('sha256').update(spec).digest('hex');
  const instructions = `지침 버전: sha256:${hash}\n\n${spec}`;
  const outputs = [];
  for (const [adapter, relative] of [
    ['claude.md', `.claude/agents/${agent}.md`],
    ['codex.toml', `.codex/agents/${agent}.toml`],
  ]) {
    const template = await readFile(join(source, 'adapters', adapter), 'utf8');
    if (template.split('{{INSTRUCTIONS}}').length !== 2) throw new Error(`지침 자리표시자를 확인하세요: ${adapter}`);
    const content = template.replace('{{INSTRUCTIONS}}', () => adapter.endsWith('.toml') ? JSON.stringify(instructions) : instructions);
    const path = join(root, relative);
    let existing = false;
    let current = root;
    for (const part of relative.split('/')) {
      current = join(current, part);
      let stat;
      try { stat = await lstat(current); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (stat.isSymbolicLink()) throw new Error(`심볼릭 링크를 따라 설치하지 않습니다: ${current}`);
      if (current !== path && !stat.isDirectory()) throw new Error(`디렉터리가 아닙니다: ${current}`);
      if (current === path) {
        if (!stat.isFile()) throw new Error(`일반 파일이 아닙니다: ${path}`);
        existing = true;
        if (await readFile(path, 'utf8') !== content) throw new Error(`기존 파일을 보존합니다. 새 임시 프로젝트에 생성하여 차이를 확인하세요: ${path}`);
      }
    }
    if (check && !existing) throw new Error(`생성 파일이 없습니다: ${path}`);
    outputs.push({ path, content, existing });
  }
  // 양쪽의 충돌을 먼저 확인하고, 파일 생성 시에도 기존 파일 덮어쓰기를 막습니다.
  if (!check) for (const output of outputs) {
    if (output.existing) continue;
    await mkdir(dirname(output.path), { recursive: true });
    await writeFile(output.path, output.content, { flag: 'wx' });
  }
  return { hash, paths: outputs.map(output => output.path) };
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length < 2 || args[0] !== '--project' || args[1].startsWith('--')) throw new Error('사용법: node reviewer/scripts/build-agents.mjs --project <기존 프로젝트 경로> [--agent code-reviewer|advisor] [--check]');
    let check = false;
    let agent;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--check' && !check) check = true;
      else if (args[i] === '--agent' && agent === undefined && args[i + 1]) agent = args[++i];
      else throw new Error(`알 수 없거나 중복된 옵션: ${args[i]}`);
    }
    const result = await build(args[1], check, agent);
    console.log(`sha256:${result.hash}\n${result.paths.join('\n')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
