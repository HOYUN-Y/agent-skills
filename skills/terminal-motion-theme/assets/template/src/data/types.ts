// 장면 데이터의 모양. 주제와 무관하다 — 무엇을 담을지는 references/direction.md "주제를 화면 자리에 옮기기"를 따른다.

export type Span = {start: number; end: number};

// 큰 단계 제목. at이 음수인 첫 항목은 0프레임에 이미 완성되어 있다(썸네일).
export type Title = {at: number; title: string; tag: string};

// 바닥줄 단계 표시(16:9)
export type Phase = {label: string; start: number; end: number};

// 일하는 주체(에이전트·도구·단계). steps = [시작 프레임, 지금 하는 일], rate = 프레임당 처리량(모의)
export type Actor = {id: string; name: string; span: Span; steps: [number, string][]; done: string; rate?: number}; // rate 없으면 처리량 숫자를 숨김

// 머리줄 수치. keys = 그 프레임부터 값이 v로 바뀜(ramp 프레임 동안 세어 올라감). value = 직접 계산
// decimals = 소수 자릿수(없으면 정수), blankZero = 값이 정해지기 전(0)에는 '–'를 보인다(record에서 가짜 0을 보이지 않게)
export type Metric = {label: string; width: number; keys?: {at: number; v: number; ramp?: number}[]; value?: (frame: number) => number; decimals?: number; blankZero?: boolean};

// 왼쪽 목록(파일 트리·자료 목록·작업 목록). group = 주인공 시각물의 묶음 키(색·개수를 가져옴)
export type TreeItem = {label: string; depth: number; key?: string; dir?: boolean; group?: string; collapsed?: boolean; appearAt?: number};
export type FocusWindow = {start: number; end: number; keys: string[]};
export type Change = {at: number; sign: '+' | '~' | '-'; path: string; note: string};

// 읽거나 쓰는 문서 창. scan = 위에서부터 읽어 내려가는 막대(to 줄에서 멈춤), added = 그 구간에 타이핑되는 줄,
// mark = 그 프레임부터 줄을 강조하고 오른쪽에 ◀ 라벨
export type DocLine = {text: string; kind?: 'h1' | 'h2' | 'item' | 'code' | 'note'; added?: Span; mark?: {at: number; label: string}};
export type Doc = {from: number; title: string; meta: [number, string][]; lines: DocLine[]; scan?: {start: number; end: number; to: number}};

// 명령·질문과 결과 창. mark: ok ✓ / fail ✗(반전 칩) / info ·, score = 0~1 막대(선택)
export type OutLine = {at: number; text: string; sub?: string; mark?: 'ok' | 'fail' | 'info'; score?: number};
export type Output = {from: number; title: string; meta: [number, string][]; prompt?: {text: string} & Span; route?: {at: number; steps: string[]}; lines: OutLine[]};

export type Log = {at: number; tag: string; text: string};

// 주인공 시각물(픽셀 네트워크) 설정
export type HeroGroup = {key: string; label: string; count: number; colors: readonly string[]; center?: {x: number; y: number}};
export type HeroStory = {key: string; group: string; label: string; pick?: number};
export type HeroAdded = {key: string; label: string; near: string[]; offset?: {x: number; y: number}; at: number; links: string[]};
// 강조 구간: sel = 주인공(크게·금색 테두리), lit = 함께 밝힘, edges = 밝힐 선
export type HeroWindow = Span & {sel?: string[]; lit?: string[]; edges?: [string, string][]};
export type HeroFlow = Span & {path: string[]}; // 에이전트가 따라가는 길: 금색 픽셀이 흐른다
export type HeroShot = {at: number; focus?: string[]; zoom?: number}; // 카메라: at부터 36프레임 동안 이동
export type HeroConfig = {
  title: string;
  groups: HeroGroup[];
  story: HeroStory[];
  links: [string, string][];
  added: HeroAdded[];
  windows: HeroWindow[];
  flows: HeroFlow[];
  shots: HeroShot[];
  status: (Span & {text: string})[];
};

// 주인공 시각물(단계 파이프라인) 설정: 단계마다 픽셀 칸이 아래부터 쌓여 차오른다.
// mark = 그 프레임에 단계 칸 위에 붙는 이름표(실패·발견·결과). until이 없으면 그 단계가 끝나고 30프레임 뒤까지
export type PipeStage = {key: string; label: string; span: Span; colors: readonly string[]};
export type PipeMark = {at: number; stage: string; label: string; until?: number; kind?: 'ok' | 'fail' | 'info'};
export type PipelineConfig = {title: string; stages: PipeStage[]; marks: PipeMark[]; status: (Span & {text: string})[]};
