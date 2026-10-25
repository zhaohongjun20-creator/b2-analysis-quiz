/* ε-δ 显微镜 · 分析学可视化工作台
 * 纯原生 JS，无任何依赖，可离线打开。
 * 所有数值判定都是本地实时计算，便于“验得对”。
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (v, d = 4) => {
    if (!isFinite(v)) return '∞';
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
    return v.toFixed(d);
  };

  /* ---------------- 画布工具 ---------------- */
  function prep(canvas, ratio) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, canvas.parentElement.clientWidth - 24);
    const h = Math.max(300, Math.round(w * ratio));
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
  function dot(ctx, x, y, r, color, hollow) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (hollow) {
      ctx.fillStyle = '#0a0f17';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }
  function text(ctx, str, x, y, color, size, align) {
    ctx.save();
    ctx.fillStyle = color || '#8b949e';
    ctx.font = (size || 11) + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /* ================================================================
   *  1. ε-N 数列极限
   * ================================================================ */
  const SEQ_PRESETS = [
    { tex: 'aₙ = 1/n', L: 0, f: (n) => 1 / n, N: (e) => Math.ceil(1 / e), Ntex: 'N = ⌈1/ε⌉', div: false,
      note: 'ε=0.2 时 N=5，ε=0.01 时 N=100：ε 任意小，N 就跟着变大，但总能取到。' },
    { tex: 'aₙ = n/(n+1)', L: 1, f: (n) => n / (n + 1), N: (e) => Math.ceil(1 / e), Ntex: 'N = ⌈1/ε⌉', div: false,
      note: '|n/(n+1) − 1| = 1/(n+1) < 1/n，取同样的 N 就够用。N 不唯一，也不必最小。' },
    { tex: 'aₙ = 1 + (−1)ⁿ/n', L: 1, f: (n) => 1 + Math.pow(-1, n) / n, N: (e) => Math.ceil(1 / e), Ntex: 'N = ⌈1/ε⌉', div: false,
      note: '正负交替摆动，但摆幅 1/n → 0，所以照样收敛。振荡不破坏收敛性。' },
    { tex: 'aₙ = 1/2ⁿ', L: 0, f: (n) => Math.pow(2, -n), N: (e) => Math.ceil(Math.log2(1 / e)), Ntex: 'N = ⌈log₂(1/ε)⌉', div: false,
      note: '指数衰减收敛很快：ε=0.001 时 N 只要 10。' },
    { tex: 'aₙ = sin n / n', L: 0, f: (n) => Math.sin(n) / n, N: (e) => Math.ceil(1 / e), Ntex: 'N = ⌈1/ε⌉', div: false,
      note: '“无穷小 × 有界量 = 无穷小”：分子振荡不影响结论。' },
    { tex: 'aₙ = 1 − 10⁻ⁿ', L: 1, f: (n) => 1 - Math.pow(10, -n), N: (e) => Math.ceil(Math.log10(1 / e)), Ntex: 'N = ⌈lg(1/ε)⌉', div: false,
      note: '0.9, 0.99, 0.999… 趋向 1，但每一项都不等于 1。极限与“取到”无关。' },
    { tex: 'aₙ = (−1)ⁿ(1 + 1/n)', L: 1, f: (n) => Math.pow(-1, n) * (1 + 1 / n), N: () => Infinity, Ntex: '不存在', div: true,
      note: '假设极限是 L=1：偶数项接近 1，但奇数项接近 −1，偏差约 2 永远跑出 ε 带。' },
    { tex: 'aₙ = (−1)ⁿ', L: 1, f: (n) => Math.pow(-1, n), N: () => Infinity, Ntex: '不存在', div: true,
      note: '对任意 N，第 N+1 项仍在 ±1 之间跳，无法进入任意小的 ε 带。' }
  ];

  const seq = { canvas: $('#seqCanvas'), idx: 0, eps: 0.2, nmax: 60 };

  function seqEps() { return +$('#seqEps').value / 1000; }
  function seqNmax() { return +$('#seqNmax').value; }

  function drawSeq() {
    const { ctx, w, h } = prep(seq.canvas, 0.5);
    const p = SEQ_PRESETS[seq.idx];
    const eps = seqEps(), nmax = seqNmax(), L = p.L;

    // 数据范围
    let lo = Infinity, hi = -Infinity;
    for (let n = 1; n <= nmax; n++) { const v = p.f(n); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    lo = Math.min(lo, L - eps); hi = Math.max(hi, L + eps);
    const pad = (hi - lo) * 0.12 || 0.5;
    lo -= pad; hi += pad;
    const pL = 62, pR = 24, pT = 18, pB = 34;
    const X = (n) => pL + ((n - 1) / Math.max(1, nmax - 1)) * (w - pL - pR);
    const Y = (v) => h - pB - ((v - lo) / (hi - lo)) * (h - pT - pB);

    // ε 带
    ctx.save();
    ctx.fillStyle = 'rgba(77,159,255,.13)';
    ctx.fillRect(pL, Y(L + eps), w - pL - pR, Y(L - eps) - Y(L + eps));
    ctx.restore();
    line(ctx, pL, Y(L), w - pR, Y(L), 'rgba(77,159,255,.75)', 1.4, [6, 4]);
    text(ctx, 'L = ' + fmt(L, 3), pL - 6, Y(L), '#4d9fff', 11.5, 'right');
    text(ctx, 'L+ε', pL - 6, Y(L + eps), '#3d7fbf', 10.5, 'right');
    text(ctx, 'L−ε', pL - 6, Y(L - eps), '#3d7fbf', 10.5, 'right');

    // 坐标轴
    line(ctx, pL, h - pB, w - pR, h - pB, '#2b3441', 1);
    line(ctx, pL, pT, pL, h - pB, '#2b3441', 1);
    const step = nmax <= 40 ? 5 : nmax <= 100 ? 10 : 20;
    for (let n = 1; n <= nmax; n += step) {
      line(ctx, X(n), h - pB, X(n), h - pB + 4, '#2b3441', 1);
      text(ctx, String(n), X(n), h - pB + 14, '#5b6673', 10.5, 'center');
    }
    text(ctx, 'n', w - pR + 6, h - pB + 14, '#5b6673', 11, 'left');

    // N 竖线
    const N = p.N(eps);
    let verdictOk = true, maxDev = 0;
    if (isFinite(N) && N < nmax) {
      line(ctx, X(N + 0.001), pT, X(N + 0.001), h - pB, 'rgba(63,185,80,.55)', 1.4, [5, 4]);
      text(ctx, 'N=' + N, X(N + 0.001) + 6, pT + 8, '#3fb950', 11);
    }

    // 数据点
    for (let n = 1; n <= nmax; n++) {
      const v = p.f(n), x = X(n), y = Y(v);
      const inBand = Math.abs(v - L) < eps;
      let color = '#5b6673';
      if (p.div) color = inBand ? '#8b949e' : '#ff6b6b';
      else if (n > N) color = '#4d9fff';
      if (n > N && !inBand && !p.div) color = '#ff6b6b';
      dot(ctx, x, y, n > N ? 3.4 : 2.4, color);
    }

    // 判定
    if (!p.div) {
      maxDev = 0;
      for (let n = Math.floor(N) + 1; n <= Math.min(Math.floor(N) + 4000, 60000); n++) {
        maxDev = Math.max(maxDev, Math.abs(p.f(n) - L));
      }
      verdictOk = maxDev < eps;
      $('#seqReadout').innerHTML =
        '<div><b>' + p.tex + '</b>，候选极限 L = ' + fmt(L, 3) + '</div>' +
        '<div>取 ε = ' + fmt(eps, 3) + ' 时，<span class="ok">N = ' + N + '</span>（' + p.Ntex + '，不唯一）</div>' +
        '<div>验算：n &gt; N 时 max |aₙ − L| = <span class="' + (verdictOk ? 'ok' : 'bad') + '">' +
        fmt(maxDev, 4) + '</span> ' + (verdictOk ? '&lt; ε ✔ 全部落入蓝带' : '≥ ε ✘') + '</div>' +
        '<div class="hint" style="margin-top:6px">' + p.note + '</div>';
    } else {
      // 极限不存在：反证必须先给一个具体的 N，再取 n > N 违反 ε 带
      const Ncase = isFinite(N) ? Math.floor(N) : 10;
      const startN = Ncase + 1;
      let maxDevDiv = 0, whichN = startN;
      for (let n = startN; n <= startN + 400; n++) {
        const dev = Math.abs(p.f(n) - L);
        if (dev > maxDevDiv) { maxDevDiv = dev; whichN = n; }
      }
      $('#seqReadout').innerHTML =
        '<div><b>' + p.tex + '</b>：<span class="bad">极限不存在</span></div>' +
        '<div>反证：假设极限为 L = ' + fmt(L, 3) + '，取 ε = ' + fmt(eps, 3) + '。' +
        '无论 N 取多大，总存在 n &gt; N 落出 ε 带：取 N = ' + Ncase +
        '，则 n = ' + whichN + '（&gt; N）时 |aₙ − L| = ' +
        '<span class="bad">' + fmt(maxDevDiv, 3) + '</span> ≥ ε，红点跑出蓝带。</div>' +
        '<div class="hint" style="margin-top:6px">' + p.note + '</div>';
    }
  }

  /* ================================================================
   *  2. ε-δ 函数极限
   * ================================================================ */
  const FUN_PRESETS = [
    { tex: 'f(x) = 2x + 1，x₀ = 1', f: (x) => 2 * x + 1, x0: 1, L: 3, dom: [-1, 3],
      d: (e) => e / 2, dtex: 'δ = ε/2', note: '线性函数的误差与 δ 成正比：|f(x)−3| = 2|x−1|，所以 δ = ε/2 恰好够。' },
    { tex: 'f(x) = x²，x₀ = 2', f: (x) => x * x, x0: 2, L: 4, dom: [0, 4],
      d: (e) => Math.min(1, e / 5), dtex: 'δ = min(1, ε/5)', note: '先限制 δ ≤ 1 把 |x+2| ≤ 5 放大成常数，再取 δ = ε/5。这是“放大法”的标准套路。' },
    { tex: 'f(x) = sin x，x₀ = 0', f: Math.sin, x0: 0, L: 0, dom: [-2, 2],
      d: (e) => e, dtex: 'δ = ε', note: '利用 |sin x| ≤ |x|，取 δ = ε 即可。' },
    { tex: 'f(x) = x·sin(1/x)（x≠0），x₀ = 0', f: (x) => (Math.abs(x) < 1e-12 ? NaN : x * Math.sin(1 / x)), x0: 0, L: 0, dom: [-1, 1],
      d: (e) => e, dtex: 'δ = ε', note: '在 0 附近无限次振荡，但振幅被 |x| 压住，所以极限仍是 0。' },
    { tex: 'f(x) = (x²−1)/(x−1)，x₀ = 1', f: (x) => (Math.abs(x - 1) < 1e-12 ? NaN : (x * x - 1) / (x - 1)), x0: 1, L: 2, dom: [-1, 3],
      d: (e) => e, dtex: 'δ = ε', note: '可去间断点：函数在 x₀ 处根本无定义/取值不同，但极限照样存在——极限与函数值无关。' },
    { tex: 'f(x) = 0 (x<0)，f(x) = 1 (x≥0)，x₀ = 0', f: (x) => (x < 0 ? 0 : 1), x0: 0, L: 1, dom: [-1, 1], div: true,
      d: () => Infinity, dtex: '不存在这样的 δ', note: '左极限 0、右极限 1，二者不等 → 在 0 处极限不存在。任何 δ>0 都会把 x<0 的点圈进来，而那里 |f(x)−1| = 1。' }
  ];

  const fun = { canvas: $('#funCanvas'), idx: 0 };

  function funEps() { return +$('#funEps').value / 100; }
  function funDelta() { return +$('#funDelta').value / 100; }

  function drawFun() {
    const { ctx, w, h } = prep(fun.canvas, 0.55);
    const p = FUN_PRESETS[fun.idx];
    const eps = funEps(), delta = funDelta(), x0 = p.x0, L = p.L;
    const span = Math.max(6 * delta, 0.15);
    const lo = Math.max(p.dom[0], x0 - span), hi = Math.min(p.dom[1], x0 + span);
    const a = Math.min(lo, x0 - 0.05), b = Math.max(hi, x0 + 0.05);

    // 采样
    const pts = [];
    for (let i = 0; i <= 1200; i++) {
      const x = a + (b - a) * i / 1200;
      const y = p.f(x);
      if (isFinite(y)) pts.push([x, y]);
    }
    let ylo = L - 2.5 * eps, yhi = L + 2.5 * eps;
    pts.forEach(([, y]) => { if (Math.abs(y - L) < 50 * eps + 5) { ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); } });
    const pL = 58, pR = 22, pT = 18, pB = 34;
    const X = (x) => pL + ((x - a) / (b - a)) * (w - pL - pR);
    const Y = (y) => h - pB - ((y - ylo) / (yhi - ylo)) * (h - pT - pB);

    // ε 带
    ctx.save();
    ctx.fillStyle = 'rgba(77,159,255,.13)';
    ctx.fillRect(pL, Y(L + eps), w - pL - pR, Y(L - eps) - Y(L + eps));
    ctx.restore();
    line(ctx, pL, Y(L + eps), w - pR, Y(L + eps), 'rgba(77,159,255,.6)', 1, [5, 4]);
    line(ctx, pL, Y(L - eps), w - pR, Y(L - eps), 'rgba(77,159,255,.6)', 1, [5, 4]);

    // δ 窗口
    const dl = Math.max(a, x0 - delta), dr = Math.min(b, x0 + delta);
    ctx.save();
    ctx.fillStyle = 'rgba(163,113,247,.10)';
    ctx.fillRect(X(dl), pT, X(dr) - X(dl), h - pT - pB);
    ctx.restore();
    line(ctx, X(x0 - delta), pT, X(x0 - delta), h - pB, 'rgba(163,113,247,.7)', 1.2, [4, 4]);
    line(ctx, X(x0 + delta), pT, X(x0 + delta), h - pB, 'rgba(163,113,247,.7)', 1.2, [4, 4]);
    text(ctx, 'x₀−δ', X(x0 - delta) - 4, pT + 9, '#a371f7', 10.5, 'right');
    text(ctx, 'x₀+δ', X(x0 + delta) + 4, pT + 9, '#a371f7', 10.5, 'left');

    // 坐标轴
    line(ctx, pL, Y(clamp(0, ylo, yhi)), w - pR, Y(clamp(0, ylo, yhi)), '#2b3441', 1);
    line(ctx, X(x0), pT, X(x0), h - pB, 'rgba(139,148,158,.35)', 1);

    // 曲线
    ctx.save();
    ctx.strokeStyle = '#4d9fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    pts.forEach(([x, y]) => {
      if (!started) { ctx.moveTo(X(x), Y(y)); started = true; } else ctx.lineTo(X(x), Y(y));
    });
    ctx.stroke();
    ctx.restore();

    // 采样判定
    let maxDev = 0, bad = 0;
    for (let i = 1; i <= 120; i++) {
      const x = x0 - delta + (2 * delta) * i / 121;
      if (Math.abs(x - x0) < 1e-9) continue;
      const y = p.f(x);
      if (!isFinite(y)) continue;
      const dev = Math.abs(y - L);
      maxDev = Math.max(maxDev, dev);
      if (dev < eps) { dot(ctx, X(x), Y(y), 2, 'rgba(77,159,255,.85)'); }
      else { bad++; dot(ctx, X(x), Y(y), 2.6, '#ff6b6b'); }
    }

    // 极限点
    dot(ctx, X(x0), Y(L), 5, '#3fb950', true);
    text(ctx, '(x₀, L)', X(x0) + 8, Y(L) - 12, '#3fb950', 10.5);

    const ok = bad === 0;
    let verdict;
    if (p.div) {
      // 左右极限不等的跳跃函数：能否合格取决于 ε，不能一律说“任何 δ 都不合格”
      verdict = ok
        ? '本 ε 下这个 δ <b>恰好合格</b>；但取更小的 ε（ε &lt; 1）后不存在任何 δ —— 左右极限 0 与 1 不相等，故极限不存在'
        : '任何 δ 都不合格 → 极限不存在（' + bad + ' 个点跑出 ε 带）';
    } else if (ok) verdict = '&lt; ε ✔ 这个 δ 合格';
    else verdict = '≥ ε ✘ 红点 ' + bad + ' 个，δ 还太大';
    $('#funReadout').innerHTML =
      '<div>ε = ' + fmt(eps, 3) + '，δ = ' + fmt(delta, 3) + '</div>' +
      '<div>窗口内最大偏差 max|f(x)−L| = <span class="' + (ok ? 'ok' : 'bad') + '">' + fmt(maxDev, 4) + '</span> ' + verdict + '</div>' +
      '<div>理论构造：' + p.dtex + '</div>' +
      '<div class="hint" style="margin-top:6px">' + p.note + '</div>';
  }

  /* ================================================================
   *  3. 中值定理
   * ================================================================ */
  const MVT_PRESETS = [
    { tex: 'f(x) = x³ − 3x', f: (x) => x * x * x - 3 * x, df: (x) => 3 * x * x - 3, dom: [-2, 2], smooth: true,
      note: 'f′ 是抛物线，驻点 ±1。拖动端点，看割线斜率变化时中值点如何游走。' },
    { tex: 'f(x) = x²', f: (x) => x * x, df: (x) => 2 * x, dom: [-2, 2], smooth: true,
      note: '抛物线：中值点恰好是区间中点 (a+b)/2。' },
    { tex: 'f(x) = sin x', f: Math.sin, df: Math.cos, dom: [-3.2, 3.2], smooth: true,
      note: '区间够长时会出现多个中值点——定理只说“至少存在一个”。' },
    { tex: 'f(x) = ln x', f: Math.log, df: (x) => 1 / x, dom: [0.1, 4], smooth: true,
      note: '对数函数：区间必须落在定义域 (0, +∞) 内，这是定理前提。' },
    { tex: 'f(x) = |x|', f: Math.abs, df: (x) => (x > 0 ? 1 : x < 0 ? -1 : NaN), dom: [-2, 2], smooth: false,
      note: '在 x=0 不可导：区间一旦跨过 0，拉格朗日定理条件不满足，结论可能失效。' }
  ];

  const mvt = { canvas: $('#mvtCanvas'), idx: 0, a: -1, b: 2 };

  function mvtA() { return +$('#mvtA').value / 100; }
  function mvtB() { return +$('#mvtB').value / 100; }

  function rootFind(fn, a, b, n) {
    const roots = [];
    let px = a, pv = fn(a);
    for (let i = 1; i <= n; i++) {
      const x = a + (b - a) * i / n, v = fn(x);
      if (isFinite(pv) && isFinite(v)) {
        if (v === 0) { if (!roots.some((r) => Math.abs(r - x) < 1e-7)) roots.push(x); }
        else if (pv * v < 0) {
          let lo = px, hi = x, flo = pv;
          for (let j = 0; j < 70; j++) {
            const m = (lo + hi) / 2, fm = fn(m);
            if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; }
          }
          const r = (lo + hi) / 2;
          if (!roots.some((q) => Math.abs(q - r) < 1e-7)) roots.push(r);
        }
      }
      px = x; pv = v;
    }
    return roots.sort((u, v) => u - v);
  }

  function drawMVT() {
    const { ctx, w, h } = prep(mvt.canvas, 0.55);
    const p = MVT_PRESETS[mvt.idx];
    let a = mvtA(), b = mvtB();
    if (p.dom[0] >= 0) { a = Math.max(a, p.dom[0]); b = Math.max(b, p.dom[0] + 0.2); }
    if (b <= a + 0.08) b = a + 0.08;
    b = Math.min(b, p.dom[1]);
    if (b <= a + 0.05) { a = Math.max(p.dom[0], b - 0.1); }

    const fa = p.f(a), fb = p.f(b);
    const k = (fb - fa) / (b - a);
    const roots = rootFind((x) => p.df(x) - k, a, b, 600);

    let ylo = Math.min(fa, fb), yhi = Math.max(fa, fb);
    for (let i = 0; i <= 400; i++) {
      const x = a + (b - a) * i / 400, y = p.f(x);
      if (isFinite(y)) { ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
    }
    const pad = (yhi - ylo) * 0.22 || 1;
    ylo -= pad; yhi += pad;
    const pL = 58, pR = 24, pT = 18, pB = 34;
    const X = (x) => pL + ((x - p.dom[0]) / (p.dom[1] - p.dom[0])) * (w - pL - pR);
    const Y = (y) => h - pB - ((y - ylo) / (yhi - ylo)) * (h - pT - pB);

    // 区间底色
    ctx.save();
    ctx.fillStyle = 'rgba(77,159,255,.07)';
    ctx.fillRect(X(a), pT, X(b) - X(a), h - pT - pB);
    ctx.restore();

    // 坐标轴
    if (ylo < 0 && yhi > 0) line(ctx, pL, Y(0), w - pR, Y(0), '#2b3441', 1);
    line(ctx, X(0), pT, X(0), h - pB, '#2b3441', 1);

    // 曲线
    ctx.save();
    ctx.strokeStyle = '#4d9fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 900; i++) {
      const x = p.dom[0] + (p.dom[1] - p.dom[0]) * i / 900, y = p.f(x);
      if (!isFinite(y)) { started = false; continue; }
      if (!started) { ctx.moveTo(X(x), Y(y)); started = true; } else ctx.lineTo(X(x), Y(y));
    }
    ctx.stroke();
    ctx.restore();

    // 割线
    line(ctx, X(a), Y(fa), X(b), Y(fb), '#a371f7', 1.6, [7, 5]);
    dot(ctx, X(a), Y(fa), 4, '#a371f7');
    dot(ctx, X(b), Y(fb), 4, '#a371f7');
    text(ctx, 'A(' + fmt(a, 2) + ', ' + fmt(fa, 2) + ')', X(a) - 6, Y(fa) + 14, '#a371f7', 10.5, 'right');
    text(ctx, 'B(' + fmt(b, 2) + ', ' + fmt(fb, 2) + ')', X(b) + 6, Y(fb) + 14, '#a371f7', 10.5, 'left');

    // 切线（若 f′≡k，区间内每点都满足，只画三处示意，避免刷屏）
    const everywhere = roots.length > 30;
    (everywhere ? roots.slice(0, 3) : roots).forEach((r) => {
      const fr = p.f(r), dr = p.df(r);
      if (!isFinite(dr)) return;
      const dx = (b - a) * 0.16;
      line(ctx, X(r - dx), Y(fr - dr * dx), X(r + dx), Y(fr + dr * dx), '#f0883e', 1.6);
      dot(ctx, X(r), Y(fr), 4.5, '#3fb950');
      text(ctx, 'ξ=' + fmt(r, 3), X(r) + 6, Y(fr) - 12, '#3fb950', 10.5);
    });

    // 判定
    const condOk = p.smooth || !(a < 0 && b > 0);
    const hasRoot = roots.length > 0;
    let html =
      '<div>[a, b] = [' + fmt(a, 2) + ', ' + fmt(b, 2) + ']，f(a) = ' + fmt(fa, 3) + '，f(b) = ' + fmt(fb, 3) + '</div>' +
      '<div>割线斜率 k = (f(b)−f(a))/(b−a) = <b>' + fmt(k, 4) + '</b></div>' +
      '<div>可导条件：' + (condOk ? '<span class="ok">满足</span>' : '<span class="bad">不满足（区间内含 x=0，f 在该点不可导）</span>') + '</div>';
    if (everywhere) {
      html += '<div>本区间内 f′ ≡ k = <b>' + fmt(k, 4) + '</b>，' +
        '<span class="ok">每一点都是中值点</span>（定理只要求“至少存在一个”，这里不逐一列出）。</div>';
    } else if (hasRoot) {
      html += '<div>找到 ' + roots.length + ' 个中值点：' +
        roots.map((r) => '<code>ξ=' + fmt(r, 4) + '</code>').join('、') +
        '<span class="ok"> ✔ f′(ξ)=k</span></div>';
    } else {
      html += '<div>' + (condOk
        ? '<span class="warn">数值搜索没找到 f′(ξ)=k 的点（可能太靠近端点，试试调整区间）</span>'
        : '<span class="bad">没有 f′(ξ)=k 的点 → 定理条件不满足时结论确实会失效</span>') + '</div>';
    }
    html += '<div class="hint" style="margin-top:6px">' + p.note + '</div>';
    $('#mvtReadout').innerHTML = html;
  }

  /* ================================================================
   *  4. 知识卡片
   * ================================================================ */
  const CARDS = [
    { t: 'ε-N 定义里的 N', front: '任给 ε>0，存在 N，当 n>N 时 |aₙ−L|<ε。',
      back: 'N 只要求“存在”，不要求最小，也不要求对每个 n 都成立——只要求 N 之后的所有项。ε 变了，N 可以变。', tag: '定义' },
    { t: '无穷小 × 有界量', front: '若 bₙ 有界且 lim aₙ = 0，则 lim aₙbₙ = 0。',
      back: '反例感受：aₙ=1/n 与 bₙ=(−1)ⁿ 相乘仍趋于 0；但 bₙ 无界时失效，如 1/n · n² = n。', tag: '法则' },
    { t: '可导 ⇒ 连续', front: '在一点可导必在该点连续。',
      back: '反之不成立：y=|x| 在 0 连续但不可导。原因是左右差商分别为 1 与 −1，极限不存在。', tag: '易错' },
    { t: '连续 ≠ 可导', front: '用户最常写错的结论。',
      back: '魏尔斯特拉斯函数处处连续、处处不可导。所以“连续函数一定可导”是典型 AI 错误。', tag: '易错' },
    { t: '洛必达失效', front: 'lim(x→∞)(x+sin x)/x = ?',
      back: '直接求导得 (1+cos x)/1，振荡不存在，但原式 = 1+sin x/x → 1。求导后极限不存在时，洛必达不能下结论。', tag: '反例' },
    { t: '归结原则（海涅）', front: 'lim f(x)=A 当且仅当对任何 xₙ→x₀（xₙ≠x₀）都有 f(xₙ)→A。',
      back: '用来证极限不存在：找两个子列给出不同极限即可，如 (−1)ⁿ。', tag: '定理' },
    { t: '极限与函数值无关', front: '(x²−1)/(x−1) 在 x=1 处的极限是 2。',
      back: '函数在 x₀ 处甚至可以没有定义。极限只关心去心邻域内的趋势，不关心该点取值。', tag: '定义' },
    { t: '单调有界准则', front: '单调递增且有上界的数列必收敛。',
      back: '只给存在性，不给极限值。如 aₙ=(1+1/n)ⁿ 单增有上界，极限是 e。', tag: '定理' },
    { t: '两个重要极限', front: 'lim(x→0) sin x/x = 1；lim(n→∞)(1+1/n)ⁿ = e。',
      back: '前者不能对分子分母分别求导后“约掉”得出结论（那是循环论证），标准证法用面积夹逼。', tag: '定理' },
    { t: '一致连续 vs 连续', front: '连续是逐点的，δ 依赖于 ε 和 x₀；一致连续的 δ 只依赖 ε。',
      back: '1/x 在 (0,1) 上连续但不一致连续：x 越靠近 0，同样的 ε 需要越小的 δ。', tag: '辨析' },
    { t: '极值点导数为零的逆', front: 'f′(x₀)=0 不能推出 x₀ 是极值点。',
      back: '反例 f(x)=x³ 在 0 处导数为 0，但 0 不是极值点，只是拐点。', tag: '易错' },
    { t: '中值定理的条件', front: '拉格朗日：在 [a,b] 连续、(a,b) 可导。',
      back: '两个条件缺一不可。|x| 在 [−1,1]：连续但 0 处不可导，且找不到 f′(ξ)=0。', tag: '条件' }
  ];

  function renderCards() {
    const grid = $('#cardsGrid');
    $('#cardCount').textContent = CARDS.length;
    grid.innerHTML = CARDS.map((c, i) =>
      '<div class="card" data-i="' + i + '"><div class="card-inner">' +
      '<div class="card-face front"><h3>' + c.t + '</h3><p>' + c.front + '</p><span class="tag">' + c.tag + ' · 点击翻面</span></div>' +
      '<div class="card-face back"><h3>' + c.t + '</h3><p>' + c.back + '</p><span class="tag">' + c.tag + '</span></div>' +
      '</div></div>').join('');
    grid.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => el.classList.toggle('flipped'));
    });
  }

  /* ================================================================
   *  5. 错题本
   * ================================================================ */
  const NOTE_KEY = 'mathlab.notes.v1';
  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(NOTE_KEY)) || []; } catch (e) { return []; }
  }
  function saveNotes(list) { localStorage.setItem(NOTE_KEY, JSON.stringify(list)); }
  function renderNotes() {
    const list = loadNotes();
    const ul = $('#noteList');
    if (!list.length) { ul.innerHTML = '<li class="empty">还没有记录。把点击本页时发现的错误、以及 AI 说错的地方记下来。</li>'; return; }
    ul.innerHTML = list.map((n, i) =>
      '<li class="note-item"><h4>' + escapeHtml(n.title) + '</h4><p>' + escapeHtml(n.body) + '</p>' +
      '<div class="meta"><span>' + n.time + '</span><button data-del="' + i + '">删除</button></div></li>').join('');
    ul.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const l = loadNotes(); l.splice(+btn.dataset.del, 1); saveNotes(l); renderNotes();
      });
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /* ================================================================
   *  绑定与初始化
   * ================================================================ */
  function fillSelect(sel, presets) {
    sel.innerHTML = presets.map((p, i) => '<option value="' + i + '">' + p.tex + '</option>').join('');
  }

  function redrawAll() {
    const active = document.querySelector('.view.active');
    if (!active) return;
    if (active.id === 'view-seq') drawSeq();
    else if (active.id === 'view-fun') drawFun();
    else if (active.id === 'view-mvt') drawMVT();
  }

  function init() {
    // tabs
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
        document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + t.dataset.view));
        redrawAll();
      });
    });

    // seq
    fillSelect($('#seqPreset'), SEQ_PRESETS);
    $('#seqPreset').addEventListener('change', () => { seq.idx = +$('#seqPreset').value; drawSeq(); });
    $('#seqEps').addEventListener('input', () => {
      $('#seqEpsVal').textContent = fmt(seqEps(), 3);
      drawSeq();
    });
    $('#seqNmax').addEventListener('input', () => {
      $('#seqNmaxVal').textContent = $('#seqNmax').value;
      drawSeq();
    });

    // fun
    fillSelect($('#funPreset'), FUN_PRESETS);
    $('#funPreset').addEventListener('change', () => {
      fun.idx = +$('#funPreset').value;
      const p = FUN_PRESETS[fun.idx];
      const d = p.d(funEps());
      $('#funDelta').value = isFinite(d) ? clamp(Math.round(d * 100), 1, 200) : 1;
      $('#funDeltaVal').textContent = fmt(funDelta(), 3);
      drawFun();
    });
    $('#funEps').addEventListener('input', () => { $('#funEpsVal').textContent = fmt(funEps(), 3); drawFun(); });
    $('#funDelta').addEventListener('input', () => { $('#funDeltaVal').textContent = fmt(funDelta(), 3); drawFun(); });
    $('#funAuto').addEventListener('click', () => {
      const p = FUN_PRESETS[fun.idx];
      const d = p.d(funEps());
      if (!isFinite(d)) { alert('这个函数在该点极限不存在：任给 ε>0 都找不到合适的 δ。'); return; }
      $('#funDelta').value = clamp(Math.round(d * 100), 1, 200);
      $('#funDeltaVal').textContent = fmt(funDelta(), 3);
      drawFun();
    });
    $('#funReset').addEventListener('click', () => {
      fun.idx = 0; $('#funPreset').value = '0';
      $('#funEps').value = 50; $('#funDelta').value = 10;
      $('#funEpsVal').textContent = '0.500'; $('#funDeltaVal').textContent = '0.100';
      drawFun();
    });

    // mvt
    fillSelect($('#mvtPreset'), MVT_PRESETS);
    $('#mvtPreset').addEventListener('change', () => {
      mvt.idx = +$('#mvtPreset').value;
      const p = MVT_PRESETS[mvt.idx];
      $('#mvtA').value = Math.round(Math.max(p.dom[0], -1) * 100);
      $('#mvtB').value = Math.round(Math.min(p.dom[1], 2) * 100);
      $('#mvtAVal').textContent = fmt(mvtA(), 2);
      $('#mvtBVal').textContent = fmt(mvtB(), 2);
      drawMVT();
    });
    ['mvtA', 'mvtB'].forEach((id) => {
      $('#' + id).addEventListener('input', () => {
        $('#mvtAVal').textContent = fmt(mvtA(), 2);
        $('#mvtBVal').textContent = fmt(mvtB(), 2);
        drawMVT();
      });
    });
    $('#mvtRolle').addEventListener('change', () => {
      const on = $('#mvtRolle').checked;
      const p = MVT_PRESETS[mvt.idx];
      if (on) {
        const a = mvtA(), fa = p.f(a);
        let found = null;
        for (let x = a + 0.15; x <= p.dom[1]; x += 0.01) {
          if (Math.abs(p.f(x) - fa) < 2e-3) { found = x; break; }
        }
        if (found !== null) {
          $('#mvtB').value = Math.round(found * 100);
          $('#mvtBVal').textContent = fmt(mvtB(), 2);
        }
      }
      drawMVT();
    });

    // notes
    $('#noteForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('#noteTitle').value.trim(), body = $('#noteBody').value.trim();
      if (!title || !body) return;
      const list = loadNotes();
      const now = new Date();
      list.push({ title, body, time: now.toLocaleString('zh-CN') });
      saveNotes(list);
      $('#noteTitle').value = ''; $('#noteBody').value = '';
      renderNotes();
    });

    // init values
    $('#seqEpsVal').textContent = fmt(seqEps(), 3);
    $('#seqNmaxVal').textContent = $('#seqNmax').value;
    $('#funEpsVal').textContent = fmt(funEps(), 3);
    $('#funDeltaVal').textContent = fmt(funDelta(), 3);
    $('#mvtAVal').textContent = fmt(mvtA(), 2);
    $('#mvtBVal').textContent = fmt(mvtB(), 2);

    renderCards();
    renderNotes();

    // 支持 #fun / #mvt / #cards 直接定位到某个模块（方便课堂演示与截图）
    const h = location.hash.replace('#', '');
    const target = document.querySelector('.tab[data-view="' + h + '"]');
    if (target) target.click();

    let raf = null;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(redrawAll);
    });
    redrawAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
