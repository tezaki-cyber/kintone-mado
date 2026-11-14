/*
 * BCR キントーン機能の窓口
 *
 * キントーンに登録するのは、この1本(アドレスで登録)と、合言葉のファイル(mado-config.js)だけ。
 * 機能は features/ に1つずつ置き、下の FEATURES に1行足す。キントーン側の登録は変えなくてよい。
 *
 * 決まり
 *  - この窓口は小さく保つ。画面を開いた時点では何も読み込まず、合う画面のときだけ機能を読む。
 *  - 窓口や機能が読めない・壊れているときは黙る(キントーンのふだんの画面を止めない)。
 *  - 機能を止めたいときは、その機能の on を false にする。
 *  - 機能は、決めたアプリ・一覧・画面のときだけ動かす(メニューを増やさない)。
 */
(function () {
  'use strict';
  if (window.BCR_MADO) return;                 // 二重に登録されても1回だけ動く
  var VERSION = '2026-11-14.4';                // 機能を更新したら変える(古い読み置きを使わせないため)

  // 機能の一覧。apps=動かすアプリ番号 / events=動かす画面 / views=一覧の名前(一覧の画面のときだけ見る。空ならどの一覧でも)
  var FEATURES = [
    { id: 'fukushizai', on: true, apps: [867], events: ['app.record.index.show'], views: [], src: 'features/fukushizai.js' },                     // 進捗表:表の道具列「カートンを作る」から開く
    { id: 'fukushizai', on: true, apps: [852], events: ['app.record.index.show'], views: ['副資材・カートン'], src: 'features/fukushizai.js' }   // 商品管理表(使わなくなる予定)
  ];

  var CONFIG = window.BCR_MADO_CONFIG || {};
  var me = document.currentScript;
  var BASE = CONFIG.base || (me && me.src ? me.src.replace(/[^\/]*(\?.*)?$/, '') : '');
  var off = CONFIG.off || [];                  // 合言葉のファイル側からも止められる(緊急用)
  var handlers = {}, loading = {};

  function warn(id, e) { try { console.warn('[BCR窓口] ' + id + ': ' + (e && e.message || e)); } catch (x) { /* 何もしない */ } }

  function load(f) {
    if (!loading[f.id]) loading[f.id] = new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = BASE + f.src + '?v=' + encodeURIComponent(VERSION);
      s.onload = function () { handlers[f.id] ? ok() : ng(new Error('機能が登録されませんでした')); };
      s.onerror = function () { delete loading[f.id]; ng(new Error('読み込めませんでした')); };
      document.head.appendChild(s);
    });
    return loading[f.id];
  }

  function match(f, ev) {
    if (!f.on || off.indexOf(f.id) >= 0) return false;
    var app; try { app = kintone.app.getId(); } catch (e) { return false; }
    if (f.apps.indexOf(app) < 0) return false;
    if (ev.type === 'app.record.index.show' && f.views && f.views.length && f.views.indexOf(ev.viewName) < 0) return false;
    return true;
  }

  window.BCR_MADO = {
    version: VERSION,
    config: CONFIG,
    // 機能の側が呼ぶ: BCR_MADO.feature('名前', { 'app.record.index.show': function (ev) { … } })
    feature: function (id, h) { handlers[id] = h || {}; }
  };

  var types = {};
  FEATURES.forEach(function (f) { f.events.forEach(function (t) { types[t] = true; }); });
  try {
    kintone.events.on(Object.keys(types), function (ev) {
      FEATURES.forEach(function (f) {
        if (f.events.indexOf(ev.type) < 0 || !match(f, ev)) return;
        load(f).then(function () {
          var h = handlers[f.id][ev.type];
          if (h) h(ev);
        }).catch(function (e) { warn(f.id, e); });
      });
      return ev;                                // キントーンには何も返さず、そのまま通す
    });
  } catch (e) { warn('窓口', e); }
})();
