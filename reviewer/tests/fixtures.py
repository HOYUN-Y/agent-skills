"""검토 예제의 결함과 정상 동작을 네트워크·외부 의존성 없이 확인한다."""
import runpy
from pathlib import Path

root = Path(__file__).resolve().parent / 'fixtures'
rows = [{'id': 10, 'account_id': 1}, {'id': 20, 'account_id': 2}]
buggy = runpy.run_path(str(root / 'buggy/invoices.py'))['invoice_response']
clean = runpy.run_path(str(root / 'clean/invoices.py'))['invoice_response']
assert buggy(rows, 20, 1) == {'status': 200, 'body': rows[1]}
assert clean(rows, 20, 1) == {'status': 404}
assert clean(rows, 10, 1) == {'status': 200, 'body': rows[0]}
assert clean(rows, 99, 1) == {'status': 404}
print('결함 예제의 타 계정 노출·정상 예제의 소유권 검사·미존재 처리: 확인')
