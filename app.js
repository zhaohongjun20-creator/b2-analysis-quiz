/* 分层练习题库 · 刷题前端（纯原生 JS，无网络依赖）
 *
 * 数据来源：questions.js（由 tools/generate.py --web 导出）
 * 判分、错题本都在本地完成；localStorage 只存答题记录，不上传。
 */
(function () {
  'use strict';

  const BANK = (window.QUESTION_BANK && window.QUESTION_BANK.questions) || [];
  const CHAPTERS = (window.QUESTION_BANK && window.QUESTION_BANK.meta.chapters) || [];
  const CH_NAME = Object.fromEntries(CHAPTERS.map((c) => [c.key, c.name]));
  const TYPE_NAME = { choice: '选择', findError: '找错', fill: '填空', calc: '计算' };
  const DIFF_NAME = { 1: '易', 2: '中', 3: '难' };
  const PROG_KEY = 'b2quiz.progress.v1';

  const $ = (id) => document.getElementById(id);
  const T = window.TeX;

  const state = {
    chapter: 'all', type: 'all', diff: 0, order: 'seq',
    pool: [], idx: 0, selected: null, submitted: false,
    view: 'quiz', shuffleSeed: 20261023,
  };

  /* ---------------- 本地记录 ---------------- */
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) { localStorage.setItem(PROG_KEY, JSON.stringify(p)); }
  let progress = loadProgress();

  function wrongIds() {
    return Object.keys(progress).filter((id) => progress[id] && progress[id].ok === false);
  }

  /* ---------------- 组池与筛选 ---------------- */
  function shuffle(list, seed) {
    const a = list.slice();
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function rebuildPool(keepId) {
    let list = BANK.filter((q) =>
      (state.chapter === 'all' || q.chapter === state.chapter) &&
      (state.type === 'all' || q.type === state.type) &&
      (state.diff === 0 || q.difficulty === state.diff));
    if (state.order === 'shuffle') list = shuffle(list, state.shuffleSeed);
    state.pool = list;
    state.idx = 0;
    if (keepId) {
      const k = list.findIndex((q) => q.id === keepId);
      if (k >= 0) state.idx = k;
    }
    state.selected = null;
    state.submitted = false;
    renderNav();
    renderStats();
    renderQuestion();
  }

  /* ---------------- 侧栏 ---------------- */
  function renderNav() {
    const nav = $('chapterNav');
    const base = BANK.filter((q) => (state.type === 'all' || q.type === state.type) &&
                                     (state.diff === 0 || q.difficulty === state.diff));
    const rows = [['all', '全部章节', base.length]].concat(
      CHAPTERS.map((c) => [c.key, c.name, base.filter((q) => q.chapter === c.key).length]));
    nav.innerHTML = rows.map(([k, name, n]) =>
      '<button data-ch="' + k + '" class="' + (state.chapter === k ? 'active' : '') + '">' +
      '<span>' + name + '</span><span>' + n + '</span></button>').join('');
    nav.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { state.chapter = b.dataset.ch; rebuildPool(); };
    });
  }

  function renderStats() {
    const done = Object.keys(progress).length;
    const ok = Object.values(progress).filter((p) => p.ok).length;
    $('statDone').textContent = done;
    $('statRate').textContent = done ? Math.round(100 * ok / done) + '%' : '—';
    $('wrongCount').textContent = wrongIds().length;
    $('bankMeta').textContent = '共 ' + BANK.length + ' 题 · 覆盖 ' + CHAPTERS.length +
      ' 章 · 含找错题 · 每题都经过数值复核';
  }

  /* ---------------- 题目渲染 ---------------- */
  function current() { return state.pool[state.idx]; }

  function renderQuestion() {
    const q = current();
    $('quizView').hidden = false;
    $('wrongView').hidden = true;
    if (!q) {
      $('qStem').innerHTML = '<span class="empty">当前筛选下没有题目，换个章节试试。</span>';
      $('answerBox').innerHTML = '';
      $('solution').hidden = true;
      $('qPos').textContent = '';
      return;
    }
    state.selected = null;
    state.submitted = false;
    $('qChapter').textContent = q.chapterName || CH_NAME[q.chapter] || q.chapter;
    $('qType').textContent = TYPE_NAME[q.type] || q.type;
    $('qDiff').textContent = DIFF_NAME[q.difficulty] || q.difficulty;
    $('qId').textContent = q.id;
    $('qStem').innerHTML = T.toHtml(q.stem);
    $('qPos').textContent = (state.idx + 1) + ' / ' + state.pool.length;
    $('solution').hidden = true;
    $('btnSubmit').disabled = false;
    $('btnSubmit').textContent = '提交';

    const box = $('answerBox');
    box.innerHTML = '';
    if (q.type === 'choice' || q.type === 'findError') {
      q.options.forEach((o) => {
        const btn = document.createElement('button');
        btn.className = 'opt';
        btn.innerHTML = '<span class="k">' + o.key + '</span><span class="ot">' + T.toHtml(o.text) + '</span>';
        btn.onclick = () => {
          if (state.submitted) return;
          state.selected = o.key;
          box.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'));
          btn.classList.add('sel');
        };
        box.appendChild(btn);
      });
    } else {
      const wrap = document.createElement('div');
      const inp = document.createElement('input');
      inp.className = 'numin';
      inp.id = 'numInput';
      inp.type = 'text';
      inp.autocomplete = 'off';
      inp.placeholder = '输入数值，如 3 或 1/6 或 0.5';
      const hint = document.createElement('div');
      hint.className = 'numhint';
      hint.id = 'numHint';
      hint.textContent = q.type === 'calc'
        ? '计算题：纸上写过程，这里只填最终数值（可输入分数，如 1/6）'
        : '直接填数值；分数请写成 1/6 这样的形式';
      wrap.appendChild(inp);
      wrap.appendChild(hint);
      box.appendChild(wrap);
      inp.focus();
      inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    }
    // 已做过的题显示上次结果
    const rec = progress[q.id];
    if (rec) {
      const hint = document.createElement('div');
      hint.className = 'numhint';
      hint.textContent = '上次作答：' + (rec.ok ? '正确 ✔' : '错误 ✘') + '（可重做）';
      box.appendChild(hint);
    }
  }

  /* ---------------- 判分 ---------------- */
  function parseNumber(s) {
    if (s == null) return NaN;
    let t = String(s).trim().replace(/，/g, ',').replace(/\s+/g, '');
    if (!t) return NaN;
    t = t.replace(/π/g, 'Math.PI').replace(/pi/gi, 'Math.PI').replace(/^e$/, 'Math.E');
    if (/^[-+*/().\d,eEMathPI]+$/.test(t) && /[0-9]|PI|E/.test(t)) {
      try { const v = Function('"use strict";return (' + t + ')'); return typeof v === 'number' ? v : NaN; }
      catch (e) { return NaN; }
    }
    const v = parseFloat(t);
    return isFinite(v) ? v : NaN;
  }

  function isCorrect(q, user) {
    if (q.answer.kind === 'choice') return user === q.answer.value;
    const ans = Number(q.answer.value);
    const got = parseNumber(user);
    if (!isFinite(got)) return false;
    return Math.abs(got - ans) <= Math.max(1e-6, 1e-3 * Math.abs(ans));
  }

  function submit() {
    const q = current();
    if (!q || state.submitted) return;
    let user;
    if (q.type === 'choice' || q.type === 'findError') {
      user = state.selected;
      if (!user) { flash('请先选择一个选项'); return; }
    } else {
      user = ($('numInput') || {}).value || '';
      if (!String(user).trim()) { flash('请先填入答案'); return; }
    }
    const ok = isCorrect(q, user);
    state.submitted = true;
    $('btnSubmit').disabled = true;
    $('btnSubmit').textContent = ok ? '已答对' : '已答错';

    // 标记选项
    const box = $('answerBox');
    if (q.type === 'choice' || q.type === 'findError') {
      box.querySelectorAll('.opt').forEach((btn, i) => {
        const key = q.options[i].key;
        if (key === q.answer.value) btn.classList.add('correct');
        else if (key === user) btn.classList.add('wrong');
      });
    }

    // 记录
    progress[q.id] = { ok: ok, tries: ((progress[q.id] && progress[q.id].tries) || 0) + 1, ts: Date.now() };
    saveProgress(progress);
    renderStats();
    showSolution(q, ok, user);
  }

  function showSolution(q, ok, user) {
    const sol = $('solution');
    let correctText;
    if (q.type === 'choice' || q.type === 'findError') {
      const o = q.options.find((x) => x.key === q.answer.value);
      correctText = q.answer.value + '．' + T.toHtml(o ? o.text : '');
    } else {
      correctText = '<b>' + q.answer.value + '</b>';
    }
    let html = '<h3>解析</h3>';
    html += '<div><span class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '回答正确 ✔' : '回答错误 ✘') + '</span>' +
      '<span class="kv">你的答案：<b>' + escapeHtml(String(user)) + '</b>　正确答案：' + correctText + '</span></div>';
    html += '<div style="margin-top:10px">' + T.toHtml(q.solution) + '</div>';
    if (q.type === 'findError' && q.answer.correction) {
      html += '<div class="kv">正确说法：' + T.toHtml(q.answer.correction) + '</div>';
    }
    html += '<div class="kv">知识点：' + (q.knowledge || []).join('、') +
      '　·　题型：' + (TYPE_NAME[q.type] || q.type) + '　·　难度：' + (DIFF_NAME[q.difficulty] || '') +
      '　·　题号：' + q.id + '</div>';
    sol.innerHTML = html;
    sol.hidden = false;
    sol.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function flash(msg) {
    const el = $('qPos');
    const old = el.textContent;
    el.textContent = msg;
    el.style.color = '#f0883e';
    setTimeout(() => { el.textContent = old; el.style.color = ''; }, 1600);
  }

  /* ---------------- 错题本 ---------------- */
  function renderWrong() {
    $('quizView').hidden = true;
    $('wrongView').hidden = false;
    const ids = wrongIds();
    $('wrongTip').textContent = ids.length
      ? '共 ' + ids.length + ' 道错题。错题保存在本机浏览器（localStorage），不上传任何数据。'
      : '错题本还是空的——做错的题会自动出现在这里。';
    const ul = $('wrongList');
    if (!ids.length) { ul.innerHTML = '<li class="empty">暂无错题。</li>'; return; }
    ul.innerHTML = ids.map((id) => {
      const q = BANK.find((x) => x.id === id);
      if (!q) return '';
      return '<li class="wrong-item"><div class="wq">' + T.toHtml(q.stem) + '</div>' +
        '<div class="wmeta"><span>' + (q.chapterName || '') + ' · ' + (TYPE_NAME[q.type] || '') +
        ' · ' + q.id + '</span><button data-redo="' + id + '">重做这道</button></div></li>';
    }).join('');
    ul.querySelectorAll('[data-redo]').forEach((b) => {
      b.onclick = () => {
        const q = BANK.find((x) => x.id === b.dataset.redo);
        state.chapter = q.chapter; state.type = 'all'; state.diff = 0; state.order = 'seq';
        $('typeFilter').value = 'all'; $('diffFilter').value = '0'; $('orderMode').value = 'seq';
        rebuildPool(q.id);
      };
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function init() {
    $('typeFilter').onchange = (e) => { state.type = e.target.value; rebuildPool(); };
    $('diffFilter').onchange = (e) => { state.diff = +e.target.value; rebuildPool(); };
    $('orderMode').onchange = (e) => { state.order = e.target.value; rebuildPool(); };
    $('btnSubmit').onclick = submit;
    $('btnNext').onclick = () => {
      if (!state.pool.length) return;
      state.idx = (state.idx + 1) % state.pool.length;
      renderQuestion();
    };
    $('btnPrev').onclick = () => {
      if (!state.pool.length) return;
      state.idx = (state.idx - 1 + state.pool.length) % state.pool.length;
      renderQuestion();
    };
    $('btnWrong').onclick = renderWrong;
    $('btnBackQuiz').onclick = () => { renderQuestion(); };
    $('btnClearWrong').onclick = () => {
      if (!confirm('确定清空错题记录？此操作不可撤销。')) return;
      Object.keys(progress).forEach((id) => { if (progress[id].ok === false) delete progress[id]; });
      saveProgress(progress);
      renderStats();
      renderWrong();
    };
    renderNav();
    renderStats();
    rebuildPool();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
