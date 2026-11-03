# Aside로 조사하기

사용자가 Aside를 지정했거나 이 브라우저의 기존 로그인 상태로 조사할 때 읽는다. 특정 모델이나 운영체제에 Aside를 필수로 요구하는 문서는 아니다. 조사 기간·조회수·제외 조건과 원문 확인 기준은 `SKILL.md`를 그대로 따른다.

## CLI 찾기와 연결

1. `command -v aside`로 확인한다. macOS에서 찾지 못하면 기본 설치 경로인 `$HOME/.local/bin/aside --version`도 확인한다. 앱 설치와 CLI 설치는 별개이며 `/Applications/Aside.app/Contents/MacOS/Aside`는 브라우저 앱 실행 파일이다.
2. CLI가 없으면 [공식 개발자 문서](https://docs.aside.com/help/developers)의 현재 설치 방법을 확인한다. 공식 설치 진입점은 `https://releases.aside.com/install.sh`다. 필요한 설치는 사용자의 요청 범위와 실행 환경의 권한 절차에 따라 수행한다. 임의의 실행 파일·래퍼나 native host 설정을 만들지 않는다.
3. 발견한 CLI 경로로 아래 도움말을 읽는다. PATH에 없으면 이후에도 절대 경로로 실행하면 된다. 셸 설정을 바꿀 필요는 없다.

```sh
aside --help
aside repl --help
aside guide repl
aside account status
```

이 문서의 API 예시보다 설치된 버전의 도움말과 `guide repl`을 우선한다. Aside 앱·로컬 서비스가 실행 중이어야 로컬 브라우저를 제어할 수 있다. 앱이 꺼져 있다면 앱을 실행한 뒤 가벼운 조회로 연결을 다시 확인한다.

`account status`의 signed in은 Aside 계정 상태이며 X 등 조사 사이트의 로그인 상태를 보장하지 않는다. 대상 사이트의 실제 페이지로 따로 확인한다. 로컬 Aside를 제어할 때 원격 제어용 `aside login`부터 실행하거나 인증 파일을 뒤지지 않는다.

### 로컬 연결 오류 구분

`connect EPERM 127.0.0.1:<port>`와 OS·sandbox 접근 거부가 나오면 로컬 연결 권한 문제다. 앱이 꺼졌다거나 로그인되지 않았다는 뜻으로 해석하지 않는다. 오류에 나온 로컬 연결에 대해 환경의 정상 승인 절차를 거쳐 재시도한다. 포트 번호는 고정하지 않는다.

사이트의 403 응답은 별개의 문제다. 해당 브라우저의 페이지에서 관찰한 오류와 로그인 UI를 기록한다. 다른 브라우저에서 발생한 403을 Aside에서도 재현됐다고 보고하지 않는다. 원인을 모른 채 프로필 초기화·브라우저 전체 종료·쿠키 추출·보안 설정 해제를 하지 않는다. 승인이 거부되면 같은 행동을 반복하지 말고 가능한 범위와 재개 조건을 남긴다.

## REPL로 직접 조사

- `aside repl`: 현재 조사 모델이 JavaScript로 브라우저를 직접 읽고 조작한다. 모델을 유지하며 근거를 확인하려면 이 표면을 사용한다.
- `aside exec`: Aside 자체 에이전트에 작업을 위임한다. 직접 브라우저 조작과 다른 방식이므로 위임을 선택한 경우에만 사용하고, 반환된 요약만으로 원문 확인을 했다고 기록하지 않는다.

`aside skills list`로 사이트 지침을 찾을 수 있다. 관련 지침을 사용한다면 먼저 읽되, 그 지침의 HTTP·API·다운로드 기능까지 이 조사에서 허용된 것으로 해석하지 않는다. 여기서는 브라우저 원문을 확인하는 REPL 조작을 사용하며 직접 API·`fetch()`·쿠키/토큰 추출은 하지 않는다.

### 탭과 페이지 읽기

`aside repl`에는 처음부터 현재 사용자 탭을 가리키는 `page`가 있다고 가정하지 않는다. `listBrowserTabs()`로 관련 공개 페이지를 찾고, 관찰한 `targetId`로 `attachBrowserTab(targetId)`를 호출한다. 관련 탭이 없으면 `openTab(url)`을 사용한다. 사적인 쪽지·알림·계정 설정은 조사 대상이 아니다.

다음은 X 홈·검색·탐색 탭을 재사용하거나, 없으면 X를 여는 연결 확인 예다. 다른 사이트 조사에서는 대상 URL을 바꾼다.

```sh
aside repl '
const researchTabs1 = await listBrowserTabs();
const researchXTabs1 = researchTabs1.filter(t => /^https:\/\/(www\.)?x\.com\/(home|explore|search)([/?#]|$)/.test(t.url || ""));
const researchPage1 = researchXTabs1.length
  ? await attachBrowserTab(researchXTabs1[0].targetId)
  : await openTab("https://x.com");
const researchSnapshot1 = await snapshot(researchPage1, { interactive: true });
console.log(researchSnapshot1.tree);
'
```

실행 환경의 셸 인용 규칙을 따른다. 위 예는 POSIX 셸용이며 작은따옴표가 JavaScript 안의 셸 확장을 막는다.

- `snapshot(page, options)`는 문자열이 아니라 `{ tree, diff }`를 반환한다. 처음에는 `tree`, 동작 후에는 새 스냅샷의 `diff`를 읽는다.
- 관찰한 ref로 `page.locator(ref)` 등의 안내된 API를 사용하고, 매 동작 뒤 새 스냅샷으로 결과를 확인한다. 새 스냅샷을 얻으면 이전 ref를 재사용하지 않는다.
- 같은 REPL 안의 `const`·`let`은 유지되므로 새 변수명을 사용한다. 새 REPL 호출에는 이전 변수·탭 연결·ref가 남아 있다고 가정하지 않는다. 필요한 탭을 다시 찾아 연결한다.
- 긴 화면은 `snapshot`의 `ref` 또는 `selector` 옵션으로 필요한 영역을 읽는다. 전체 타임라인·전체 스냅샷을 반복 누적하거나 반환 문자열을 임의로 잘라 증거를 잃지 않는다. 지원 옵션은 `guide repl`에서 확인한다.
- `page.evaluate()`로 읽어야 한다면 관찰한 정확한 DOM 선택자를 사용한다. 탭 관리는 `openTab()`·`closeTab()`을 사용하고 사용자의 기존 탭을 임의로 닫지 않는다.

## 로그인과 조사 근거

사용자가 Aside로 조사하도록 지시했다면 기존 로그인 세션의 읽기를 위해 같은 승인을 다시 묻지 않는다. 실제 페이지의 계정 메뉴·홈·검색 화면 등으로 상태를 확인한다. 이 허용은 새 로그인, 인증정보 입력, 계정 변경, 게시·좋아요·팔로우까지 포함하지 않는다. 인증이나 사람의 확인이 필요하면 그 부분만 보류한다.

X에서는 직접 게시물 URL의 원 작성자·게시일·본문·게시물 조회수를 확인한다. 인용된 글의 날짜나 조회수를 원 게시물에 붙이지 않는다. 영상 재생수·좋아요는 게시물 조회수가 아니다. 축약 표시가 하한 경계에 걸리면 접근성 이름 등 원문에 공개된 정확한 수치를 확인하고, 확정할 수 없으면 검증 대기로 남긴다.

연결 성공과 조사 완료를 구분한다. 후보마다 실제 확인 범위와 근거를 저장하고, 원문을 읽지 못한 후보를 채택하거나 단순 연결 오류를 콘텐츠 부재로 보고하지 않는다.
