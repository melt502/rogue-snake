"""在本机 Chrome 中运行旧测试和新增回归；无 npm 安装依赖。"""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request

import websocket

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'work'
OUT.mkdir(exist_ok=True)
DEFAULT_CHROME = Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')


class Browser:
    """Small Chrome DevTools client with an isolated, disposable browser."""

    def __init__(self):
        self.process = None
        self.ws = None
        self.profile = None
        self.stderr_path = None
        self.port = _free_port()
        self.endpoint = f'http://127.0.0.1:{self.port}'
        chrome = _chrome_path()
        try:
            self.profile = tempfile.TemporaryDirectory(prefix='browser-checks-')
            stderr_fd, stderr_name = tempfile.mkstemp(prefix='browser-checks-', suffix='.log', dir=OUT)
            os.close(stderr_fd)
            self.stderr_path = Path(stderr_name)
            with self.stderr_path.open('w', encoding='utf-8') as stderr:
                self.process = subprocess.Popen([
                    str(chrome), '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
                    '--no-default-browser-check', '--disable-background-networking',
                    f'--remote-debugging-port={self.port}',
                    f'--remote-allow-origins=http://localhost:{self.port}',
                    f'--user-data-dir={self.profile.name}', 'about:blank',
                ], stdout=subprocess.DEVNULL, stderr=stderr,
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError(self._chrome_failure(f'Chrome 提前退出：{self.process.returncode}'))
                try:
                    with urllib.request.urlopen(f'{self.endpoint}/json', timeout=1) as response:
                        pages = json.load(response)
                    page = next(p for p in pages if p['type'] == 'page')
                    self.ws = websocket.create_connection(
                        page['webSocketDebuggerUrl'], origin=f'http://localhost:{self.port}', timeout=10)
                    break
                except (OSError, StopIteration, websocket.WebSocketException):
                    time.sleep(.1)
            else:
                raise RuntimeError(self._chrome_failure('Chrome 调试接口未就绪（超时）'))
            self.id = 0
            self.call('Page.enable')
            self.call('Runtime.enable')
        except Exception:
            self.close()
            raise

    def _chrome_failure(self, message):
        diagnostics = ''
        if self.stderr_path:
            try:
                diagnostics = self.stderr_path.read_text(encoding='utf-8', errors='replace').strip()
            except OSError:
                pass
        if diagnostics:
            message += f'\nChrome stderr（{self.stderr_path}）：\n{diagnostics[-4000:]}'
        return message

    def call(self, method, params=None):
        self.id += 1
        try:
            self.ws.send(json.dumps({'id': self.id, 'method': method, 'params': params or {}}))
            while True:
                result = json.loads(self.ws.recv())
                if result.get('id') == self.id:
                    if 'error' in result:
                        raise RuntimeError(result['error'])
                    return result.get('result', {})
        except (OSError, websocket.WebSocketException) as exc:
            raise RuntimeError(self._chrome_failure(f'DevTools 请求 {method} 失败：{exc}')) from exc

    def evaluate(self, expression):
        r = self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'], ensure_ascii=False))
        return r.get('result', {}).get('value')

    def navigate(self, width=1440, height=1000):
        self.call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': False})
        self.call('Page.navigate', {'url': (ROOT / 'index.html').as_uri()})
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if self.evaluate("document.readyState==='complete'&&typeof newGame==='function'"):
                return
            time.sleep(.05)
        raise RuntimeError('页面加载超时')

    def screenshot(self, name):
        size = self.call('Page.getLayoutMetrics')['cssContentSize']
        data = self.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True,
            'clip': {'x': 0, 'y': 0, 'width': size['width'], 'height': size['height'], 'scale': 1}})['data']
        (OUT / name).write_bytes(base64.b64decode(data))

    def close(self):
        if self.ws is not None:
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        if self.stderr_path:
            try:
                self.stderr_path.unlink(missing_ok=True)
            except OSError:
                pass
            self.stderr_path = None
        if self.profile:
            self.profile.cleanup()
            self.profile = None


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def _chrome_path():
    configured = os.environ.get('CHROME_PATH') or os.environ.get('BROWSER_CHROME_PATH')
    chrome = Path(configured) if configured else DEFAULT_CHROME
    if not chrome.is_file():
        raise FileNotFoundError(f'找不到 Chrome：{chrome}；请设置 CHROME_PATH')
    return chrome


