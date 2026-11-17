/*
 * 商標チェックの見やすい表示(進捗表 867 の一覧「商標チェック」だけで動く)
 *
 * キントーンの表は、同じ内容の行が何十行も並び、根拠の文章が途中で切れて読めない。
 * ここでは「同じ根拠の商品」を1枚のカードにまとめ、当たった商標・持ち主・区分を読める形で出す。
 * 人の判断(商標_人の確認・商標_確認メモ)は、その場で1件ずつ、またはカードごとにまとめて付けられる。
 * 判定そのもの(商標_判定・商標_内容)は毎晩の自動チェックが書く。ここでは書き換えない。
 * 読めない・壊れているときは黙り、キントーンのふだんの表をそのまま出す。
 */
(function () {
  'use strict';
  if (!window.BCR_MADO) return;
  var APP = 867, ID = 'bcr-shohyo', LIMIT = 500;
  var F = { name: 'シート_商品名', lv: '商標_判定', text: '商標_内容', human: '商標_人の確認', memo: '商標_確認メモ', day: '商標_照合日', plan: 'シート_企画担当', make: 'シート_制作' };
  var HUMAN = ['未確認', '問題なし', '名前を変える', '相談中'];
  var state = { rows: [], only: 'all', open: {} };

  var CSS = [
    'body.bcr-shohyo-on #view-list-data-gaia, body.bcr-shohyo-on .gaia-argoui-app-index-pager { display: none !important; }',
    '#' + ID + ' { font-family: "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif; color: #1f2933; padding: 16px 24px 40px; max-width: 1180px; line-height: 1.6; }',
    '#' + ID + ' * { box-sizing: border-box; }',
    '#' + ID + ' .sh-top { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 8px; }',
    '#' + ID + ' .sh-stat { display: flex; gap: 10px; }',
    '#' + ID + ' .sh-box { border: 1px solid #d9dee4; border-radius: 8px; padding: 8px 16px; background: #fff; min-width: 108px; }',
    '#' + ID + ' .sh-box b { display: block; font-size: 26px; line-height: 1.2; font-variant-numeric: tabular-nums; }',
    '#' + ID + ' .sh-box span { font-size: 12px; color: #52606d; }',
    '#' + ID + ' .sh-chips { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }',
    '#' + ID + ' button { font: inherit; cursor: pointer; }',
    '#' + ID + ' .sh-chip { border: 1px solid #c5ccd3; background: #fff; border-radius: 999px; padding: 5px 14px; font-size: 13px; color: #323f4b; }',
    '#' + ID + ' .sh-chip[aria-pressed="true"] { background: #1f2933; border-color: #1f2933; color: #fff; }',
    '#' + ID + ' .sh-note { font-size: 12px; color: #616e7c; margin: 0 0 14px; }',
    '#' + ID + ' .sh-note a { color: #1d6fb8; }',
    '#' + ID + ' .sh-card { background: #fff; border: 1px solid #d9dee4; border-left: 6px solid #9aa5b1; border-radius: 8px; margin-bottom: 14px; padding: 14px 18px 12px; }',
    '#' + ID + ' .sh-card.lv-w { border-left-color: #c62828; }',
    '#' + ID + ' .sh-card.lv-a { border-left-color: #c77700; }',
    '#' + ID + ' .sh-card.done { opacity: .62; }',
    '#' + ID + ' .sh-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }',
    '#' + ID + ' .sh-badge { font-size: 12px; font-weight: 700; border-radius: 4px; padding: 2px 9px; color: #fff; background: #616e7c; white-space: nowrap; }',
    '#' + ID + ' .lv-w .sh-badge { background: #c62828; }',
    '#' + ID + ' .lv-a .sh-badge { background: #b26a00; }',
    '#' + ID + ' .sh-title { font-size: 19px; font-weight: 700; margin: 0; }',
    '#' + ID + ' .sh-count { font-size: 13px; color: #52606d; }',
    '#' + ID + ' .sh-tag { font-size: 12px; border: 1px solid #c5ccd3; border-radius: 4px; padding: 1px 8px; color: #3e4c59; background: #f5f7fa; }',
    '#' + ID + ' .sh-ev { width: 100%; border-collapse: collapse; margin: 10px 0 4px; font-size: 14px; }',
    '#' + ID + ' .sh-ev th { text-align: left; font-size: 12px; font-weight: 600; color: #616e7c; padding: 4px 10px 4px 0; border-bottom: 1px solid #e4e7eb; white-space: nowrap; }',
    '#' + ID + ' .sh-ev td { padding: 6px 10px 6px 0; border-bottom: 1px solid #eef0f3; vertical-align: top; }',
    '#' + ID + ' .sh-ev td.mk { font-weight: 700; font-size: 15px; white-space: nowrap; }',
    '#' + ID + ' .sh-ev td.num { white-space: nowrap; font-variant-numeric: tabular-nums; color: #3e4c59; }',
    '#' + ID + ' .sh-how { font-size: 12px; border-radius: 4px; padding: 1px 7px; white-space: nowrap; border: 1px solid; }',
    '#' + ID + ' .sh-how.moji { color: #a31515; border-color: #e3a5a5; background: #fdf1f1; }',
    '#' + ID + ' .sh-how.yomi { color: #8a5200; border-color: #e6c58f; background: #fdf6e9; }',
    '#' + ID + ' .sh-own { font-size: 12px; color: #52606d; margin: 2px 0 0; }',
    '#' + ID + ' .sh-raw { font-size: 13px; color: #3e4c59; margin: 6px 0 0; white-space: pre-wrap; }',
    '#' + ID + ' .sh-bulk { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 10px 0 2px; padding: 8px 10px; background: #f5f7fa; border-radius: 6px; font-size: 13px; }',
    '#' + ID + ' select, #' + ID + ' input[type=text] { font: inherit; font-size: 13px; padding: 4px 6px; border: 1px solid #b8c0c8; border-radius: 4px; background: #fff; color: #1f2933; }',
    '#' + ID + ' input[type=text] { width: 260px; }',
    '#' + ID + ' .sh-btn { border: 1px solid #1d6fb8; background: #1d6fb8; color: #fff; border-radius: 4px; padding: 4px 12px; font-size: 13px; }',
    '#' + ID + ' .sh-btn.sub { background: #fff; color: #1d6fb8; }',
    '#' + ID + ' .sh-btn:disabled { opacity: .5; cursor: default; }',
    '#' + ID + ' .sh-msg { font-size: 12px; color: #52606d; }',
    '#' + ID + ' .sh-msg.ng { color: #a31515; }',
    '#' + ID + ' .sh-items { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }',
    '#' + ID + ' .sh-items th { text-align: left; font-size: 12px; font-weight: 600; color: #616e7c; padding: 4px 8px 4px 0; border-bottom: 1px solid #e4e7eb; }',
    '#' + ID + ' .sh-items td { padding: 5px 8px 5px 0; border-bottom: 1px solid #eef0f3; vertical-align: middle; }',
    '#' + ID + ' .sh-items a { color: #1d6fb8; text-decoration: none; }',
    '#' + ID + ' .sh-items a:hover { text-decoration: underline; }',
    '#' + ID + ' .sh-more { border: 0; background: none; color: #1d6fb8; padding: 6px 0 0; font-size: 13px; }',
    '#' + ID + ' .sh-empty { padding: 28px; text-align: center; color: #52606d; background: #fff; border: 1px dashed #c5ccd3; border-radius: 8px; }'
  ].join('\n');

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function human(r) { return r.human || '未確認'; }

  /** 「■名前: 判定」のかたまりごとに分け、根拠の行を読みやすい形にする */
  function parse(text) {
    var blocks = [], cur = null;
    String(text || '').split('\n').forEach(function (line) {
      var h = line.match(/^■(.+?): (.+)$/);
      if (h) { cur = { name: h[1], lv: h[2], lines: [] }; blocks.push(cur); return; }
      if (!cur) return;
      var s = line.replace(/^[\s　]+/, '');
      if (!s) return;
      var m = s.match(/^(.+?): 「(.+?)」(登録|出願)(\S+) 第(\S+?)類(?: (.*?))?(?:\((.+)\))?$/);
      cur.lines.push(m ? { how: m[1], mark: m[2], kind: m[3], num: m[4], cls: m[5], owner: m[6] || '', why: m[7] || '' } : { raw: s });
    });
    return blocks;
  }

  function fetchAll() {
    var q = F.lv + ' in ("警告", "要確認") order by $id desc limit ' + LIMIT;
    return kintone.api(kintone.api.url('/k/v1/records', true), 'GET', { app: APP, query: q, fields: ['$id'].concat(Object.keys(F).map(function (k) { return F[k]; })) }).then(function (res) {
      return res.records.map(function (r) {
        var v = function (k) { return (r[F[k]] && r[F[k]].value) || ''; };
        return { id: r.$id.value, name: v('name'), lv: v('lv'), text: v('text').replace(/\r\n/g, '\n'), human: v('human'), memo: v('memo'), day: v('day'), plan: v('plan'), make: v('make') };
      });
    });
  }

  function save(ids, value, memo) {
    var recs = ids.map(function (id) { var rec = {}; rec[F.human] = { value: value === '未確認' ? '未確認' : value }; if (memo != null) rec[F.memo] = { value: memo }; return { id: id, record: rec }; });
    var chunks = []; for (var i = 0; i < recs.length; i += 100) chunks.push(recs.slice(i, i + 100));
    return chunks.reduce(function (p, c) { return p.then(function () { return kintone.api(kintone.api.url('/k/v1/records', true), 'PUT', { app: APP, records: c }); }); }, Promise.resolve()).then(function () {
      state.rows.forEach(function (r) { if (ids.indexOf(r.id) >= 0) { r.human = value; if (memo != null) r.memo = memo; } });
    });
  }

  function groups() {
    var map = {}, list = [];
    state.rows.forEach(function (r) {
      // 警告・要確認の根拠が同じ商品を1枚にまとめる(問題のない名前が一緒に入っているかどうかでは分けない)
      var blocks = parse(r.text), hot = blocks.filter(function (b) { return b.lv === '警告' || b.lv === '要確認'; });
      var key = hot.length ? JSON.stringify(hot) : r.text;
      var g = map[key]; if (!g) { g = map[key] = { key: key, lv: r.lv, rows: [], blocks: blocks, hot: hot }; list.push(g); }
      if (r.lv === '警告') g.lv = '警告';
      g.rows.push(r);
    });
    list.forEach(function (g) {
      g.title = (g.hot.length ? g.hot : g.blocks).map(function (b) { return b.name; }).join(' ＋ ') || '(名前が読めません)';
      g.todo = g.rows.filter(function (r) { return human(r) === '未確認'; }).length;
    });
    return list.sort(function (a, b) { return (a.lv === '警告' ? 0 : 1) - (b.lv === '警告' ? 0 : 1) || b.rows.length - a.rows.length; });
  }

  function evidence(g) {
    var wrap = el('div');
    var lines = []; g.hot.forEach(function (b) { b.lines.forEach(function (l) { lines.push(l); }); });
    var parsed = lines.filter(function (l) { return !l.raw; });
    if (parsed.length) {
      var t = el('table', 'sh-ev'), hr = el('tr');
      ['当たり方', '見つかった商標', '番号', '区分', '持ち主', '指定商品'].forEach(function (h) { hr.appendChild(el('th', '', h)); });
      t.appendChild(hr);
      parsed.forEach(function (l) {
        var tr = el('tr'), td = el('td');
        td.appendChild(el('span', 'sh-how ' + (l.how.indexOf('文字') === 0 ? 'moji' : 'yomi'), l.how));
        tr.appendChild(td);
        tr.appendChild(el('td', 'mk', l.mark));
        tr.appendChild(el('td', 'num', l.kind + ' ' + l.num));
        tr.appendChild(el('td', 'num', '第' + l.cls + '類'));
        tr.appendChild(el('td', '', l.owner));
        tr.appendChild(el('td', '', l.why.replace(/^指定商品に/, '').replace(/^指定商品が/, '')));
        t.appendChild(tr);
      });
      wrap.appendChild(t);
    }
    lines.filter(function (l) { return l.raw; }).forEach(function (l) { wrap.appendChild(el('p', 'sh-raw', l.raw)); });
    var ok = g.blocks.filter(function (b) { return g.hot.indexOf(b) < 0; });
    if (ok.length) wrap.appendChild(el('p', 'sh-own', '同じ商品名の中のほかの名前: ' + ok.map(function (b) { return b.name + '(' + b.lv + ')'; }).join('、')));
    return wrap;
  }

  function selectOf(value) {
    var s = el('select'); HUMAN.forEach(function (h) { var o = el('option', '', h); o.value = h; s.appendChild(o); }); s.value = value; return s;
  }

  function card(g) {
    var c = el('section', 'sh-card ' + (g.lv === '警告' ? 'lv-w' : 'lv-a') + (g.todo === 0 ? ' done' : ''));
    var head = el('div', 'sh-head');
    head.appendChild(el('span', 'sh-badge', g.lv));
    head.appendChild(el('h3', 'sh-title', g.title));
    head.appendChild(el('span', 'sh-count', '商品 ' + g.rows.length + '件'));
    head.appendChild(el('span', 'sh-tag', g.todo === 0 ? '人の確認ずみ' : '未確認 ' + g.todo + '件'));
    c.appendChild(head);
    c.appendChild(evidence(g));

    // カードごとにまとめて付ける(押す→確かめる→付ける の2段階)
    var bulk = el('div', 'sh-bulk'), sel = selectOf('問題なし'), memo = el('input'), go = el('button', 'sh-btn', 'この' + g.rows.length + '件にまとめて付ける'), msg = el('span', 'sh-msg');
    memo.type = 'text'; memo.placeholder = '確認メモ(例: 法務に確認ずみ)'; memo.maxLength = 200;
    bulk.appendChild(el('span', '', '人の確認:')); bulk.appendChild(sel); bulk.appendChild(memo); bulk.appendChild(go); bulk.appendChild(msg);
    var armed = false, cancel = el('button', 'sh-btn sub', 'やめる');
    cancel.onclick = function () { armed = false; go.textContent = 'この' + g.rows.length + '件にまとめて付ける'; if (cancel.parentNode) bulk.removeChild(cancel); };
    go.onclick = function () {
      if (!armed) { armed = true; go.textContent = g.rows.length + '件を「' + sel.value + '」にする'; bulk.insertBefore(cancel, msg); return; }
      go.disabled = true; msg.className = 'sh-msg'; msg.textContent = '書き込み中…';
      save(g.rows.map(function (r) { return r.id; }), sel.value, memo.value).then(render).catch(function (e) { go.disabled = false; msg.className = 'sh-msg ng'; msg.textContent = '書けませんでした: ' + (e && e.message || ''); });
    };
    c.appendChild(bulk);

    var t = el('table', 'sh-items'), hr = el('tr');
    ['商品名', '企画担当', '制作', '人の確認', '確認メモ'].forEach(function (h) { hr.appendChild(el('th', '', h)); });
    t.appendChild(hr);
    var open = state.open[g.key], shown = open ? g.rows : g.rows.slice(0, 3);
    shown.forEach(function (r) {
      var tr = el('tr'), td = el('td'), a = el('a', '', r.name || '(商品名なし)');
      a.href = '/k/' + APP + '/show#record=' + r.id; a.target = '_blank'; a.rel = 'noopener';
      td.appendChild(a); tr.appendChild(td);
      tr.appendChild(el('td', '', r.plan)); tr.appendChild(el('td', '', r.make));
      var td2 = el('td'), s = selectOf(human(r)), m = el('span', 'sh-msg');
      s.onchange = function () { s.disabled = true; m.className = 'sh-msg'; m.textContent = ' …'; save([r.id], s.value, null).then(render).catch(function (e) { s.disabled = false; s.value = human(r); m.className = 'sh-msg ng'; m.textContent = ' 書けませんでした'; }); };
      td2.appendChild(s); td2.appendChild(m); tr.appendChild(td2);
      tr.appendChild(el('td', '', r.memo));
      t.appendChild(tr);
    });
    c.appendChild(t);
    if (g.rows.length > 3) {
      var more = el('button', 'sh-more', open ? '▲ たたむ' : '▼ 残りの' + (g.rows.length - 3) + '件も見る');
      more.onclick = function () { state.open[g.key] = !open; render(); };
      c.appendChild(more);
    }
    return c;
  }

  function render() {
    var root = document.getElementById(ID); if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    var all = groups(), rows = state.rows;
    var n = function (f) { return rows.filter(f).length; };
    var top = el('div', 'sh-top'), stat = el('div', 'sh-stat');
    [['警告', n(function (r) { return r.lv === '警告'; })], ['要確認', n(function (r) { return r.lv === '要確認'; })], ['まだ人が見ていない', n(function (r) { return human(r) === '未確認'; })]].forEach(function (x) {
      var b = el('div', 'sh-box'); b.appendChild(el('b', '', String(x[1]))); b.appendChild(el('span', '', x[0] + '(商品)')); stat.appendChild(b);
    });
    top.appendChild(stat);
    var chips = el('div', 'sh-chips');
    [['all', 'すべて'], ['todo', '未確認だけ'], ['warn', '警告だけ']].forEach(function (x) {
      var b = el('button', 'sh-chip', x[1]); b.setAttribute('aria-pressed', String(state.only === x[0]));
      b.onclick = function () { state.only = x[0]; render(); }; chips.appendChild(b);
    });
    top.appendChild(chips); root.appendChild(top);

    var note = el('p', 'sh-note', '同じ名前の商標が見つかった商品を、根拠ごとにまとめています。侵害かどうかの判断ではありません。最終判断は法務・弁理士に確認してください。判定は毎朝4時に自動で更新されます。 ');
    var sw = el('a', '', 'キントーンの表で見る'); sw.href = '#';
    sw.onclick = function (e) { e.preventDefault(); var on = document.body.classList.toggle('bcr-shohyo-on'); sw.textContent = on ? 'キントーンの表で見る' : 'まとめた表示に戻す'; };
    note.appendChild(sw); root.appendChild(note);

    var list = all.filter(function (g) { return state.only === 'todo' ? g.todo > 0 : state.only === 'warn' ? g.lv === '警告' : true; });
    if (!list.length) { root.appendChild(el('div', 'sh-empty', rows.length ? 'この条件に当てはまるものはありません。' : '警告・要確認の商品はありません。')); return; }
    list.forEach(function (g) { root.appendChild(card(g)); });
    if (rows.length >= LIMIT) root.appendChild(el('p', 'sh-note', '件数が多いため、新しいほうから ' + LIMIT + ' 件だけ出しています。'));
  }

  BCR_MADO.feature('shohyo', {
    'app.record.index.show': function () {
      var space = kintone.app.getHeaderSpaceElement(); if (!space) return;
      if (!document.getElementById(ID + '-css')) { var st = el('style'); st.id = ID + '-css'; st.textContent = CSS; document.head.appendChild(st); }
      var root = document.getElementById(ID);
      if (!root) { root = el('div'); root.id = ID; space.appendChild(root); }
      fetchAll().then(function (rows) { state.rows = rows; document.body.classList.add('bcr-shohyo-on'); render(); })
        .catch(function (e) { document.body.classList.remove('bcr-shohyo-on'); if (root.parentNode) root.parentNode.removeChild(root); try { console.warn('[BCR窓口] shohyo: ' + (e && e.message || e)); } catch (x) { /* 何もしない */ } });
    }
  });
})();
