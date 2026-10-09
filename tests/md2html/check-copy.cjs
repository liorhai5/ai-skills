// Maintenance check: supply an existing jsdom module path; never installs it.
// node tests/md2html/check-copy.cjs /path/to/jsdom [converter.mjs]
// DOM-level coverage only: no browser layout, native clipboard or Docs claims.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

assert(process.argv[2], 'Supply the path of an already installed jsdom module.');
const { JSDOM, VirtualConsole } = require(path.resolve(process.argv[2]));
const converter = path.resolve(process.argv[3] || path.join(__dirname, '../../skills/md2html/md2html.mjs'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md2html-copy-check-'));
let dom, copied;
try {
  const input = path.join(tmp, 'hidden-content.md');
  const source = fs.readFileSync(path.join(__dirname, 'hidden-content.md'));
  fs.writeFileSync(input, source);
  fs.cpSync(path.join(__dirname, 'assets'), path.join(tmp, 'assets'), { recursive: true });
  const run = spawnSync(process.execPath, [converter, input, '--no-open', '--no-render'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '', 'Unexpected conversion degradation');
  assert.deepEqual(fs.readFileSync(input), source, 'Source Markdown changed');

  const warnings = [];
  const console = new VirtualConsole();
  console.on('warn', value => warnings.push(value));
  dom = new JSDOM(fs.readFileSync(input.replace(/\.md$/, '.html'), 'utf8'), {
    runScripts: 'dangerously', virtualConsole: console,
  });
  const w = dom.window, d = w.document;
  assert.equal(w.getComputedStyle(d.querySelector('.internal')).display, 'none');
  assert.equal(w.getComputedStyle(d.querySelector('.concealed span')).visibility, 'hidden');
  assert.equal(w.getComputedStyle(d.querySelector('.visible-child:last-child')).visibility, 'visible');

  // jsdom has no layout/innerText/native clipboard. Supply visible text and
  // clipboard storage; use its actual Selection/Range, CSS and emitted handler.
  const visible = 'Visible start Visible exception Visible field Visible value First column Third column Visible bullet ' +
    'Visible bold and italic: ✓ ⚠ ✕. ' +
    'First item Second item Field Value Visible label Visible value ' +
    'display: none and ✓ ⚠ ✕ stay literal in code. Visible end.';
  Object.defineProperty(d.body, 'innerText', { get: () => visible });
  const selection = w.getSelection(), range = d.createRange();
  range.selectNodeContents(d.body);
  selection.addRange(range);
  const nativeString = selection.toString;
  selection.toString = () => visible;
  const image = d.querySelector('img[alt="Visible image"]');
  Object.defineProperties(image, { naturalWidth: { value: 160 }, naturalHeight: { value: 90 } });
  function copy() {
    const values = new Map(), event = new w.Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { setData: (key, value) => values.set(key, value) } });
    d.dispatchEvent(event);
    return { values, prevented: event.defaultPrevented };
  }
  const whole = copy();
  assert(whole.prevented, 'Full copy handler did not run');
  const rich = whole.values.get('text/html');
  assert(!rich.includes('OMIT_'), 'Rich copy exposes CSS/attribute-hidden content');
  assert.equal(whole.values.get('text/plain'), visible);
  copied = new JSDOM('<body>' + rich + '</body>');
  const cd = copied.window.document;
  const table = cd.querySelector('#visible-table');
  assert(table, 'Visible table lost its structural wrapper');
  assert.equal(table.getAttribute('width'), '755');
  assert.equal(table.querySelectorAll('tbody').length, 1);
  assert.deepEqual([...table.querySelectorAll('tr')].map(row => [...row.cells].map(cell => cell.textContent)),
    [['Visible field', 'Visible value'], ['First column', '', 'Third column']]);
  assert.equal(copied.window.getComputedStyle(table.querySelector('td')).visibility, 'visible');
  const list = cd.querySelector('ul#visible-list');
  assert(list, 'Visible list lost its structural wrapper');
  assert.equal(list.querySelector('li').textContent, 'Visible bullet');
  assert.equal(copied.window.getComputedStyle(list.querySelector('li')).visibility, 'visible');
  assert.equal(cd.querySelectorAll('table').length, 2);
  assert.equal(cd.querySelectorAll('img').length, 1, 'Hidden image survived copying');
  assert.equal(cd.querySelector('input'), null, 'Hidden control survived copying');
  assert.equal(cd.querySelector('strong.visible-child').textContent, 'Visible exception');
  assert.equal(cd.querySelectorAll('strong').length, 2);
  assert.equal(cd.querySelectorAll('em').length, 1);
  assert.equal(cd.querySelectorAll('ol li').length, 2);
  assert.equal(cd.querySelector('table').getAttribute('width'), '755');
  assert.equal(cd.querySelector('img').getAttribute('width'), '160');
  assert.equal(cd.querySelector('img').getAttribute('height'), '90');
  assert.equal(cd.querySelector('img').getAttribute('src'), image.getAttribute('src'));
  assert.equal(cd.querySelector('script,style'), null);
  const glyphs = [...cd.querySelectorAll('p span')];
  assert.deepEqual(glyphs.map(el => el.style.color), ['rgb(25, 100, 60)', 'rgb(138, 97, 0)', 'rgb(161, 43, 43)']);
  assert.equal(cd.querySelector('code span'), null);
  assert.equal(cd.querySelectorAll('code')[1].textContent, '✓ ⚠ ✕');
  assert(d.querySelector('.internal').textContent.includes('OMIT_'), 'Copy mutated original DOM');

  range.setStart(d.querySelector('h1').firstChild, 0);
  range.setEnd(d.querySelector('h1').firstChild, 7);
  selection.removeAllRanges();
  selection.addRange(range);
  selection.toString = nativeString;
  const partial = copy();
  assert(!partial.prevented && partial.values.size === 0, 'Partial copying was intercepted');

  range.selectNodeContents(d.body);
  selection.removeAllRanges();
  selection.addRange(range);
  selection.toString = () => visible;
  w.getComputedStyle = () => { throw Error('Forced check failure'); };
  const fallback = copy();
  assert(!fallback.prevented && fallback.values.size === 0, 'Error did not fall back to native copy');
  assert(warnings.some(value => value.includes('using native copy')));
  process.stdout.write('PASS: hidden text/media/controls excluded; visible table structure and column positions, formatting, width, image, plain text, partial copy and error fallback retained.\n');
} finally {
  dom?.window.close();
  copied?.window.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