def test_source():
    src = (ROOT / 'test.js').read_text(encoding='utf-8')
    # 复用旧断言，测试环境改成真实浏览器。游戏与 UI 使用原始文件。
    header = src[src.index('/* ---------------- tiny assert framework'):src.index('/* ---------------- build the DOM')]
    expose = src.split('const expose = `', 1)[1].split('`;', 1)[0]
    canvas_mock = src[src.index('const ctxCalls = []'):src.index('const dom = new JSDOM')]
    setup = src[src.index('    window.HTMLCanvasElement.prototype.getContext'):src.index('\n  }\n});')]
    body = src[src.index('const win = dom.window;'):]
    body = body.replace('win.close();', '')
    body = body.replace("process.exit(failed.length ? 1 : 0);", "window.__testResult={total:results.length,failed,results};")
    body = body.replace('(async () => {\n  section(\'T16', 'return (async () => {\n  section(\'T16')
    files = {name: (ROOT / name).read_text(encoding='utf-8') for name in ['index.html', 'styles.css', 'game-data.js', 'game.js']}
    regressions = (ROOT / 'regression_checks.js').read_text(encoding='utf-8')
    body = body.replace('/* ---------------- summary (async:', regressions + '\n/* ---------------- summary (async:')
    return expose + '\n(async()=>{\n' + header + canvas_mock + setup + '\n' + (
        'const dom={window},__dirname="",path={join:(a,b)=>b};\n'
        f'const files={json.dumps(files,ensure_ascii=False)};\n'
        'const fs={readFileSync:p=>files[p]},gameSrc=files["game-data.js"]+files["game.js"];\n'
    ) + body + '\n})()'


if __name__ == '__main__':
    b = None
    try:
        b = Browser()
        b.navigate()
        b.evaluate('cancelAnimationFrame(raf);window.requestAnimationFrame=()=>0;')
        b.evaluate(test_source())
        result = b.evaluate('window.__testResult')
        if not result:
            raise RuntimeError('测试没有产生结果')
        (OUT / 'test-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'total': result['total'], 'failed': result['failed']}, ensure_ascii=False, indent=2))
        # 清除测试存档并重新载入，截图使用真实 Canvas 与真实 CSS。
        b.evaluate('localStorage.clear()')
        layouts = []
        for width, height, name in [(1440, 1000, 'menu-desktop.png'), (390, 844, 'menu-mobile.png')]:
            b.navigate(width, height)
            layouts.append(b.evaluate("({screen:'menu',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})"))
            b.screenshot(name)
        for width, height, name in [(1440, 1000, 'game-desktop.png'), (390, 844, 'game-mobile.png')]:
            b.navigate(width, height)
            b.evaluate("save.settings.tutorialCompleted=true;newGame();cancelAnimationFrame(raf);window.requestAnimationFrame=()=>0;state=STATES.PAUSED;game.score=385;game.level=6;game.threat=4;game.affix='虫巢';addRelic('thorn');addRelic('magnet');addRelic('armor');spawnEnemy('guardian');spawnEnemy('tracker');spawnEnemy('normal');updateHud();draw();")
            layouts.append(b.evaluate("(()=>{const c=document.querySelector('#canvas').getBoundingClientRect(),h=document.querySelector('.hud').getBoundingClientRect();return {screen:'game',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,hudCoversCanvas:h.left<c.right&&h.right>c.left&&h.top<c.bottom&&h.bottom>c.top}})()"))
            b.screenshot(name)
        print(json.dumps({'layouts': layouts}, ensure_ascii=False, indent=2))
        (OUT / 'layout-results.json').write_text(json.dumps(layouts, indent=2), encoding='utf-8')
        if any(item['overflow'] or item.get('hudCoversCanvas') for item in layouts):
            raise RuntimeError('界面出现横向溢出或 HUD 遮挡棋盘')
        raise SystemExit(1 if result['failed'] else 0)
    finally:
        if b is not None:
            b.close()
