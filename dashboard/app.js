// Stickiness Radar dashboard. Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, plus the model and the farm cost table. No network:
// every byte it shows is in data.js. The page recomputes each row's headline number from
// the snapshot figures it carries, so the page's arithmetic and the board's data are
// visibly the same.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', tvl: 0, watchlist: false,
    tab: 'pre-token', sort: 'value', dir: -1, selected: null
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function money(n) { return '$' + Number(n).toLocaleString('en-US'); }
  function fmtFactor(n) { return 'x' + Number(n).toFixed(2); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'checked') node.checked = !!attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The model in one function: base value times the stability factor times the age factor.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.base_value_usd * row.stability_factor * row.age_factor));
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tvl')) state.tvl = Number(params.get('tvl')) || 0;
    if (params.get('wl') === '1') state.watchlist = true;
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tvl) params.set('tvl', String(state.tvl));
    if (state.watchlist) params.set('wl', '1');
    if (state.sort !== 'value') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isWatchlist(r) { return r.tvl_usd >= DATA.floor_usd; }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.tvl && r.tvl_usd < state.tvl) return false;
      if (state.watchlist && !isWatchlist(r)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'stability') { av = a.stability_factor; bv = b.stability_factor; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Stickiness Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Capital that stays is worth more than capital that visits' }),
        el('p', { text: 'A protocol whose TVL barely moves week to week, and that has run for years with no token, has a record a token launch would inherit. This board ranks pre-token protocols by that durability: their TVL priced like the median token-bearing protocol, then weighted toward calm weeks and long histories. The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median mcap / TVL' }), el('b', { text: String(DATA.median_ratio) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var tvl = el('select', { id: 'tvl', 'aria-label': 'Filter by minimum TVL' },
      [[0, 'Any TVL'], [50e6, 'TVL \u2265 $50M'], [100e6, 'TVL \u2265 $100M'], [500e6, 'TVL \u2265 $500M'], [1e9, 'TVL \u2265 $1B']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: state.tvl === o[0] ? 'selected' : null });
      })
    );
    tvl.addEventListener('change', function () { state.tvl = Number(tvl.value); writeHash(); render(); });
    var sort = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['value', 'Implied value'], ['tvl', 'TVL'], ['stability', 'Stability factor'], ['age', 'Age'], ['growth', '7-day growth'], ['name', 'Name']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: state.sort === o[0] ? 'selected' : null });
      })
    );
    sort.addEventListener('change', function () { state.sort = sort.value; state.dir = state.sort === 'name' ? 1 : -1; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.watchlist });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'TVL' }), tvl),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort by' }), sort),
      el('label', { class: 'check', for: 'wl' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or TVL to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tvl = 0; state.watchlist = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      // Stability bar: 0.85 -> 0%, 1.15 -> 100%.
      var stabPct = Math.max(3, Math.round(((r.stability_factor - 0.85) / 0.3) * 100));
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', null, el('div', { class: 'meter-cell' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + stabPct + '%' })),
          el('span', { class: 'factor', text: fmtFactor(r.stability_factor) })
        )),
        el('td', null, el('div', { class: 'meter-cell' },
          el('div', { class: 'bar plum', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(((r.age_factor - 0.7) / 0.3) * 100)) + '%' })),
          el('span', { class: 'factor plum', text: fmtAge(r.age_days) })
        )),
        el('td', null, el('div', { class: 'meter-cell' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'value', text: money(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: isWatchlist(r) ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, most durable first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('value', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('stability', 'Stability'),
            sortHeader('age', 'Age'),
            sortHeader('value', 'Implied value'),
            el('th', { scope: 'col', text: 'Set' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel section' },
      el('h2', { text: 'How the ranking is computed' }),
      el('div', { class: 'formula' },
        'base = tvl_usd x ' + DATA.median_ratio + ' (median mcap/TVL of token-bearing protocols)'
      ),
      el('div', { class: 'formula' },
        'stability = ' + m.stability_base + ' - min(|change_7d|, ' + m.stability_cap_pct + ') / ' + m.stability_cap_pct + ' x ' + m.stability_slope + '   (1.15 at a 0% week, 0.85 at a 60% week or more)'
      ),
      el('div', { class: 'formula' },
        'age = ' + m.age_floor + ' + min(age_days, ' + m.age_days + ') / ' + m.age_days + ' x ' + m.age_range + '   (1.00 at three years)  —  implied = round(base x stability x age)'
      ),
      el('p', { text: 'A wild week costs the same in either direction: a +60% week and a -60% week are equally unreliable as a base to stand on. An unreported 7-day change earns the neutral 1.00, never the top of the range, and an unknown listing date counts as ' + m.unknown_age_days + ' days. No protocol name is special-cased, and no row is hand-picked.' }),
      el('p', { text: 'Implied value is a model, not a price prediction: it says what a token might be worth if the market priced this protocol like the median token-bearing protocol, weighted toward calm weeks and long histories. Airdrops are never guaranteed.' })
    );
  }

  function costPanel() {
    var entries = Object.entries(DATA.gas_table).sort(function (a, b) { return a[1] - b[1] || (a[0] < b[0] ? -1 : 1); });
    return el('section', { class: 'panel section' },
      el('h2', { text: 'Farm cost table' }),
      el('p', { text: 'Estimated all-in cost of one farm step per chain (gas plus the usual swap/pool fee and slippage allowance for a small position). These are planning estimates, not live prices — gas moves, and the ranking does not divide by cost. A chain the table does not name costs $' + DATA.gas_default_usd.toFixed(2) + ' a step.' }),
      el('table', { class: 'mini-table' },
        el('thead', null, el('tr', null, el('th', { text: 'Chain' }), el('th', { text: 'Est. cost / step' }))),
        el('tbody', null, entries.map(function (e) {
          return el('tr', null, el('td', { text: e[0] }), el('td', { text: '$' + e[1].toFixed(2) }));
        }))
      )
    );
  }

  function calmPanel() {
    var calmest = DATA.rows.slice().sort(function (a, b) { return b.stability_factor - a.stability_factor || b.tvl_usd - a.tvl_usd; }).slice(0, 5);
    return el('section', { class: 'panel section' },
      el('h2', { text: 'Calmest TVL on the board' }),
      el('p', { text: 'The five pre-token protocols whose TVL moved least in the last seven days, by stability factor. Calm is the first half of stickiness; the ranking adds age and size on top of it.' }),
      el('table', { class: 'mini-table' },
        el('thead', null, el('tr', null, el('th', { text: 'Protocol' }), el('th', { text: '7d move' }), el('th', { text: 'Stability' }), el('th', { text: 'Rank' }))),
        el('tbody', null, calmest.map(function (r) {
          return el('tr', null,
            el('td', null, el('b', { text: '#' + r.rank + ' ' + r.name })),
            el('td', { text: fmtPct(r.change_7d) }),
            el('td', { text: fmtFactor(r.stability_factor) }),
            el('td', { text: String(r.rank) })
          );
        }))
      )
    );
  }

  var drawer = el('aside', { class: 'drawer', id: 'detail', hidden: true, tabindex: '-1', 'aria-label': 'Protocol detail' });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    drawer.hidden = false;
    drawer.textContent = '';
    var perStep = row.farm_steps.length ? (row.farm_cost_usd / row.farm_steps.length) : 0;
    var recomputed = impliedOf(row);
    drawer.appendChild(el('div', { class: 'drawer-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row) ? ' \u00b7 watchlist' : ' \u00b7 early radar') }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { closeDetail(); } })
    ));
    drawer.appendChild(el('section', { class: 'drawer-section' },
      el('h3', { text: 'Stickiness breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Median mcap / TVL' }), el('b', { class: 'num', text: String(DATA.median_ratio) })),
        el('div', null, el('span', { text: 'Base value (TVL x median)' }), el('b', { class: 'num', text: fmtUsd(row.base_value_usd) })),
        el('div', null, el('span', { text: 'Seven-day TVL change' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Stability factor' }), el('b', { class: 'num', text: fmtFactor(row.stability_factor) + (row.change_7d === null ? ' (no 7-day move reported)' : '') })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Age factor' }), el('b', { class: 'num', text: fmtFactor(row.age_factor) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'big', text: money(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': base x stability x age. Recomputed in this page as ' + money(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') })
    ));
    drawer.appendChild(el('section', { class: 'drawer-section' },
      el('h3', { text: 'Farm cost' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Main chain' }), el('b', { class: 'num', text: (row.chains && row.chains.length ? row.chains[0] : 'n/a') })),
        el('div', null, el('span', { text: 'Farm steps' }), el('b', { class: 'num', text: String(row.farm_steps.length) })),
        el('div', null, el('span', { text: 'Est. cost per step' }), el('b', { class: 'num', text: '$' + perStep.toFixed(2) })),
        el('div', null, el('span', { text: 'Total farm cost' }), el('b', { class: 'num', text: '$' + row.farm_cost_usd.toFixed(2) }))
      ),
      el('p', { class: 'sub', text: 'Costs are estimates, not live gas prices. The ranking does not divide by cost — the farm is priced so you can plan it, not so it can outrank a durable protocol.' })
    ));
    drawer.appendChild(el('section', { class: 'drawer-section' },
      el('h3', { text: 'Farm plan — stay, do not visit' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    drawer.focus();
  }

  function closeDetail() {
    state.selected = null;
    drawer.hidden = true;
    writeHash();
    render();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(el('div', { class: 'two-col' }, calmPanel(), costPanel()));
      shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) app.appendChild(drawer);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !drawer.hidden) closeDetail();
  });
})();
