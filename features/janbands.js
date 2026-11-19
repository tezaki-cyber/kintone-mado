/*
 * JANの企業コードの残り(JANマスター 855 の一覧の上に出る)
 *
 * JAN は、もらった企業コード(先頭9桁)1つにつき 000〜999 の1000個まで自分で番号を振れる。
 * ここでは企業コードごとに「いくつ使って、あといくつ出せるか」を出し、新しくもらった企業コードを登録できる。
 * 数えるのはサーバー(fuku_api の jan_bands_*)。855 のレコードには何も書かない。
 * 一覧の上には1行だけ出し、ボタンで詳しい小窓を開く(今ある一覧や入力の流れは変えない)。
 * 読めない・壊れているときは黙る。
 */
(function () {
  'use strict';
  if (!window.BCR_MADO) return;
  var ID = 'bcr-janbands';
  var API = 'https://us-central1-event-goods-database.cloudfunctions.net/fuku_api';
  var STATUSES = ['使用中', '予備', '使い切り', '使用不可', '他社'];
  var st = { data: null, busy: false, counting: false, edit: null, err: '', pick: {} };

  var CSS = [
    '#' + ID + '-bar { display: inline-flex; align-items: center; gap: 10px; margin: 6px 0 6px 12px; font-family: "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif; font-size: 13px; color: #1f2933; }',
    '#' + ID + '-bar .jb-pill { border-radius: 999px; padding: 4px 12px; font-weight: 700; border: 1px solid #c5ccd3; background: #fff; }',
    '#' + ID + '-bar .jb-pill.ok { color: #1b5e20; border-color: #a5d6a7; background: #f1f8f1; }',
    '#' + ID + '-bar .jb-pill.warn { color: #8a5200; border-color: #e6c58f; background: #fdf6e9; }',
    '#' + ID + '-bar .jb-pill.danger, #' + ID + '-bar .jb-pill.out { color: #fff; border-color: #c62828; background: #c62828; }',
    '#' + ID + '-bar button, #' + ID + ' button { font: inherit; cursor: pointer; border: 1px solid #9aa5b1; background: #fff; border-radius: 6px; padding: 4px 12px; color: #1f2933; }',
    '#' + ID + '-bar button:hover, #' + ID + ' button:hover { background: #f0f4f8; }',
    '#' + ID + ' button.pri { background: #1f2933; color: #fff; border-color: #1f2933; }',
    '#' + ID + ' button:disabled { opacity: .5; cursor: default; }',
    '#' + ID + ' { position: fixed; inset: 0; z-index: 100000; background: rgba(15,23,32,.45); display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px; overflow: auto; font-family: "Noto Sans JP", "Yu Gothic UI", "Meiryo", sans-serif; color: #1f2933; line-height: 1.6; }',
    '#' + ID + ' * { box-sizing: border-box; }',
    '#' + ID + ' .jb-win { background: #fff; border-radius: 10px; width: min(1080px, 100%); padding: 20px 24px 28px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }',
    '#' + ID + ' .jb-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }',
    '#' + ID + ' .jb-head h2 { margin: 0; font-size: 20px; }',
    '#' + ID + ' .jb-head .jb-x { margin-left: auto; }',
    '#' + ID + ' .jb-sum { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }',
    '#' + ID + ' .jb-box { border: 1px solid #d9dee4; border-radius: 8px; padding: 8px 16px; min-width: 150px; }',
    '#' + ID + ' .jb-box b { display: block; font-size: 26px; line-height: 1.25; font-variant-numeric: tabular-nums; }',
    '#' + ID + ' .jb-box span { font-size: 12px; color: #52606d; }',
    '#' + ID + ' .jb-box.warn { border-color: #e6c58f; background: #fdf6e9; }',
    '#' + ID + ' .jb-box.danger, #' + ID + ' .jb-box.out { border-color: #e3a5a5; background: #fdf1f1; color: #a31515; }',
    '#' + ID + ' .jb-note { font-size: 12px; color: #616e7c; margin: 4px 0 12px; }',
    '#' + ID + ' .jb-msg { margin: 8px 0; padding: 8px 12px; border-radius: 6px; font-size: 13px; background: #eef6ee; color: #1b5e20; }',
    '#' + ID + ' .jb-msg.err { background: #fdf1f1; color: #a31515; }',
    '#' + ID + ' table { width: 100%; border-collapse: collapse; font-size: 13px; }',
    '#' + ID + ' th { text-align: left; font-size: 12px; font-weight: 600; color: #616e7c; padding: 4px 8px; border-bottom: 1px solid #d9dee4; white-space: nowrap; }',
    '#' + ID + ' td { padding: 6px 8px; border-bottom: 1px solid #eef0f3; vertical-align: middle; }',
    '#' + ID + ' td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '#' + ID + ' td.code { font-family: Consolas, monospace; white-space: nowrap; }',
    '#' + ID + ' tr.dim td { color: #9aa5b1; }',
    '#' + ID + ' .jb-st { font-size: 12px; border-radius: 4px; padding: 1px 8px; white-space: nowrap; border: 1px solid #c5ccd3; }',
    '#' + ID + ' .jb-st.s0 { background: #1f2933; color: #fff; border-color: #1f2933; }',
    '#' + ID + ' .jb-st.s1 { background: #f1f8f1; color: #1b5e20; border-color: #a5d6a7; }',
    '#' + ID + ' .jb-st.s3 { background: #fdf1f1; color: #a31515; border-color: #e3a5a5; }',
    '#' + ID + ' .jb-st.s4 { background: #f4f5f7; color: #7b8794; border-style: dashed; }',
    '#' + ID + ' .jb-auto { display: block; font-size: 11px; color: #7b8794; }',
    '#' + ID + ' td select { font: inherit; font-size: 13px; padding: 2px 4px; border: 1px solid #c5ccd3; border-radius: 4px; }',
    '#' + ID + ' .jb-bulk { display: flex; gap: 10px; align-items: center; margin: 8px 0; flex-wrap: wrap; font-size: 13px; }',
    '#' + ID + ' .jb-meter { width: 160px; height: 10px; border-radius: 5px; background: #e4e7eb; overflow: hidden; }',
    '#' + ID + ' .jb-meter i { display: block; height: 100%; background: #52606d; }',
    '#' + ID + ' h3 { font-size: 15px; margin: 22px 0 8px; }',
    '#' + ID + ' .jb-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px 14px; border: 1px solid #d9dee4; border-radius: 8px; padding: 12px 14px; background: #f9fafb; }',
    '#' + ID + ' .jb-form label { display: flex; flex-direction: column; font-size: 12px; color: #52606d; gap: 3px; }',
    '#' + ID + ' .jb-form input, #' + ID + ' .jb-form select { font: inherit; font-size: 14px; padding: 5px 8px; border: 1px solid #c5ccd3; border-radius: 6px; color: #1f2933; background: #fff; }',
    '#' + ID + ' .jb-form .wide { grid-column: 1 / -1; }',
    '#' + ID + ' .jb-form .jb-prev { grid-column: 1 / -1; font-size: 13px; color: #243b53; }',
    '#' + ID + ' .jb-form .jb-acts { grid-column: 1 / -1; display: flex; gap: 8px; }',
    '#' + ID + ' details { margin-top: 18px; font-size: 13px; }',
    '#' + ID + ' summary { cursor: pointer; color: #3e4c59; }'
  ].join('\n');

  function el(tag, attrs) {
    var x = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'on') Object.keys(attrs.on).forEach(function (e) { x.addEventListener(e, attrs.on[e]); });
      else if (k === 'text') x.textContent = attrs[k];
      else if (k === 'cls') x.className = attrs[k];
      else if (k in x && k !== 'list' && k !== 'style') x[k] = attrs[k];
      else x.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null && c !== false) x.append(c); }
    return x;
  }
  function n(v) { return Number(v || 0).toLocaleString('ja-JP'); }
  function me() { try { return kintone.getLoginUser().code; } catch (e) { return ''; } }
  function key() { return BCR_MADO.config && BCR_MADO.config.key || ''; }

  function call(body) {
    if (!key()) return Promise.reject(new Error('サーバーの合言葉が読めません'));
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fuku-Key': key() }, body: JSON.stringify(Object.assign({ user: me() }, body)) })
      .then(function (r) { return r.json().catch(function () { return { error: 'サーバーから返事がありません(' + r.status + ')' }; }).then(function (j) { if (!r.ok || j.error) throw new Error(j.error || ('エラー ' + r.status)); return j; }); });
  }

  var LEVEL = { ok: '十分あります', warn: '少なくなっています', danger: 'もうすぐ無くなります', out: '出せる番号がありません', unknown: 'まだ数えていません' };

  // ---- 一覧の上の1行 ----
  function bar() {
    try { if (kintone.app.getId() !== 855) return; } catch (e) { return; }
    var host = kintone.app.getHeaderMenuSpaceElement();
    if (!host) return;
    var b = document.getElementById(ID + '-bar');
    if (!b) { b = el('span', { id: ID + '-bar' }); host.appendChild(b); }
    b.textContent = '';
    var d = st.data;
    if (!d) { b.append(el('span', { cls: 'jb-pill', text: 'JANの残りを数えています…' })); return; }
    var act = (d.bands || []).filter(function (x) { return x.status === '使用中'; }).map(function (x) { return x.label || x.prefix; }).join('・');
    b.append(el('span', { cls: 'jb-pill ' + d.level, title: '使用中と予備の企業コードを合わせて、あと出せる JAN の数', text: 'JANの残り 合計 ' + n(d.total) + '件' }),
      el('span', { text: (act ? '使用中: ' + act + ' 残り' + n(d.active) : '') + (d.spareCount ? ' ・ 予備 ' + d.spareCount + 'コード ' + n(d.spare) + '件' : ' ・ 予備なし') + (d.nextJan ? ' / 次の番号 ' + d.nextJan : '') }),
      el('button', { type: 'button', title: '企業コードごとの使った数・残りを見る。新しくもらった企業コードはここで登録する', text: '企業コードの状況・登録', on: { click: openWin } }));
  }

  // ---- 詳しい小窓 ----
  function openWin() {
    if (!document.getElementById(ID)) {
      var w = el('div', { id: ID, on: { click: function (e) { if (e.target === w) closeWin(); } } });
      document.body.appendChild(w);
      document.addEventListener('keydown', esc);
    }
    draw();
    if (st.data && st.data.stale) recount();
  }
  function esc(e) { if (e.key === 'Escape') closeWin(); }
  function closeWin() { var w = document.getElementById(ID); if (w) w.remove(); document.removeEventListener('keydown', esc); st.edit = null; }

  function recount() {
    if (st.counting) return;
    st.counting = true; draw();
    call({ action: 'jan_bands_get', refresh: true }).then(function (d) { st.data = d; st.err = ''; })
      .catch(function (e) { st.err = '数え直せませんでした: ' + e.message; })
      .then(function () { st.counting = false; bar(); draw(); });
  }

  function send(body, okMsg) {
    st.busy = true; st.err = ''; draw();
    return call(Object.assign({ action: 'jan_bands_put' }, body)).then(function (d) { st.data = d; st.msg = d.notice || okMsg || ''; st.edit = null; })
      .catch(function (e) { st.err = e.message; })
      .then(function () { st.busy = false; bar(); draw(); });
  }

  function draw() {
    var w = document.getElementById(ID);
    if (!w) return;
    var d = st.data || { bands: [], unknown: [] };
    w.textContent = '';
    var win = el('div', { cls: 'jb-win' });
    w.append(win);
    win.append(el('div', { cls: 'jb-head' }, el('h2', { text: 'JANの企業コードの残り' }),
      el('button', { type: 'button', cls: 'jb-x', title: '閉じる(Esc)', text: '閉じる', on: { click: closeWin } })));
    var act = d.bands.filter(function (x) { return x.status === '使用中'; });
    win.append(el('div', { cls: 'jb-sum' },
      el('div', { cls: 'jb-box ' + (d.level || '') }, el('b', { text: n(d.total) + '件' }), el('span', { text: 'あと出せる JAN(使用中＋予備)・' + (LEVEL[d.level] || '') })),
      el('div', { cls: 'jb-box' }, el('b', { text: n(d.active) + '件' }), el('span', { text: '使用中の企業コードの残り' + (act.length ? '(' + act.map(function (x) { return x.label || x.prefix; }).join('・') + ')' : '') })),
      el('div', { cls: 'jb-box' }, el('b', { text: n(d.spare) + '件' }), el('span', { text: '予備の企業コードの残り(' + (d.spareCount || 0) + 'コード)' })),
      el('div', { cls: 'jb-box' }, el('b', { text: d.nextJan || '—', style: 'font-size:20px' }), el('span', { text: '次に出る番号' }))));
    win.append(el('p', { cls: 'jb-note' },
      '数えた時刻 ' + (d.usageAt || '—') + '(JANマスターの ' + n(d.count855) + '件から) ',
      el('button', { type: 'button', title: 'JANマスターを全部読み直して数え直す(30〜50秒かかります)', disabled: st.counting, text: st.counting ? '数え直しています…' : '最新に数え直す', on: { click: recount } }),
      el('br'),
      '残りは「その企業コードで使われている一番大きい番号より後ろ」の数です。途中の空き(穴)と、使わない番号(000・392〜426・819 など)は数えません。黄色の知らせは合計の残りが ' + n(d.warn) + '件未満、赤は ' + n(d.danger) + '件未満で、進捗表の上にも出ます。',
      el('br'),
      '使用中の企業コードを使い切ると、予備のうち「使う順」が一番小さい企業コードが自動で使用中になり、次の番号もそちらに移ります(数え直したときと、登録・変更のあとに確かめます)。'));
    if (!st.data && !st.err) win.append(el('div', { cls: 'jb-msg', text: '読み込んでいます…' }));
    if (st.err) win.append(el('div', { cls: 'jb-msg err', text: st.err }));
    else if (st.msg) win.append(el('div', { cls: 'jb-msg', text: st.msg }));

    var tb = el('tbody');
    d.bands.forEach(function (b) {
      var si = STATUSES.indexOf(b.status), used = b.usedCount, cap = b.capacity || 1;
      tb.append(el('tr', { cls: si >= 2 ? 'dim' : '' },
        el('td', { text: b.label || '' }),
        el('td', { cls: 'code', text: b.prefix }),
        el('td', {}, el('span', { cls: 'jb-st s' + si, text: b.status }), b.autoAt ? el('span', { cls: 'jb-auto', text: '自動 ' + b.autoAt }) : null),
        el('td', {}, el('div', { cls: 'jb-meter', title: n(used) + ' / ' + n(cap) + '件' }, el('i', { style: 'width:' + Math.min(100, Math.round(used / cap * 100)) + '%' }))),
        el('td', { cls: 'num', text: n(used) + ' / ' + n(cap) }),
        el('td', { cls: 'num', text: si < 2 ? n(b.remaining) : '—' }),
        el('td', { cls: 'num', title: '予備の中で、小さいものから先に使います', text: si < 2 ? String(b.order != null ? b.order : '') : '' }),
        el('td', { cls: 'num', title: '使われている一番大きい番号より前の空き。発番には使いません', text: b.holes ? n(b.holes) : '' }),
        el('td', { text: b.got || '' }),
        el('td', { text: b.note || '', style: 'font-size:12px;color:#52606d' }),
        el('td', {}, d.canEdit ? el('button', { type: 'button', title: 'この企業コードの状態・使わない番号・メモを直す', text: '直す', on: { click: function () { st.edit = Object.assign({}, b, { mode: 'edit' }); st.msg = ''; draw(); } } }) : null)));
    });
    win.append(el('table', {}, el('thead', {}, el.apply(null, ['tr', {}].concat(['番号の名前', '企業コード', '状態', '', '使った / 使える', '残り', '使う順', '穴', '受け取った日', 'メモ', ''].map(function (h) { return el('th', { text: h }); })))), tb));

    if (d.canEdit) win.append(form(d));
    else win.append(el('p', { cls: 'jb-note', text: '企業コードの登録・変更は管理者だけができます。' }));

    if (d.unknown && d.unknown.length) win.append(unknownList(d));
  }

  // JANマスターにある、まだ登録していない企業コード。状態を選んでまとめて登録できる
  function guess(u) { return !u.jp ? '他社' : u.leftover === 0 || u.max >= 999 ? '使い切り' : '予備'; }
  function unknownList(d) {
    var ul = el('tbody'), sel = {};
    d.unknown.forEach(function (u) {
      var p = st.pick[u.prefix] || (st.pick[u.prefix] = { on: false, status: guess(u) });
      var chk = el('input', { type: 'checkbox', checked: p.on, title: 'まとめて登録するときに選ぶ', on: { change: function () { p.on = chk.checked; } } });
      var s = el('select', { on: { change: function () { p.status = s.value; } } });
      STATUSES.forEach(function (x) { if (x !== '使用不可') s.append(el('option', { value: x, text: x, selected: p.status === x })); });
      sel[u.prefix] = p;
      ul.append(el('tr', {},
        el('td', {}, d.canEdit ? chk : null),
        el('td', { cls: 'code', text: u.prefix }),
        el('td', { cls: 'num', text: n(u.count) + '件' }),
        el('td', { cls: 'num', title: '使われている一番大きい番号', text: String(u.max).padStart(3, '0') }),
        el('td', { cls: 'num', title: '一番大きい番号より後ろ(000 以外は使える前提。登録のあと「直す」で使わない番号を入れられます)', text: n(u.leftover) }),
        el('td', {}, d.canEdit ? s : null),
        el('td', {}, d.canEdit ? el('button', { type: 'button', title: 'この企業コードを、名前・使わない番号なども入れて1件だけ登録する', text: '詳しく登録', on: { click: function () { st.edit = { mode: 'add', prefix: u.prefix, status: p.status, skip: '000', label: '' }; draw(); var f = document.querySelector('#' + ID + ' .jb-form'); if (f) f.scrollIntoView({ block: 'center' }); } } }) : null)));
    });
    var head = el.apply(null, ['tr', {}].concat(['', '企業コード', '使った数', '一番大きい番号', '後ろの残り', '登録するときの状態', ''].map(function (h) { return el('th', { text: h }); })));
    var bulk = d.canEdit ? el('div', { cls: 'jb-bulk' },
      el('button', { type: 'button', title: '全部にチェックを付ける', text: '全部選ぶ', on: { click: function () { d.unknown.forEach(function (u) { st.pick[u.prefix].on = true; }); draw(); } } }),
      el('button', { type: 'button', cls: 'pri', disabled: st.busy, title: 'チェックした企業コードを、選んだ状態でまとめて登録する。JANマスターのレコードは変えません', text: '選んだものをまとめて登録',
        on: { click: function () {
          var list = d.unknown.filter(function (u) { return sel[u.prefix].on; }).map(function (u) { return { prefix: u.prefix, status: sel[u.prefix].status, skip: '000' }; });
          if (!list.length) { st.err = '登録する企業コードにチェックを付けてください'; draw(); return; }
          send({ op: 'addmany', bands: list }).then(function () { list.forEach(function (x) { delete st.pick[x.prefix]; }); });
        } } }),
      el('span', { cls: 'jb-note', style: 'margin:0', text: '自社の企業コードは「予備」(残りを合計に足す)か「使い切り」、自社のでないものは「他社」(数えない)にしてください。' })) : null;
    return el('details', { open: true }, el('summary', { text: 'JANマスターにある、登録していない企業コード ' + d.unknown.length + '件' }), bulk, el('table', {}, el('thead', {}, head), ul));
  }

  function form(d) {
    var e = st.edit || { mode: 'add' };
    var last = d.bands.slice().sort(function (a, b) { return (b.order || 0) - (a.order || 0); })[0] || {};
    var adding = e.mode !== 'edit';
    var f = {
      prefix: el('input', { value: e.prefix || '', placeholder: '例 457019453', inputMode: 'numeric', maxLength: 13, disabled: !adding }),
      label: el('input', { value: e.label != null ? e.label : (adding && /^(\d+)番$/.test(last.label || '') ? (Number(RegExp.$1) + 1) + '番' : ''), placeholder: '例 37番' }),
      got: el('input', { type: 'date', value: e.got || '' }),
      status: el('select', {}),
      skip: el('input', { value: e.skip != null ? e.skip : (last.skip || '000'), placeholder: '例 000,392-426,819' }),
      note: el('input', { value: e.note || '', placeholder: '例 2026年度の申請分' }),
      order: el('input', { type: 'number', value: e.order != null ? e.order : '', placeholder: adding ? '空なら一番後ろ' : '' })
    };
    STATUSES.forEach(function (s) { f.status.append(el('option', { value: s, text: s, selected: (e.status || '予備') === s })); });
    var prev = el('div', { cls: 'jb-prev' });
    function preview() {
      var p = (f.prefix.value || '').replace(/\D/g, '');
      if (p.length !== 9) { prev.textContent = '企業コードは JAN の先頭9桁です(9桁で1000個の番号が使えます)'; return; }
      var skip = {}, bad = '';
      (f.skip.value || '').normalize('NFKC').split(/[,、\s]+/).filter(Boolean).forEach(function (part) {
        var m = part.match(/^(\d{1,3})(?:[-~〜](\d{1,3}))?$/);
        if (!m) { bad = part; return; }
        for (var i = Number(m[1]); i <= Number(m[2] != null ? m[2] : m[1]); i++) skip[i] = 1;
      });
      if (bad) { prev.textContent = '使わない番号の書き方が読めません: 「' + bad + '」'; return; }
      var ok = []; for (var i = 0; i <= 999; i++) if (!skip[i]) ok.push(i);
      var jan = function (i) { var b = p + String(i).padStart(3, '0'), s = 0; for (var k = 0; k < 12; k++) s += Number(b[k]) * (k % 2 ? 3 : 1); return b + ((10 - s % 10) % 10); };
      prev.textContent = ok.length ? '使える番号 ' + ok.length + '個(' + jan(ok[0]) + ' 〜 ' + jan(ok[ok.length - 1]) + ')' : '使える番号がありません';
    }
    f.prefix.addEventListener('input', preview); f.skip.addEventListener('input', preview); preview();
    var warn = el('input', { type: 'number', value: d.warn, min: 2, max: 1000, style: 'width:90px' }), danger = el('input', { type: 'number', value: d.danger, min: 1, max: 999, style: 'width:90px' });
    var box = el('div', {},
      el('h3', { text: adding ? '新しくもらった企業コードを登録する' : '企業コード ' + e.prefix + ' を直す' }),
      el('div', { cls: 'jb-form' },
        el('label', {}, '企業コード(9桁)', f.prefix),
        el('label', {}, '番号の名前', f.label),
        el('label', {}, '受け取った日', f.got),
        el('label', {}, '状態', f.status),
        el('label', { title: '予備の企業コードは、この数が小さいものから順に使います' }, '使う順(小さいほど先)', f.order),
        el('label', { cls: 'wide' }, '使わない番号(今までの企業コードと同じ決まりを入れてあります)', f.skip),
        el('label', { cls: 'wide' }, 'メモ', f.note),
        prev,
        el('div', { cls: 'jb-acts' },
          el('button', { type: 'button', cls: 'pri', disabled: st.busy, title: adding ? 'この企業コードを一覧に足す。JANマスターのレコードは変えません' : '状態・使わない番号・メモを保存する', text: st.busy ? '保存しています…' : adding ? '登録する' : '保存する',
            on: { click: function () { send({ op: adding ? 'add' : 'edit', band: { prefix: f.prefix.value, label: f.label.value, got: f.got.value, status: f.status.value, skip: f.skip.value, note: f.note.value, order: f.order.value } }); } } }),
          !adding || st.edit ? el('button', { type: 'button', title: '入力をやめる', text: 'やめる', on: { click: function () { st.edit = null; draw(); } } }) : null)),
      el('h3', { text: '知らせる数' }),
      el('div', { cls: 'jb-form' },
        el('label', {}, '黄色で知らせる(残りがこれ未満)', warn),
        el('label', {}, '赤で知らせる(残りがこれ未満)', danger),
        el('div', { cls: 'jb-acts' }, el('button', { type: 'button', disabled: st.busy, title: '進捗表とこの画面で知らせる数を変える', text: '知らせる数を保存', on: { click: function () { send({ op: 'cfg', warn: warn.value, danger: danger.value }, '知らせる数を保存しました'); } } }))));
    return box;
  }

  function load() {
    call({ action: 'jan_bands_get' }).then(function (d) {
      st.data = d; bar(); draw();
      if (d.stale && document.getElementById(ID)) recount();
    }).catch(function (e) {
      try { console.warn('[BCR窓口] janbands: ' + e.message); } catch (x) { /* 黙る */ }
      var b = document.getElementById(ID + '-bar'); if (b) b.remove();
      st.err = '読めませんでした: ' + e.message; draw();
    });
  }

  // 進捗表(867)の表の「JANの残り」から開けるようにする。進捗表では一覧の上の1行は出さない
  window.BCR_JANBANDS = {
    open: function () {
      if (!document.getElementById(ID + '-css')) document.head.appendChild(el('style', { id: ID + '-css', text: CSS }));
      openWin();
      if (!st.data) load();
    }
  };

  BCR_MADO.feature('janbands', {
    'app.record.index.show': function () {
      if (!document.getElementById(ID + '-css')) document.head.appendChild(el('style', { id: ID + '-css', text: CSS }));
      var app; try { app = kintone.app.getId(); } catch (e) { return; }
      if (app !== 855) return;
      bar();
      if (!st.data) load();
    }
  });
})();
