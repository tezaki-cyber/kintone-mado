/*
 * 副資材・カートンの自動生成(キントーン BCR_進捗表・BCR_商品管理表 用)
 *
 * 一覧「副資材・カートン」を開いたときだけ、上に「副資材・カートンを作る」ボタンを1つ出す。ほかの一覧・画面では何もしない。
 * 作る種類・履歴・製造先と原産国の対応表は、すべてこのボタンのポップアップの中に置く(キントーンのメニューを増やさない)。
 * 進捗表(商品管理表)・JANマスター・製造先マスタは「読むだけ」。キントーンには何も書き込まない。
 *
 * 流れ: 0 商品を選ぶ → 1 中身を確かめる → 2 できあがりを見る(下書き) → 3 確定
 * 生成はサーバー(CONFIG.api)がする。JAN のずれ検知とバーコードの読み直し確認もサーバー側。
 */
(function () {
  'use strict';
  var MADO = window.BCR_MADO || null;          // 窓口(mado.js)。合言葉は窓口の設定(mado-config.js)から受け取る
  var CONFIG = Object.assign({
    api: 'https://us-central1-event-goods-database.cloudfunctions.net/fuku_api',   // 生成サーバーの入口
    key: MADO && MADO.config.key || '',         // サーバーの合言葉(このファイルには書かない)
    view: '副資材・カートン',    // このボタンを出す一覧の名前
    appMaster: 855,             // BCR_JAN/プライズコード(JANマスター)
    appSeizo: 854               // BCR_製造先マスタ
  }, MADO && MADO.config.fukushizai || {}, window.FUKU_CONFIG || {});
  // 読む項目はアプリごとに違う。進捗表(867)は税込価格・入数の項目がないので、価格は JANマスターから、入数は計算か部決表から入る。
  // 進捗表のスプレッドシート由来の行は「シート_」の項目に入っているので、空のときはそちらを見る(alt)。
  var APP = 0; try { APP = kintone.app.getId(); } catch (e) { /* 単体の試験 */ }
  var SOURCES = {
    852: { label: '商品管理表', f: { name: '商品名', jan: 'JANコード', price: '税込価格', cat: '商品カテゴリ', seizo: '製造先', box: 'BOX入数', carton: 'カートン入数', hanro: '販路' }, alt: {}, base: '' },
    867: { label: '進捗表', f: { name: '商品名', jan: 'JANコード', price: '', cat: '商品カテゴリ', seizo: '製造工場', box: '', carton: '', hanro: '販路' },
           alt: { name: 'シート_商品名', jan: 'シート_JAN', price: 'シート_税込', seizo: 'シート_製造先', box: 'シート_BOX入数', carton: 'シート_入り数', hanro: 'シート_販路', holder: 'シート_権利元' }, base: '商品名 != ""' }
  };
  var SRC = SOURCES[APP] || SOURCES[852];
  var F = SRC.f;
  var KIND = { carton: 'カートンマーク', sticker: '副資材(裏貼りシール)' };
  var NUM = { perBag: 1, bags: 1 };

  var root, products = [], items = [], master = {}, countries = [], kinds = {}, step = 0, draft = null, pickFilter = '', picked = {}, seizoNames = null, skipped = 0, titles = [], titlesAt = '';

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  var val = function (rec, code) { return code && rec[code] && rec[code].value != null ? String(rec[code].value) : ''; };
  var READ = ['$id'].concat(Object.keys(SRC.f).map(function (k) { return SRC.f[k]; }), Object.keys(SRC.alt).map(function (k) { return SRC.alt[k]; })).filter(Boolean);
  var digits = function (v) { return String(v).normalize('NFKC').replace(/[^0-9.]/g, ''); };   // 「¥1,650」→ 1650
  function toProduct(r) {
    var pick = function (k) { return val(r, SRC.f[k]).trim() || val(r, SRC.alt[k]).trim(); };
    var sheet = !val(r, SRC.f.name).trim() && !!val(r, SRC.alt.name).trim();   // スプレッドシート由来の行
    return { id: +r.$id.value, name: pick('name'), jan: pick('jan').normalize('NFKC').replace(/[^0-9]/g, ''), priceIn: digits(pick('price')), category: val(r, F.cat),
             seizo: pick('seizo').normalize('NFKC'), box: digits(pick('box')), carton: /^[0-9,]+$/.test(pick('carton').normalize('NFKC')) ? digits(pick('carton')) : '',
             hanro: pick('hanro') || (sheet ? '一般' : ''), holder: pick('holder') };
  }
  var isInt = function (v) { v = String(v).trim().normalize('NFKC'); return /^[0-9]+$/.test(v) && +v > 0; };
  var chunk = function (a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

  function call(action, body) {
    var user = ''; try { user = kintone.getLoginUser().name; } catch (e) { /* 名前が取れなくても作れる */ }
    return fetch(CONFIG.api, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fuku-Key': CONFIG.key },
      body: JSON.stringify(Object.assign({ action: action, user: user }, body))
    }).then(function (r) {
      return r.json().catch(function () { throw new Error('サーバーから返事がありません(' + r.status + ')'); })
        .then(function (j) { if (!r.ok || j.error) throw new Error(j.error || ('エラー ' + r.status)); return j; });
    });
  }
  function kget(app, query, fields) {   // キントーンを読む(ログイン中の人の権限)。500件ずつ
    var out = [];
    function page(offset) {
      return kintone.api(kintone.api.url('/k/v1/records', true), 'GET', { app: app, query: (query ? query + ' ' : '') + 'limit 500 offset ' + offset, fields: fields })
        .then(function (r) { out = out.concat(r.records); return r.records.length === 500 && offset < 9500 ? page(offset + 500) : out; });
    }
    return page(0);
  }

  // ---------- 見た目(このポップアップの中だけに効く) ----------
  var CSS = [
    '#fk-root{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;z-index:100001;font-family:"Meiryo","Hiragino Kaku Gothic ProN",sans-serif;color:#333;font-size:14px;line-height:1.5}',
    '#fk-root.on{display:flex}',
    '#fk-root *{box-sizing:border-box}',
    '#fk-root .pop{background:#fff;width:min(980px,100%);border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.3)}',
    '#fk-root h2{margin:0;padding:14px 20px;border-bottom:1px solid #e3e7e8;font-size:17px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '#fk-root .steps{display:flex;gap:6px;font-size:12px;font-weight:normal;color:#999}',
    '#fk-root .steps span{padding:2px 10px;border-radius:10px;background:#eef0f1}',
    '#fk-root .steps span.on{background:#2a8fd6;color:#fff;font-weight:bold}',
    '#fk-root button{font:inherit;border-radius:4px;padding:8px 16px;cursor:pointer;border:1px solid #c8cdd0;background:#fff;color:#333}',
    '#fk-root button.primary{background:#2a8fd6;color:#fff;border-color:#2a8fd6;font-weight:bold}',
    '#fk-root button.small{padding:3px 10px;font-size:12px}',
    '#fk-root button:disabled{opacity:.45;cursor:not-allowed}',
    '#fk-root .x{margin-left:auto;border:none;font-size:20px;padding:0 6px}',
    '#fk-root .body{padding:14px 20px;max-height:66vh;overflow:auto}',
    '#fk-root .foot{padding:12px 20px;border-top:1px solid #e3e7e8;display:flex;gap:10px;align-items:center}',
    '#fk-root .msg{margin-right:auto;font-size:13px}',
    '#fk-root .msg.bad{color:#e74c3c}#fk-root .msg.good{color:#1e7e45}',
    '#fk-root table{width:100%;border-collapse:collapse}',
    '#fk-root td.num,#fk-root td:last-child{white-space:nowrap}','#fk-root th,#fk-root td{border-bottom:1px solid #e3e7e8;padding:7px 8px;text-align:left;vertical-align:middle;font-size:13px}',
    '#fk-root th{background:#f7f9fa;font-weight:normal;color:#666;font-size:12px;position:sticky;top:0}',
    '#fk-root tr.row{cursor:pointer}#fk-root tr.row:hover td{background:#f7fbff}',
    '#fk-root .num{font-family:Consolas,monospace}',
    '#fk-root .find{width:100%;font:inherit;padding:7px 10px;border:1px solid #cfd5d8;border-radius:4px;margin-bottom:10px}',
    '#fk-root .kinds{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}',
    '#fk-root .kinds .lab{color:#555;font-size:13px}',
    '#fk-root .kchip{border:2px solid #cfd5d8;border-radius:18px;padding:5px 14px;cursor:pointer;user-select:none;background:#fff}',
    '#fk-root .kchip.on{border-color:#2a8fd6;background:#eaf5fd;color:#1b6fa8;font-weight:bold}',
    '#fk-root .kchip.off{opacity:.45;cursor:not-allowed}',
    '#fk-root .kchip small{font-weight:normal;color:#888}',
    '#fk-root .bulk{display:flex;gap:8px;align-items:center;background:#f7f9fa;border:1px solid #e3e7e8;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:13px;flex-wrap:wrap}',
    '#fk-root .bulk input{width:70px;font:inherit;padding:4px 6px;border:1px solid #cfd5d8;border-radius:3px}',
    '#fk-root .card{border:1px solid #e3e7e8;border-left:5px solid #cfd5d8;border-radius:6px;margin-bottom:10px}',
    '#fk-root .card.ready{border-left-color:#27ae60}#fk-root .card.todo{border-left-color:#f0b400}#fk-root .card.stopped{border-left-color:#e74c3c}',
    '#fk-root .ttl{padding:9px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '#fk-root .ttl b{flex:1 1 300px}',
    '#fk-root .chip{font-weight:normal;font-size:11px;color:#555;background:#e9ecee;padding:2px 8px;border-radius:10px;white-space:nowrap}',
    '#fk-root .state{font-size:12px;padding:2px 10px;border-radius:10px;white-space:nowrap}',
    '#fk-root .ready .state{color:#1e7e45;background:#e6f6ec}#fk-root .todo .state{color:#8a5f00;background:#fff3cf}#fk-root .stopped .state{color:#fff;background:#e74c3c}',
    '#fk-root .rm{border:none;background:none;color:#999;font-size:12px;padding:2px 4px;text-decoration:underline}',
    '#fk-root .line{padding:0 12px 8px;font-size:12px;line-height:1.7}',
    '#fk-root .line.okline{color:#1e7e45}#fk-root .line.hist{color:#8a5f00}#fk-root .line.na{color:#888}',
    '#fk-root .guard{margin:0 12px 8px;padding:8px 10px;border-radius:6px;font-size:13px;line-height:1.7}',
    '#fk-root .guard.warn{border:2px solid #f0b400;background:#fffbea}#fk-root .guard.warn.done{border-color:#27ae60;background:#f2fbf5}',
    '#fk-root .guard.stop{border:2px solid #e74c3c;background:#fff1ef;color:#a5281b}',
    '#fk-root .guard .m{color:#666;font-size:12px}',
    '#fk-root .need{display:flex;gap:16px;align-items:flex-end;padding:2px 12px 10px;flex-wrap:wrap}',
    '#fk-root .need .f{display:flex;flex-direction:column;gap:3px}',
    '#fk-root .need .f>span{font-size:12px;color:#555}',
    '#fk-root .need input{width:90px;font:inherit;padding:6px 8px;border:1px solid #cfd5d8;border-radius:3px}',
    '#fk-root .need .f.wide input{width:280px}',
    '#fk-root .need .f.cr input{width:440px}','#fk-root .need .f.cr select{max-width:340px}','#fk-root .need input[readonly]{background:#f2f4f5;color:#333}',
    '#fk-root .line.crl{color:#1e7e45}#fk-root .line.crl.warn{color:#8a5f00}',
    '#fk-root .pic{display:flex;align-items:center;gap:8px}',
    '#fk-root .pic img{height:44px;max-width:120px;border:1px solid #cfd5d8;border-radius:3px;background:#fff;object-fit:contain}',
    '#fk-root .picbtn{display:inline-block;cursor:pointer;padding:6px 10px;border:1px solid #cfd5d8;border-radius:3px;background:#fff;font-size:13px}',
    '#fk-root .need select{font:inherit;padding:6px 8px;border:1px solid #cfd5d8;border-radius:3px}',
    '#fk-root .total{font-size:13px;padding-bottom:7px;color:#1b6fa8;font-weight:bold;min-width:110px}',
    '#fk-root .bad{border-color:#e74c3c !important;background:#fff6f5}',
    '#fk-root .mi{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '#fk-root .why,#fk-root .src{font-size:11px;color:#2c6e9b;background:#eef6fc;padding:3px 8px;border-radius:10px}',
    '#fk-root .mi.predicted .why{color:#8a5f00;background:#fff3cf}',
    '#fk-root .mi.predicted select{border-color:#f0b400;background:#fffbea}',
    '#fk-root details{margin:0 12px 10px}',
    '#fk-root summary{cursor:pointer;color:#2c6e9b;font-size:12px;padding:4px 0}',
    '#fk-root .grid{display:grid;grid-template-columns:140px 1fr 210px;gap:6px 10px;padding:8px 0 2px;align-items:start}',
    '#fk-root .grid label{color:#555;padding-top:6px;font-size:13px}',
    '#fk-root .grid label.req::after{content:" *";color:#e74c3c}',
    '#fk-root .grid input,#fk-root .grid select{width:100%;font:inherit;padding:5px 7px;border:1px solid #cfd5d8;border-radius:3px}',
    '#fk-root .grid input[readonly]{background:#f2f4f5;color:#555;font-family:Consolas,monospace}',
    '#fk-root .grid .src{margin-top:4px;justify-self:start}',
    '#fk-root .tbl{margin:4px 0 0;font-size:12px}#fk-root .tbl table{width:auto}#fk-root .tbl td{padding:4px 10px 4px 0;border:none}#fk-root .tbl select{font:inherit;font-size:12px;padding:2px 4px}',
    '#fk-root .res{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}',
    '#fk-root .res .r{border:1px solid #e3e7e8;border-radius:6px;padding:10px}',
    '#fk-root .res .r.ng{border:2px solid #e74c3c;color:#a5281b}',
    '#fk-root .res img{width:100%;border:1px solid #eee;margin:6px 0}',
    '#fk-root .res a{margin-right:10px;color:#2a8fd6}',
    '#fk-root .cmp{border:2px solid #f0b400;background:#fffbea;border-radius:6px;padding:8px 10px;margin:6px 0 8px;font-size:13px}','#fk-root .cmp.done{border-color:#27ae60;background:#f2fbf5}',
    '#fk-root .res .r.st{grid-column:1/-1;display:grid;grid-template-columns:290px 1fr;column-gap:18px;align-items:start}','#fk-root .res .r.st>*{grid-column:1}','#fk-root .res .r.st>.cmp{grid-column:2;grid-row:1/span 12;margin:0;min-width:0}',
    '#fk-root .cmp .crimg{width:auto !important;max-width:100%;height:auto;max-height:64px;border:1px solid #e3e7e8 !important}','#fk-root .cmp .crtxt{line-height:1.6}',
    '#fk-root .cmp table{width:100%}','#fk-root .cmp th{background:none;position:static;white-space:nowrap;color:#666;font-size:12px;padding:3px 8px 3px 0;border:none;vertical-align:top;width:1%}','#fk-root .cmp td{border:none;padding:3px 0;white-space:normal !important;word-break:break-all}',
    '#fk-root .cmp .crtxt{font-size:15px;font-weight:bold;font-family:"Yu Gothic","Meiryo",sans-serif}','#fk-root .cmp .cap{font-size:11px;color:#666;margin-top:6px}','#fk-root .cmp .crimg{background:#fff;margin:2px 0 6px}',
    '#fk-root .cmp .ng{color:#c0392b}','#fk-root .cmp .okm{color:#1e7e45;font-size:12px}','#fk-root .cmp .memo{font-size:12px;color:#8a5f00;margin:4px 0;white-space:pre-wrap}','#fk-root .cmp small{color:#888}',
    '#fk-root .cmp label{display:block;margin-top:8px;font-weight:bold;cursor:pointer}','#fk-root .cmp a{display:inline-block;font-size:12px}',
    '#fk-root .res ul{margin:4px 0 6px;padding-left:0;list-style:none;font-size:12px;line-height:1.7}',
    '#fk-root .res li::before{content:"✓ ";color:#27ae60;font-weight:bold}',
    '#fk-root .res li.w::before{content:""}#fk-root .res li.w{color:#8a5f00}',
    '#fk-root .saveall{margin-top:8px;padding:8px 16px;border:0;border-radius:6px;background:#3498db;color:#fff;font-size:14px;font-weight:bold;cursor:pointer}',
    '#fk-root .savehint{color:#888;font-size:12px}',
    '#fk-root .after{margin-top:14px;padding:12px;background:#f7f9fa;border-radius:6px;font-size:13px;line-height:1.8}',
    '#fk-root .wait{padding:40px;text-align:center;color:#888}',
    '.fk-open{background:#2a8fd6;color:#fff;border:1px solid #2a8fd6;border-radius:4px;padding:0 16px;height:40px;font-size:14px;font-weight:bold;cursor:pointer;margin-left:8px}'
  ].join('\n');

  function build() {
    if (root) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'fk-root';
    root.innerHTML = '<div class="pop"><h2><span>副資材・カートンを作る</span>' +
      '<span class="steps"><span data-s="0">商品を選ぶ</span><span data-s="1">1 中身を確かめる</span><span data-s="2">2 できあがりを見る</span><span data-s="3">3 確定</span></span>' +
      '<button class="x" title="閉じる">×</button></h2><div class="body"></div>' +
      '<div class="foot"><span class="msg"></span><button class="back">戻る</button><button class="close">閉じる</button><button class="primary go"></button></div></div>';
    document.body.appendChild(root);
    $('.x').onclick = $('.close').onclick = function () { root.classList.remove('on'); };
    $('.back').onclick = function () { setStep(step === 2 ? 1 : 0); step === 0 ? renderPick() : render(); };
    $('.go').onclick = onGo;
  }
  function setStep(n) {
    step = n;
    $$('.steps span').forEach(function (s) { s.classList.toggle('on', +s.dataset.s === n); });
    $('.back').style.display = (n === 1 || n === 2) ? '' : 'none';
    $('.go').disabled = false;
    $('.go').textContent = n === 0 ? '次へ' : n === 1 ? '下書きを作る' : n === 2 ? '確定する' : '保存先を選んで、まとめて保存';
  }
  function msg(text, cls) { var m = $('.msg'); m.className = 'msg ' + (cls || ''); m.textContent = text; }
  function fail(e) { msg('うまくいきませんでした：' + (e && e.message ? e.message : e), 'bad'); $('.go').disabled = false; }

  // ---------- 0 商品を選ぶ ----------
  // ids を渡すと(進捗表で行を選んでから押したとき)、商品選びを飛ばして、その商品の中身の確認から始める
  function open(ids) {
    ids = (Array.isArray(ids) ? ids : []).map(Number).filter(function (n) { return n > 0; });
    build(); root.classList.add('on'); setStep(0); picked = {}; pickFilter = ''; skipped = 0;
    $('.body').innerHTML = '<div class="wait">' + SRC.label + 'を読んでいます…</div>'; msg(''); $('.go').disabled = true;
    var cond = SRC.base; if (!cond) { try { cond = kintone.app.getQueryCondition() || ''; } catch (e) { /* 条件なしで読む */ } }
    var load = ids.length
      ? Promise.all(chunk(ids, 100).map(function (part) { return kget(APP, '$id in (' + part.join(',') + ')', READ); })).then(function (pages) { return [].concat.apply([], pages); })
      : kget(APP, (cond ? cond + ' ' : '') + 'order by $id desc', READ);
    load.then(function (recs) {
      products = recs.map(toProduct);
      // JAN のある商品(=作れる商品)を上に。それぞれの中は新しい順のまま
      products = products.filter(function (p) { return p.jan; }).concat(products.filter(function (p) { return !p.jan; }));
      if (!ids.length) return renderPick();
      var ok = products.filter(function (p) { return p.jan; });
      if (ok.length && ok.length <= 50) {   // 選んだ行に JAN があれば、そのまま中身の確認へ
        ok.forEach(function (p) { picked[p.id] = 1; });
        skipped = products.length - ok.length;
        return prepare();
      }
      renderPick();
      msg(ok.length ? '一度に作れるのは 50 商品までです。作る商品を選び直してください' : '選んだ行には JAN の入った商品がありません', 'bad');
    }).catch(fail);
  }
  function renderPick() {
    $('.body').innerHTML = '<input class="find" placeholder="商品名・JAN でさがす" value="' + esc(pickFilter) + '">' +
      '<table><thead><tr><th style="width:34px"></th><th>商品名</th><th>商材</th><th>製造先</th><th>JAN</th><th>税込</th></tr></thead><tbody></tbody></table>';
    var draw = function () {
      var q = pickFilter.trim().toLowerCase();
      var list = products.filter(function (p) { return !q || (p.name + ' ' + p.jan).toLowerCase().indexOf(q) >= 0; });
      $('tbody').innerHTML = list.slice(0, 300).map(function (p) {
        return '<tr class="row" data-id="' + p.id + '"><td><input type="checkbox" ' + (picked[p.id] ? 'checked' : '') + (p.jan ? '' : ' disabled') + '></td><td>' + esc(p.name) +
          '</td><td>' + esc(p.category) + '</td><td>' + (esc(p.seizo) || '<span style="color:#aaa">空</span>') + '</td><td class="num">' + (esc(p.jan) || '<span style="color:#e74c3c">JANなし</span>') +
          '</td><td>' + (p.priceIn ? esc(Math.round(+p.priceIn)) + '円' : '<span style="color:#aaa">空</span>') + '</td></tr>';
      }).join('') + (list.length > 300 ? '<tr><td colspan="6" style="color:#888">ほか ' + (list.length - 300) + ' 件。上の欄でさがしてください</td></tr>' : '');
      $$('tr.row').forEach(function (tr) {
        tr.onclick = function (e) {
          var c = tr.querySelector('input'); if (c.disabled) return;
          if (e.target !== c) c.checked = !c.checked;
          if (c.checked) picked[tr.dataset.id] = 1; else delete picked[tr.dataset.id];
          foot();
        };
      });
    };
    var foot = function () {
      var n = Object.keys(picked).length;
      msg(n ? n + '件選択中' : '作る商品にチェックを入れてください(JAN のない商品は選べません)', n ? 'good' : '');
      $('.go').disabled = n === 0; $('.go').textContent = n ? '次へ(' + n + '件)' : '次へ';
    };
    $('.find').oninput = function (e) { pickFilter = e.target.value; draw(); };
    draw(); foot();
  }
  function prepare() {
    var sel = products.filter(function (p) { return picked[p.id]; });
    if (sel.length > 50) { msg('一度に作れるのは 50 商品までです(いま ' + sel.length + ' 件)', 'bad'); return; }
    $('.go').disabled = true; msg('JANマスターと照合しています…');
    var jans = sel.map(function (p) { return p.jan; }).filter(Boolean);
    var inq = function (code, part) { return code + ' in (' + part.map(function (j) { return '"' + j + '"'; }).join(',') + ')'; };
    master = {};
    var pMaster = Promise.all(chunk(jans, 100).map(function (part) {
      return kget(CONFIG.appMaster, inq('パックJAN', part), ['$id', 'パックJAN', '商品名', '税込価格', '備考']);
    })).then(function (pages) {
      [].concat.apply([], pages).forEach(function (r) {
        var j = val(r, 'パックJAN');
        (master[j] = master[j] || []).push({ id: r.$id.value, name: val(r, '商品名'), priceIn: val(r, '税込価格'), note: val(r, '備考') });
      });
    });
    var pDup = Promise.all(chunk(jans, 100).map(function (part) { return kget(APP, inq(F.jan, part), ['$id', F.jan]); }))
      .then(function (pages) {
        var c = {}; [].concat.apply([], pages).forEach(function (r) { var j = val(r, F.jan); c[j] = (c[j] || 0) + 1; });
        sel.forEach(function (p) { p.dup = c[p.jan] || 1; });
      });
    var pSeizo = seizoNames ? Promise.resolve() : kget(CONFIG.appSeizo, '', ['製造先名']).then(function (rs) {
      seizoNames = rs.map(function (r) { return val(r, '製造先名'); });
    }).catch(function () { seizoNames = []; });   // 製造先マスタが読めない人でも作れる(原産国は選んでもらう形になる)
    Promise.all([pMaster, pDup, pSeizo]).then(function () {
      if (!F.price) sel.forEach(function (p) {   // 価格の項目がないアプリ(進捗表)は、JANマスターの価格を使う
        if (!p.priceIn && master[p.jan] && master[p.jan].length === 1) p.priceIn = master[p.jan][0].priceIn;
      });
      return call('prepare', { products: sel, master: master, seizoNames: seizoNames, sourceName: SRC.label });
    }).then(function (r) {
      countries = r.countries; items = r.items; titles = r.titles || []; titlesAt = r.titlesAt || '';
      items.forEach(function (it) { it.guardOk = false; it.open = false; });
      kinds = {};   // 作るものは、開いた人が選ぶ(最初から選んでおくと、カートンと副資材が一緒に作られてしまう)
      setStep(1); render();
      if (skipped) { msg('選んだ行のうち、JAN のない ' + skipped + ' 件は外しました'); skipped = 0; }
    }).catch(fail);
  }

  // ---------- ©:タイトルマスターから ----------
  // 作品を選ぶと、タイトルマスターの字のまま©が入る(手では直せない)。「タイトルマスターに無い」を選んだときだけ手で入れられる。
  // 作るときにサーバーがもう一度マスターと見比べる。
  var fld = function (it, key) { return it.kinds.sticker.fields.filter(function (f) { return f[0] === key; })[0]; };
  var titleOf = function (id) { return titles.filter(function (t) { return t.id === id; })[0]; };
  var tLabel = function (t) { return t.name + (t.note ? '(' + t.note + ')' : '') + (t.cr ? (t.verified ? ' ✓' : ' ※未確認') : ' ※©なし'); };
  function applyCr(it) {
    var ft = fld(it, 'crTitle'), ff = fld(it, 'crForm'), fc = fld(it, 'copyright'), ok = fld(it, 'crOk');
    if (!ft || !fc) return;
    var t = titleOf(ft[2]);
    if (t && ff[2] === 'short' && !t.crShort) ff[2] = 'full';   // 短縮表記の無い作品は正規表記
    if (t && !t.cr) { ft[2] = ''; t = null; }
    fc[2] = t ? (ff[2] === 'short' ? t.crShort : t.cr) : '';
    fc[6] = !!t; fc[3] = t ? 'タイトルマスターの字のまま' : '監修済みの表記を入れてください';
    if (ok) ok[2] = '';   // ©が変わったら、目視確認はやり直し
  }
  var hk = function (x) { return String(x || '').normalize('NFKC').toLowerCase().replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)/g, '').replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]/g, ''); };
  function holderCheck(a, b) {
    var sp = function (x) { return String(x || '').normalize('NFKC').split(/[\/、,\n;]/).map(hk).filter(function (y) { return y.length >= 2; }); };
    var A = sp(a), B = sp(b);
    if (!A.length || !B.length) return 'unknown';
    return A.some(function (x) { return B.some(function (y) { return x.indexOf(y) >= 0 || y.indexOf(x) >= 0; }); }) ? 'same' : 'differ';
  }
  function stale() {   // 写しが1日より古いときは知らせる(Apps Script が止まっている)
    var m = /^(\d+)-(\d+)-(\d+) (\d+):(\d+)$/.exec(titlesAt); if (!m) return false;
    return Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]) > 26 * 3600 * 1000;
  }
  function crLine(it) {
    var ft = fld(it, 'crTitle'); if (!ft) return '';
    var t = titleOf(ft[2]), at = titlesAt ? '(写し ' + esc(titlesAt.slice(5)) + (stale() ? '・⚠ 1日より古い写しです' : '') + ')' : '';
    if (!t) return '<div class="line crl warn">⚠ ©：' + esc(ft[2] ? '選んだ作品が見つかりません' : ft[3]) + '</div>';
    var hc = holderCheck(it.product.holder, t.holder), w = !t.verified || hc === 'differ' || stale();
    return '<div class="line crl ' + (w ? 'warn' : '') + '">' + (w ? '⚠' : '✓') + ' ©はタイトルマスター「' + esc(t.name) + '」' + (t.id !== t.name ? '(' + esc(t.id) + ')' : '') + 'から' +
      (t.verified ? '・確認済み' : '・<b>マスターで「確認済み」になっていません</b>') +
      (hc === 'same' ? '・権利元も' + SRC.label + 'と一致(' + esc(t.holder) + ')' : hc === 'differ' ? '・<b>権利元の書き方が違います</b>：' + SRC.label + '「' + esc(it.product.holder) + '」／マスター「' + esc(t.holder) + '」' : '') +
      ((ft[8] || []).indexOf(t.id) >= 0 && ft[9] ? '・' + esc(ft[9]) : '') +
      ' ' + at + '<br>' + esc(fld(it, 'copyright')[2]) + '</div>';
  }

  // ---------- 1 中身を確かめる ----------
  var avail = function (k) { return items.some(function (it) { return it.kinds[k].available; }); };
  var activeKinds = function (it) { return Object.keys(kinds).filter(function (k) { return it.kinds[k].available; }); };
  var lvl = function (it) { return it.guard ? it.guard.level : 'ok'; };
  function todo(it) {
    var t = [];
    if (lvl(it) === 'stop') return t;
    if (lvl(it) === 'warn' && !it.guardOk) t.push('JANマスターとの違いを確かめる');
    activeKinds(it).forEach(function (k) {
      it.kinds[k].fields.forEach(function (f) {
        var v = String(f[2] == null ? '' : f[2]).trim();
        if (f[4] && !v) t.push(f[1] + 'を入れる'); else if (v && NUM[f[0]] && !isInt(v)) t.push(f[1] + 'は数字で');
      });
    });
    if (!it.madeIn.value) t.push('原産国を選ぶ'); else if (it.madeIn.state === 'predicted') t.push('原産国の予測を確かめる');
    return t;
  }
  var noKind = function () { return !Object.keys(kinds).length; };
  function status(it) { return lvl(it) === 'stop' ? 'stopped' : !activeKinds(it).length ? 'none' : todo(it).length ? 'todo' : 'ready'; }

  function render() {
    var rank = { todo: 0, none: 1, ready: 2, stopped: 3 };   // 入力が要る商品を上に、作らない商品を下に
    items = items.map(function (it, i) { return [rank[status(it)], i, it]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (x) { return x[2]; });
    var multi = items.length >= 2;
    $('.body').innerHTML = '<div class="kinds"><span class="lab">作るもの</span>' +
      Object.keys(KIND).map(function (k) {
        return '<span class="kchip ' + (kinds[k] ? 'on' : '') + ' ' + (avail(k) ? '' : 'off') + '" data-k="' + k + '">' + (kinds[k] ? '✓ ' : '') + KIND[k] +
          (avail(k) ? '' : ' <small>(選んだ商品の型がまだありません)</small>') + '</span>';
      }).join('') + '</div>' +
      (multi && kinds.carton ? '<div class="bulk">入り数をまとめて入れる： 1袋 <input class="bper" inputmode="numeric"> 個 × <input class="bbags" inputmode="numeric"> 袋 ' +
        '<button class="small bfill">空いている所に入れる</button><span style="color:#888;font-size:12px">(すでに入っている商品は変えません)</span></div>' : '') +
      items.map(cardHtml).join('') +
      '<details class="tbl"><summary>製造先と原産国の対応表を見る・直す</summary><div class="tblbody">読み込み中…</div></details>';
    $$('.kchip').forEach(function (c) {
      c.onclick = function () { var k = c.dataset.k; if (!avail(k)) return; if (kinds[k]) delete kinds[k]; else kinds[k] = 1; render(); };
    });
    if (multi && kinds.carton) $('.bfill').onclick = function () {
      var per = $('.bper').value.trim(), bags = $('.bbags').value.trim();
      items.forEach(function (it) {
        it.kinds.carton.fields.forEach(function (f) {
          if (f[0] === 'perBag' && per && !String(f[2]).trim()) f[2] = per;
          if (f[0] === 'bags' && bags && !String(f[2]).trim()) f[2] = bags;
        });
      });
      render();
    };
    $$('.card').forEach(function (card) { wire(card, items[+card.dataset.i]); });
    $('.tbl').ontoggle = function (e) { if (e.target.open) loadTable(); };
    foot1();
  }
  function cardHtml(it, i) {
    var st = status(it), ak = activeKinds(it), main = [], detail = [];
    ak.forEach(function (k) { it.kinds[k].fields.forEach(function (f, j) { (f[5] === 'main' ? main : detail).push([k, j, f]); }); });
    var hist = (it.history || []).filter(function (h) { return kinds[h.kind]; });
    var h = '<div class="card ' + st + '" data-i="' + i + '"><div class="ttl"><b>' + esc(it.productName) + '</b><span class="chip">' + esc(it.category) + '</span><span class="state"></span>' +
      (items.length > 1 ? '<button class="rm" title="この商品を今回の作成から外します">今回は外す</button>' : '') + '</div>' + guardHtml(it);
    if (st === 'stopped') return h + '</div>';
    if (hist.length) h += '<div class="line hist">⚠ ' + hist.map(function (x) { return (x.kind === 'carton' ? 'カートン' : '副資材シール') + 'は ' + esc(x.at) + ' に' + (x.by ? esc(x.by) + 'さんが' : '') + '作成済み'; }).join('／') + '。作り直すと新しい版として残ります。</div>';
    if (!ak.length) return h + '</div>';
    if (kinds.sticker && it.kinds.sticker.available) h += crLine(it);
    var per = main.filter(function (m) { return m[2][0] === 'perBag'; })[0];
    var opts = function (f, attr) {   // 選ぶ形の項目(8番目に [値, 見出し] の並び)
      return '<select ' + attr + '>' + f[7].map(function (o) { return '<option value="' + esc(o[0]) + '" ' + (String(f[2]) === o[0] ? 'selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    };
    var mainHtml = function (m) {
      var f = m[2], attr = 'data-k="' + m[0] + '" data-j="' + m[1] + '"';
      if (f[7] === 'file') return '<div class="f wide"><span>' + esc(f[1]) + '</span><div class="pic">' + (f[2] ? '<img src="' + esc(f[2]) + '">' : '') +
        '<label class="small picbtn">' + (f[2] ? '選び直す' : '絵を選ぶ') + '<input type="file" accept="image/png,image/jpeg" data-file="1" data-k="' + m[0] + '" data-jj="' + m[1] + '" hidden></label>' +
        (f[2] ? '<button type="button" class="small picrm" data-k="' + m[0] + '" data-jj="' + m[1] + '">外す</button>' : '<span class="src" title="' + esc(f[3]) + '">絵が要る型だけ</span>') + '</div></div>';
      if (f[7] === 'titles') {   // 作品を選ぶ。商品名から当たった作品を上に、残りは読みの順
        var cand = (f[8] || []).map(titleOf).filter(Boolean), rest = titles.filter(function (t) { return cand.indexOf(t) < 0; })
          .sort(function (a, b) { return (a.yomi || a.name).localeCompare(b.yomi || b.name, 'ja'); });
        var op = function (t) { return '<option value="' + esc(t.id) + '" ' + (f[2] === t.id ? 'selected' : '') + (t.cr ? '' : ' disabled') + '>' + esc(tLabel(t)) + '</option>'; };
        return '<div class="f cr"><span>' + esc(f[1]) + '</span><select ' + attr + ' data-cr="1" title="' + esc(f[3]) + '"><option value="">' + (titles.length ? 'タイトルマスターに無い(©を手で入れる)' : 'タイトルマスターの写しがありません(©を手で入れる)') + '</option>' +
          (cand.length ? '<optgroup label="商品名から当たった作品">' + cand.map(op).join('') + '</optgroup><optgroup label="ほかの作品">' + rest.map(op).join('') + '</optgroup>' : rest.map(op).join('')) + '</select></div>';
      }
      if (f[0] === 'crForm') return '<div class="f"><span>' + esc(f[1]) + '</span><select ' + attr + ' data-cr="1">' + f[7].map(function (o) {
        var t = titleOf(fld(it, 'crTitle')[2]), off = o[0] === 'short' && t && !t.crShort;
        return '<option value="' + esc(o[0]) + '" ' + (String(f[2]) === o[0] ? 'selected' : '') + (off ? ' disabled' : '') + '>' + esc(o[1]) + (off ? '(マスターに無い)' : '') + '</option>'; }).join('') + '</select></div>';
      if (f[0] === 'copyright') return '<div class="f cr"><span>' + esc(f[1]) + '</span><input ' + attr + ' value="' + esc(f[2]) + '" title="' + esc(f[3]) + '" ' + (f[6] ? 'readonly' : 'placeholder="監修済みの表記を入れてください"') + '></div>';
      return '<div class="f' + (NUM[f[0]] ? '' : ' wide') + '"><span>' + esc(f[1]) + '</span>' + (f[7] ? opts(f, attr) : '<input ' + attr + ' value="' + esc(f[2]) + '" ' + (NUM[f[0]] ? 'inputmode="numeric"' : 'title="' + esc(f[3]) + '"') + '>') + '</div>';
    };
    // カートンの入力(個数)→合計→副資材の入力、の順に並べる
    h += '<div class="need">' + main.filter(function (m) { return m[0] === 'carton'; }).map(mainHtml).join('') + (per ? '<div class="total"></div><div class="f"><span>&nbsp;</span><span class="src" style="margin:0 0 6px">' + esc(per[2][3]) + '</span></div>' : '') +
      main.filter(function (m) { return m[0] !== 'carton'; }).map(mainHtml).join('') +
      '<div class="f"><span>原産国</span><div class="mi ' + it.madeIn.state + '"><select class="misel"><option value="">選んでください</option>' +
      countries.map(function (c) { return '<option ' + (it.madeIn.value === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '</select><span class="why">' + esc(it.madeIn.why) + '</span>' +
      (it.madeIn.state === 'predicted' ? '<button class="small miok">' + esc(it.madeIn.value) + ' で合っている</button>' : '') + '</div></div></div>';
    h += '<details class="det" ' + (it.open ? 'open' : '') + '><summary>自動で入った内容(' + detail.length + '項目)を見る・直す</summary><div class="grid">' + detail.map(function (d) {
      var f = d[2], attr = 'data-k="' + d[0] + '" data-j="' + d[1] + '"';
      return '<label class="' + (f[4] ? 'req' : '') + '">' + esc(f[1]) + '</label>' +
        (f[7] ? opts(f, attr) : f[0] === 'template' ? '<select ' + attr + '><option value="capsule" ' + (f[2] === 'capsule' ? 'selected' : '') + '>カプセルトイ</option><option value="general" ' + (f[2] === 'general' ? 'selected' : '') + '>一般MD</option></select>'
          : '<input ' + attr + ' value="' + esc(f[2]) + '" ' + (f[6] ? 'readonly title="JAN はここでは書き換えられません。' + SRC.label + 'を直してください"' : '') + '>') +
        '<span class="src">' + esc(f[3]) + (f[6] ? '・書き換え不可' : '') + '</span>';
    }).join('') + '</div></details>';
    return h + '</div>';
  }
  function guardHtml(it) {
    var g = it.guard; if (!g) return '';
    var m = g.master ? '<div class="m">JANマスター：' + esc(g.master.name) + '／' + esc(g.master.priceIn) + '円</div>' : '';
    if (g.level === 'ok') return '<div class="line okline">✓ JAN ' + esc(it.product.jan) + ' は JANマスターと一致(商品名・税込価格も)</div>';
    if (g.level === 'stop') return '<div class="guard stop"><b>✕ JAN のずれを見つけたので、この商品は作りません</b><br>' + g.stop.map(esc).join('<br>') + m +
      '<div class="m">' + SRC.label + 'かJANマスターを直してから、もう一度開いてください。ほかの商品はこのまま作れます。</div></div>';
    return '<div class="guard warn ' + (it.guardOk ? 'done' : '') + '"><b>⚠ 確かめてください</b><br>' + g.warn.map(esc).join('<br>') + m +
      '<label><input type="checkbox" class="gchk" ' + (it.guardOk ? 'checked' : '') + '> 見比べて、同じ商品だと確かめました</label></div>';
  }
  function wire(card, it) {
    var q = function (s) { return card.querySelector(s); };
    if (q('.rm')) q('.rm').onclick = function () { items.splice(items.indexOf(it), 1); render(); };
    if (q('.gchk')) q('.gchk').onchange = function () { it.guardOk = q('.gchk').checked; q('.guard').classList.toggle('done', it.guardOk); refresh(card, it); };
    Array.prototype.forEach.call(card.querySelectorAll('[data-j]'), function (el) {
      el.oninput = el.onchange = function () {
        it.kinds[el.dataset.k].fields[+el.dataset.j][2] = el.value;
        if (el.dataset.cr) { applyCr(it); return render(); }   // 作品・書き方を変えたら、©をマスターの字で入れ直す
        refresh(card, it);
      };
    });
    if (q('.det')) q('.det').ontoggle = function () { it.open = q('.det').open; };
    // 商品の絵:その場で小さくしてから持つ(長い辺 1800 まで)。サーバーでグレーにして入れる
    Array.prototype.forEach.call(card.querySelectorAll('input[data-file]'), function (el) {
      el.onchange = function () {
        var file = el.files && el.files[0]; if (!file) return;
        var rd = new FileReader();
        rd.onload = function () {
          var im = new Image();
          im.onload = function () {
            var k = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement('canvas');
            c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
            var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
            it.kinds[el.dataset.k].fields[+el.dataset.jj][2] = c.toDataURL('image/png'); render();
          };
          im.onerror = function () { msg('この絵は読めませんでした(PNG か JPEG を選んでください)', 'bad'); };
          im.src = rd.result;
        };
        rd.readAsDataURL(file);
      };
    });
    Array.prototype.forEach.call(card.querySelectorAll('.picrm'), function (b) {
      b.onclick = function () { it.kinds[b.dataset.k].fields[+b.dataset.jj][2] = ''; render(); };
    });
    if (q('.misel')) q('.misel').onchange = function () {   // 自分で選び直したら、その商品だけの値として扱う(対応表は変えない)
      var v = q('.misel').value;
      it.madeIn = { value: v, seizo: it.madeIn.seizo, state: v ? 'chosen' : 'none', why: v ? 'この商品だけ手で選びました' : '選んでください' };
      render();
    };
    if (q('.miok')) q('.miok').onclick = function () {   // 予測を確かめた → 製造先ごとに覚える。同じ製造先のほかの商品にも効かせる
      var seizo = it.madeIn.seizo, v = it.madeIn.value; q('.miok').disabled = true;
      call('madein_set', { seizo: seizo, country: v }).then(function () {
        items.forEach(function (x) { if (x.madeIn.seizo === seizo && x.madeIn.state === 'predicted') x.madeIn = { value: v, seizo: seizo, state: 'confirmed', why: '製造先「' + seizo + '」は ' + v + ' と確認済み' }; });
        render();
      }).catch(fail);
    };
    refresh(card, it);
  }
  function refresh(card, it) {   // 入力のたびに、その商品の状態だけ書き直す(打っている途中で入力欄を作り直さない)
    var st = status(it), t = todo(it);
    card.classList.remove('ready', 'todo', 'stopped'); card.classList.add(st === 'none' ? 'todo' : st);
    card.querySelector('.state').textContent = st === 'stopped' ? '作りません' : st === 'none' ? (noKind() ? '上の「作るもの」を選んでください' : '作れる型がありません') : st === 'ready' ? '✓ そろいました' : 'あと' + t.length + 'つ：' + t[0] + (t.length > 1 ? ' ほか' : '');
    Array.prototype.forEach.call(card.querySelectorAll('[data-j]'), function (el) {
      var f = it.kinds[el.dataset.k].fields[+el.dataset.j], v = String(f[2] == null ? '' : f[2]).trim();
      el.classList.toggle('bad', !!((f[4] && !v) || (v && NUM[f[0]] && !isInt(v))));
    });
    var sel = card.querySelector('.misel'); if (sel) sel.classList.toggle('bad', !it.madeIn.value);
    var tot = card.querySelector('.total');
    if (tot) {
      var g = function (k) { return it.kinds.carton.fields.filter(function (f) { return f[0] === k; })[0][2]; };
      tot.textContent = isInt(g('perBag')) && isInt(g('bags')) ? '＝ 合計 ' + (+String(g('perBag')).normalize('NFKC') * +String(g('bags')).normalize('NFKC')) + ' 個入り' : '';
    }
    foot1();
  }
  function foot1() {
    if (step !== 1) return;
    var c = { ready: 0, todo: 0, stopped: 0, none: 0 };
    items.forEach(function (it) { c[status(it)]++; });
    var skip = c.stopped + c.none;
    if (noKind()) { msg('「作るもの」を選んでください(カートンマーク・副資材)', 'bad'); $('.go').disabled = true; $('.go').textContent = '下書きを作る'; return; }
    if (c.todo) msg('入力待ち ' + c.todo + '件(黄色の商品)。そろうと作れます' + (c.ready ? '／そろった ' + c.ready + '件' : ''), 'bad');
    else if (c.ready) msg(c.ready + '件そろいました' + (skip ? '(作らない ' + skip + '件を除く)' : ''), 'good');
    else msg('作れる商品がありません', 'bad');
    $('.go').disabled = c.todo > 0 || c.ready === 0;
    $('.go').textContent = c.ready ? '下書きを作る(' + c.ready + '件)' : '下書きを作る';
  }
  function loadTable() {
    call('madein_get', {}).then(function (d) {
      var keys = Object.keys(d.table);
      $('.tblbody').innerHTML = keys.length ? '<table>' + keys.map(function (k) {
        return '<tr><td>' + esc(k) + '</td><td>→ MADE IN <select data-s="' + esc(k) + '">' + d.countries.map(function (c) { return '<option ' + (d.table[k] === c ? 'selected' : '') + '>' + c + '</option>'; }).join('') + '<option value="">(忘れる)</option></select></td></tr>';
      }).join('') + '</table><div style="color:#888">ここを直すと、次に開いたときからその製造先の商品に効きます。</div>'
        : '<div style="color:#888">まだ覚えている製造先はありません。「○○で合っている」を押すと、ここに増えていきます。</div>';
      $$('.tblbody select').forEach(function (s) {
        s.onchange = function () { call('madein_set', { seizo: s.dataset.s, country: s.value }).then(loadTable).catch(fail); };
      });
    }).catch(function (e) { $('.tblbody').textContent = '読めませんでした：' + e.message; });
  }

  // ---------- 2 できあがりを見る / 3 確定 ----------
  function onGo() {
    if (step === 0) return prepare();
    if (step === 3) return saveAll();   // 確定のあと:下の大きいボタンで、保存先のフォルダを選んでまとめて保存
    if (step === 1) {
      $('.go').disabled = true; msg('下書きを作って、バーコードを読み直しています…');
      var send = items.filter(function (it) { return status(it) === 'ready'; });
      return call('generate', { kinds: Object.keys(kinds), items: send, master: master, sourceName: SRC.label }).then(function (r) {
        draft = r; setStep(2);
        var ok = r.results.filter(function (x) { return x.ok; }), ng = r.results.length - ok.length;
        $('.body').innerHTML = '<div class="res">' + r.results.map(function (x) {
          var it = items.filter(function (i) { return i.id === x.id; })[0] || { productName: '' };
          return x.ok ? '<div class="r' + (x.kind === 'sticker' && x.cr ? ' st' : '') + '"><b>' + esc(it.productName) + '</b> <span class="chip">' + (x.kind === 'sticker' ? '副資材シール' : 'カートン') + '</span><a href="' + esc(x.png) + '" target="_blank" title="大きく見る"><img src="' + esc(x.png) + '"></a><ul>' +
            x.checks.map(function (c) { return '<li class="' + (c.indexOf('⚠') === 0 ? 'w' : '') + '">' + esc(c) + '</li>'; }).join('') + '</ul>' + cmpHtml(x) + '<a href="' + esc(x.pdf) + '" target="_blank">PDF を開く</a><a href="' + esc(x.ai) + '" download="' + esc(x.name) + '.ai">AI を保存</a></div>'
            : '<div class="r ng"><b>' + esc(it.productName) + '</b> <span class="chip">' + (x.kind === 'sticker' ? '副資材シール' : 'カートン') + '</span><br>作れませんでした：' + esc(x.error) + '</div>';
        }).join('') + '</div>';
        if (ng) msg(ng + '件が作れませんでした。「戻る」で直してください', 'bad');
        else msg(ok.length + '件の下書きができました。絵を見て、よければ「確定する」', 'good');
        $('.go').disabled = ng > 0 || ok.length === 0;
        $$('.crchk').forEach(function (c) { c.onchange = function () { c.closest('.cmp').classList.toggle('done', c.checked); gate2(); }; });
        gate2();
      }).catch(fail);
    }
    if (step === 2) {
      $('.go').disabled = true;
      var ok = draft.results.filter(function (x) { return x.ok; });
      return call('finalize', { folder: draft.folder, results: ok.map(function (x) { return { id: x.id, kind: x.kind, name: x.name, crOk: x.kind === 'sticker' }; }) }).then(function (r) {
        setStep(3);
        $('.body').insertAdjacentHTML('beforeend', '<div class="after">✓ ' + r.count + '件を確定しました(' + esc(r.at) + ')。作成の記録を残しました。<br><button type="button" class="saveall">まとめてフォルダに保存</button> <span class="savehint">保存先のフォルダを選ぶと、PDF と AI を全部まとめて入れます。1つずつ受け取るときは、上の「PDF を開く」「AI を保存」から。</span></div>');
        $('.saveall').onclick = saveAll;
        msg('確定しました。右のボタンで、保存先のフォルダを選んで PDF と AI をまとめて保存できます', 'good');
        $('.body').scrollTop = $('.body').scrollHeight;
      }).catch(fail);
    }
  }

  // 副資材シールの見比べ欄:商品名・作品・©(タイトルマスターの字)と、できあがりの©の拡大を並べる。全部に印が付くまで確定できない
  function cmpHtml(x) {
    var c = x.cr; if (x.kind !== 'sticker' || !c) return '';
    var row = function (k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; };
    return '<div class="cmp"><table>' + row('商品名', esc(c.product)) +
      row('作品', c.manual ? '<b class="ng">タイトルマスターから入れていません(手で入れた表記)</b>'
        : esc(c.title) + (c.id ? ' <small>' + esc(c.id) + '</small>' : '') + (c.verified ? ' <span class="okm">確認済み</span>' : ' <b class="ng">マスターで未確認</b>') + ' <small>' + esc(c.form) + '</small>') +
      row('©', '<span class="crtxt">' + esc(c.text) + '</span>') + '</table>' +
      (c.png ? '<div class="cap">できあがったシールの©(拡大)</div><img class="crimg" src="' + esc(c.png) + '">' : '<div class="cap">この型は©の場所が決まっていないので、上の絵で確かめてください</div>') +
      (c.holder === 'differ' ? '<div class="ng">権利元が違います：' + SRC.label + '「' + esc(c.holderA) + '」／タイトルマスター「' + esc(c.holderB) + '」</div>' : '') +
      (c.memo ? '<div class="memo">タイトルマスターの特記事項：' + esc(c.memo) + '</div>' : '') +
      (c.link ? '<a href="' + esc(c.link) + '" target="_blank" rel="noopener">タイトルマスターのこの行を開く</a>' : '') +
      '<label><input type="checkbox" class="crchk"> ' + (c.manual ? '監修済みの表記と見比べて、©が同じだと確かめました' : 'この商品はこの作品で合っていて、絵の©も同じだと確かめました') + '</label></div>';
  }
  function gate2() {
    if (step !== 2) return;
    var all = $$('.crchk'), left = all.filter(function (c) { return !c.checked; }).length;
    var bad = draft.results.some(function (x) { return !x.ok; });
    if (left) msg('副資材シールの見比べが あと' + left + '件 残っています(商品名・作品・©を見て、印を付けてください)', 'bad');
    else if (all.length && !bad) msg('見比べが済みました。よければ「確定する」', 'good');
    $('.go').disabled = bad || left > 0 || !draft.results.some(function (x) { return x.ok; });
  }

  // ---------- まとめてフォルダに保存(確定のあと) ----------
  // 保存先はその場で選ぶ(共有ドライブのフォルダも選べる)。同じ名前のファイルがあるときは、上書きの前に必ず聞く。
  function saveAll() {
    if (!window.showDirectoryPicker) return msg('このブラウザではフォルダを選んで保存できません。Chrome か Edge で開いてください', 'bad');
    var files = [];
    draft.results.filter(function (x) { return x.ok; }).forEach(function (x) {
      files.push({ name: x.name + '.pdf', url: x.pdf }); files.push({ name: x.name + '.ai', url: x.ai });
    });
    var dir;
    window.showDirectoryPicker({ id: 'bcr-fukushizai', mode: 'readwrite' }).then(function (d) {
      dir = d; msg('保存しています…');
      return Promise.all(files.map(function (f) { return dir.getFileHandle(f.name).then(function () { return f.name; }, function () { return null; }); }));
    }).then(function (exist) {
      exist = exist.filter(Boolean);
      if (exist.length && !window.confirm('このフォルダには、同じ名前のファイルが ' + exist.length + ' 個あります。上書きしますか?\n\n' + exist.slice(0, 6).join('\n') + (exist.length > 6 ? '\nほか' : ''))) return 0;
      return files.reduce(function (p, f) {
        return p.then(function () {
          return fetch(f.url).then(function (r) { if (!r.ok) throw new Error(f.name + ' を取り出せませんでした'); return r.blob(); }).then(function (b) {
            return dir.getFileHandle(f.name, { create: true }).then(function (h) { return h.createWritable(); }).then(function (w) { return w.write(b).then(function () { return w.close(); }); });
          });
        });
      }, Promise.resolve()).then(function () { return files.length; });
    }).then(function (n) {
      if (n) msg('フォルダ「' + dir.name + '」に ' + n + ' 個のファイルを保存しました', 'good'); else msg('保存をやめました');
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return msg('保存をやめました');
      msg('保存できませんでした：' + (e && e.message ? e.message : e), 'bad');
    });
  }

  // ---------- 入口:一覧「副資材・カートン」のときだけボタンを出す ----------
  window.BCR_FUKU = { open: open };   // 進捗表の表(別の枠の中)から呼ぶ入口: parent.BCR_FUKU.open([レコード番号…])
  function onIndex(ev) {
    if (APP !== 852 || ev.viewName !== CONFIG.view) return ev;   // ボタンを足すのは商品管理表の専用一覧だけ。進捗表は表の道具列のボタンから開く
    if (document.querySelector('.fk-open')) return ev;   // 古い登録(ファイル版)が残っていても、ボタンは1つだけ
    var b = document.createElement('button'); b.className = 'fk-open'; b.type = 'button'; b.textContent = '副資材・カートンを作る';
    b.onclick = open;
    build();   // 見た目(ボタンの色)を先に入れておく
    kintone.app.getHeaderMenuSpaceElement().appendChild(b);
    return ev;
  }
  if (MADO) MADO.feature('fukushizai', { 'app.record.index.show': onIndex });   // 窓口から呼ばれる
  else kintone.events.on('app.record.index.show', onIndex);                      // 単体で登録されたとき
})();
