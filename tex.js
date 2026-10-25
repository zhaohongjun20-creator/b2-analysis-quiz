/* tex.js —— 轻量 LaTeX 子集渲染器（零依赖，离线可用）
 *
 * 为什么不用 KaTeX：内网/离线环境装不上 npm 包，作品又必须“双击 index.html 就能跑”。
 * 所以只实现题库用到的子集：分式、根式、上下标、lim/∑ 带下标、希腊字母与常用符号。
 * 遇到不认识的命令就原样保留，不会把整页渲染搞崩。
 */
(function (global) {
  'use strict';

  const SYMBOLS = {
    '\\pi': 'π', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\theta': 'θ',
    '\\lambda': 'λ', '\\mu': 'μ', '\\xi': 'ξ', '\\Delta': 'Δ', '\\sigma': 'σ',
    '\\infty': '∞', '\\to': '→', '\\rightarrow': '→', '\\Rightarrow': '⇒',
    '\\times': '×', '\\cdot': '·', '\\pm': '±', '\\mp': '∓',
    '\\le': '≤', '\\leq': '≤', '\\ge': '≥', '\\geq': '≥', '\\ne': '≠', '\\neq': '≠',
    '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\cup': '∪', '\\cap': '∩',
    '\\sum': '∑', '\\int': '∫', '\\iint': '∬', '\\oint': '∮', '\\partial': '∂',
    '\\ln': 'ln', '\\log': 'log', '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan',
    '\\exp': 'exp', '\\lim': 'lim', '\\max': 'max', '\\min': 'min', '\\arcsin': 'arcsin',
    '\\arccos': 'arccos', '\\arctan': 'arctan',
    '\\dots': '…', '\\ldots': '…', '\\cdots': '⋯', '\\quad': '\u2003', '\\qquad': '\u2003\u2003',
    '\\,': '\u2009', '\\;': '\u2005', '\\!': '', '\\ ': ' ',
    '\\{': '{', '\\}': '}', '\\%': '%', '\\$': '$', '\\_': '_', '\\#': '#'
  };
  const OPS = new Set(['lim', 'max', 'min', 'ln', 'log', 'sin', 'cos', 'tan', 'exp', 'arcsin', 'arccos', 'arctan']);

  function readGroup(s, i) {
    // s[i] 必须是 '{'
    let depth = 0, start = i + 1;
    for (; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') {
        depth--;
        if (depth === 0) return { content: s.slice(start, i), end: i + 1 };
      }
    }
    return null;
  }

  // 读取一个参数：{...} 或单个字符/命令（如 \frac1x 的 1 与 x）
  function readArg(s, i) {
    while (s[i] === ' ') i++;
    if (s[i] === '{') {
      const g = readGroup(s, i);
      if (g) return g;
    }
    if (s[i] === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      if (m) return { content: m[0], end: i + m[0].length };
    }
    if (s[i] === undefined) return { content: '', end: i };
    return { content: s[i], end: i + 1 };
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 递归处理一层结构：先处理 \frac/\dfrac/\sqrt/\lim 等，再交给上层
  function render(s) {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        // 非字母命令：\, \; \! \( \) 等
        const two = s.slice(i, i + 2);
        if (SYMBOLS[two] !== undefined) {
          out += '<span class="sym">' + SYMBOLS[two] + '</span>';
          i += 2;
          continue;
        }
        if (s[i + 1] === '\\') { out += '<br>'; i += 2; continue; }
        // 命令名
        let m = /^\\([A-Za-z]+)/.exec(s.slice(i));
        if (m) {
          const cmd = m[1];
          const full = '\\' + cmd;
          let j = i + m[0].length;
          // 只影响排版、不产生内容的命令
          if (cmd === 'displaystyle' || cmd === 'textstyle' || cmd === 'limits' ||
              cmd === 'left' || cmd === 'right' || cmd === 'big' || cmd === 'Big') {
            i = j;
            continue;
          }
          if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
            while (s[j] === ' ') j++;
            const g1 = readArg(s, j);
            let k = g1.end;
            while (s[k] === ' ') k++;
            const g2 = readArg(s, k);
            out += '<span class="frac"><span class="num">' + render(g1.content) +
                   '</span><span class="den">' + render(g2.content) + '</span></span>';
            i = g2.end;
            continue;
          }
          if (cmd === 'sqrt') {
            while (s[j] === ' ') j++;
            const g = readArg(s, j);
            out += '<span class="sqrt">√<span class="sqrt-body">' + render(g.content) + '</span></span>';
            i = g.end;
            continue;
          }
          if (OPS.has(cmd)) {
            // \lim_{x\to0} 或 \lim\limits_{...} 或 \sum_{n=1}^{\infty}
            let rest = s.slice(j);
            let sub = null, sup = null, used = j;
            let mm = /^\\limits/.exec(rest);
            if (mm) { used += mm[0].length; rest = s.slice(used); }
            while (rest[0] === ' ') { used++; rest = s.slice(used); }
            if (rest[0] === '_') {
              const gg = rest[1] === '{' ? readGroup(s, used + 1) : null;
              if (gg) { sub = gg.content; used = gg.end; rest = s.slice(used); }
            }
            while (rest[0] === ' ') { used++; rest = s.slice(used); }
            if (rest[0] === '^') {
              const gg = rest[1] === '{' ? readGroup(s, used + 1) : null;
              if (gg) { sup = gg.content; used = gg.end; rest = s.slice(used); }
            }
            const name = SYMBOLS[full] || cmd;
            out += '<span class="op"><span class="op-sup">' + (sup ? render(sup) : '') + '</span>' +
                   '<span class="op-name">' + name + '</span>' +
                   '<span class="op-sub">' + (sub ? render(sub) : '') + '</span></span>';
            i = used;
            continue;
          }
          if (SYMBOLS[full] !== undefined) {
            out += '<span class="sym">' + SYMBOLS[full] + '</span>';
            i = j;
            continue;
          }
          out += esc(cmd);
          i = j;
          continue;
        }
        // \( \) \[ \] 之类直接丢掉反斜杠
        out += esc(s[i + 1] || '');
        i += 2;
        continue;
      }
      if (c === '^' || c === '_') {
        const tag = c === '^' ? 'sup' : 'sub';
        let j = i + 1;
        while (s[j] === ' ') j++;
        if (s[j] === '{') {
          const g = readGroup(s, j);
          if (g) { out += '<' + tag + '>' + render(g.content) + '</' + tag + '>'; i = g.end; continue; }
        } else if (s[j] !== undefined) {
          out += '<' + tag + '>' + render(s[j]) + '</' + tag + '>';
          i = j + 1;
          continue;
        }
        out += esc(c);
        i++;
        continue;
      }
      if (c === '{' || c === '}') { i++; continue; }
      if (c === '~') { out += '\u00a0'; i++; continue; }
      out += esc(c);
      i++;
    }
    return out;
  }

  // 把一段含 $...$ / $$...$$ 的文本转成 HTML
  function toHtml(text) {
    const src = String(text == null ? '' : text);
    let html = '';
    let i = 0;
    while (i < src.length) {
      const d = src.indexOf('$$', i);
      const s = src.indexOf('$', i);
      if (d !== -1 && (s === -1 || d <= s)) {
        html += esc(src.slice(i, d));
        const end = src.indexOf('$$', d + 2);
        if (end === -1) { html += esc(src.slice(d)); break; }
        html += '<span class="tex-block">' + render(src.slice(d + 2, end)) + '</span>';
        i = end + 2;
      } else if (s !== -1) {
        html += esc(src.slice(i, s));
        const end = src.indexOf('$', s + 1);
        if (end === -1) { html += esc(src.slice(s)); break; }
        html += '<span class="tex-inline">' + render(src.slice(s + 1, end)) + '</span>';
        i = end + 1;
      } else {
        html += esc(src.slice(i));
        break;
      }
    }
    return html;
  }

  global.TeX = { toHtml: toHtml, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.TeX;
})(typeof window !== 'undefined' ? window : globalThis);
