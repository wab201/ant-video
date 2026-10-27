/* 魔都资源 CMS direct client for the Ant Video mini-app runtime. */
(function () {
  'use strict';

  var API_BASE = 'https://www.mdzyapi.com/api.php/provide/vod/';
  var STORAGE_KEY = 'catalog_state_v1';
  var POSTER_CACHE_KEY = 'poster_cache_v1';
  var requestQueue = [];
  var activeRequests = 0;
  var state = {
    classes: [],
    items: [],
    page: 1,
    pageCount: 1,
    total: 0,
    typeId: '',
    keyword: '',
    detailId: '',
    posterCache: {},
    lastFocusId: '',
    lastEpisodeSelector: '',
    catalogRequest: 0,
    detailRequest: 0
  };

  var dom = {
    body: document.body,
    env: document.getElementById('env'),
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    categoryNav: document.getElementById('category-nav'),
    catalogView: document.getElementById('catalog-view'),
    catalogTitle: document.getElementById('catalog-title'),
    catalogMeta: document.getElementById('catalog-meta'),
    catalogAlert: document.getElementById('catalog-alert'),
    catalogGrid: document.getElementById('catalog-grid'),
    catalogLoading: document.getElementById('catalog-loading'),
    catalogEmpty: document.getElementById('catalog-empty'),
    pagination: document.getElementById('pagination'),
    pageLabel: document.getElementById('page-label'),
    detailView: document.getElementById('detail-view'),
    detailAlert: document.getElementById('detail-alert'),
    detailLoading: document.getElementById('detail-loading'),
    detailContent: document.getElementById('detail-content')
  };

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setHidden(node, hidden) {
    node.hidden = !!hidden;
  }

  function errorText(error) {
    if (!error) return '未知错误';
    var prefix = error.code ? '[' + error.code + '] ' : '';
    return prefix + (error.message || String(error));
  }

  function plainText(value) {
    if (!value) return '';
    var holder = document.createElement('div');
    holder.innerHTML = String(value);
    return (holder.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function buildUrl(params) {
    var query = Object.keys(params)
      .filter(function (key) { return params[key] !== '' && params[key] !== undefined && params[key] !== null; })
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key])); })
      .join('&');
    return API_BASE + (query ? '?' + query : '');
  }

  function rawRequestCms(params) {
    if (ant.mock && window.__mdzyMockApi) {
      return window.__mdzyMockApi.request(params);
    }
    return ant.requestJson({ url: buildUrl(params), timeout: 20000 });
  }

  function pumpRequestQueue() {
    while (activeRequests < 3 && requestQueue.length) {
      var job = requestQueue.shift();
      activeRequests += 1;
      Promise.resolve()
        .then(function (currentJob) {
          return function () { return rawRequestCms(currentJob.params); };
        }(job))
        .then(job.resolve, job.reject)
        .finally(function () {
          activeRequests -= 1;
          pumpRequestQueue();
        });
    }
  }

  function requestCms(params, highPriority) {
    return new Promise(function (resolve, reject) {
      var job = { params: params, resolve: resolve, reject: reject };
      if (highPriority === false) requestQueue.push(job);
      else requestQueue.unshift(job);
      pumpRequestQueue();
    });
  }

  /* ---------------- T4 兼容服务 ---------------- */

  var T4_APP_ID = 'com.wab201.mdzy';
  var T4_SITE_KEY = 'mdzy';
  var T4_INTERNAL_BASE = 'miniapp://' + T4_APP_ID;

  function t4JsonResponse(value, statusCode) {
    return {
      status: statusCode || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(value)
    };
  }

  function t4ErrorResponse(code, message, statusCode) {
    return t4JsonResponse({ code: code, msg: message, data: null }, statusCode || 400);
  }

  function t4Unwrap(payload) {
    if (payload && payload.data && typeof payload.data === 'object' &&
        (payload.data.list || payload.data.class || payload.data.classes)) {
      return payload.data;
    }
    return payload || {};
  }

  function t4List(value) {
    return Array.isArray(value) ? value : [];
  }

  function t4Field(item, key, aliases) {
    if (item[key] !== undefined && item[key] !== null) return item[key];
    for (var index = 0; index < aliases.length; index += 1) {
      var alias = aliases[index];
      if (item[alias] !== undefined && item[alias] !== null) return item[alias];
    }
    return '';
  }

  function t4SerializeVod(item) {
    var source = item && typeof item === 'object' ? item : {};
    var vod = Object.assign({}, source);
    vod.type_id = t4Field(source, 'type_id', ['typeId']);
    vod.type_name = t4Field(source, 'type_name', ['typeName']);
    vod.vod_id = t4Field(source, 'vod_id', ['id']);
    vod.vod_name = t4Field(source, 'vod_name', ['name', 'title']);
    vod.vod_pic = t4Field(source, 'vod_pic', ['pic', 'image', 'poster']);
    vod.vod_remarks = t4Field(source, 'vod_remarks', ['remarks', 'remark']);
    var playFrom = Array.isArray(source.vod_play_from)
      ? source.vod_play_from.map(String).join('$$$')
      : String(source.vod_play_from || '');
    if (Array.isArray(source.vod_play_url)) {
      vod.vod_play_url = source.vod_play_url.map(function (line) {
        if (!Array.isArray(line)) return String(line || '');
        return line.map(function (episode) {
          if (episode && typeof episode === 'object') {
            return String(episode.name || '') + '$' + String(episode.id || episode.url || '');
          }
          return String(episode || '');
        }).join('#');
      }).join('$$$');
    } else {
      vod.vod_play_url = String(source.vod_play_url || '');
    }
    var playLines = vod.vod_play_url ? vod.vod_play_url.split('$$$') : [];
    var fromLines = playFrom ? playFrom.split('$$$') : [];
    if (playLines.length && fromLines.length < playLines.length) {
      while (fromLines.length < playLines.length) {
        fromLines.push('线路 ' + (fromLines.length + 1));
      }
    }
    if (playLines.length && fromLines.length > playLines.length) {
      fromLines = fromLines.slice(0, playLines.length);
    }
    vod.vod_play_from = fromLines.join('$$$');
    return vod;
  }

  function t4PageCount(data) {
    var value = Number(data.pagecount || data.pageCount || data.size);
    return value > 0 ? value : 1;
  }

  function t4NormalizeList(payload, requestedPage) {
    var data = t4Unwrap(payload);
    var list = t4List(data.list).map(t4SerializeVod);
    return {
      code: 1,
      msg: 'success',
      page: Number(data.page) || Number(requestedPage) || 1,
      pagecount: t4PageCount(data),
      limit: Number(data.limit) || 0,
      total: Number(data.total) || list.length,
      list: list
    };
  }

  function t4NormalizeHome(payload) {
    var data = t4Unwrap(payload);
    var list = t4List(data.list).map(t4SerializeVod);
    return {
      code: 1,
      msg: 'success',
      class: t4List(data.class || data.classes),
      filters: data.filters || {},
      page: 1,
      pagecount: 1,
      limit: Number(data.limit) || 0,
      total: Number(data.total) || list.length,
      list: list
    };
  }

  function t4DecodeOnce(value) {
    var text = String(value || '').trim();
    if (!text) return '';
    try { return decodeURIComponent(text); } catch (_) { return text; }
  }

  function t4DecodeExt(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    var text = t4DecodeOnce(value);
    try {
      if (text.charAt(0) === '{') return JSON.parse(text);
    } catch (_) {}
    try {
      var binary = atob(String(value).replace(/-/g, '+').replace(/_/g, '/'));
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (_) {
      return {};
    }
  }

  function t4NormalizePlay(value, flag) {
    var url = t4DecodeOnce(value);
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('播放地址不是 HTTP(S) 地址');
    }
    return {
      parse: 0,
      jx: 0,
      url: url,
      header: {},
      flag: String(flag || '')
    };
  }

  function t4SiteKey(req) {
    var params = (req && req.params) || {};
    var queryKey = String(params.site || '').trim();
    if (queryKey) return queryKey;
    var matched = String((req && req.path) || '').match(/^\/(?:site|s)\/([^/?#]+)/);
    return matched ? t4DecodeOnce(matched[1]) : '';
  }

  function t4BusinessPath(req) {
    return String((req && req.path) || '/').replace(/^\/(?:site|s)\/[^/?#]+/, '') || '/';
  }

  function t4IsLanHost(hostname) {
    var host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host === '::1' || /^127\./.test(host)) return false;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) || /\.local$/.test(host);
  }

  function t4LanBaseFromRequest(req) {
    var headers = (req && req.headers) || {};
    var forwarded = headers['X-Ant-Lan-Base'] || headers['x-ant-lan-base'];
    if (forwarded && /^https?:\/\//i.test(String(forwarded))) return String(forwarded).replace(/\/+$/, '');
    if (!req || !req.url) return '';
    var parsed;
    try { parsed = new URL(String(req.url)); } catch (_) { return ''; }
    if (!/^https?:$/.test(parsed.protocol) || !t4IsLanHost(parsed.hostname)) return '';
    var full = String(parsed.pathname || '/');
    var path = String(req.path || '/');
    if (path !== '/' && full.slice(-path.length) === path) {
      full = full.slice(0, full.length - path.length);
    }
    full = full.replace(/\/+$/, '').replace(/\/__service$/, '');
    return full ? parsed.protocol + '//' + parsed.host + full : '';
  }

  function t4ResolveBase(req) {
    var params = (req && req.params) || {};
    var explicit = String(params.base || params.apiBase || '').trim();
    if (/^miniapp:\/\//i.test(explicit)) return explicit.replace(/\/+$/, '');
    if (/^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, '');
    return t4LanBaseFromRequest(req) || T4_INTERNAL_BASE;
  }

  function t4Descriptor(base) {
    return {
      sites: [{
        key: T4_SITE_KEY,
        name: '魔都影视',
        type: 4,
        api: base.replace(/\/+$/, '') + '/site/' + T4_SITE_KEY,
        searchable: 1,
        quickSearch: 1,
        filterable: 1
      }]
    };
  }

  function t4CmsParams(params, category) {
    var raw = params || {};
    var output = {};
    var ext = category ? t4DecodeExt(raw.ext) : {};
    Object.keys(ext || {}).forEach(function (key) {
      if (key !== 't' && key !== 'ac' && key !== 'pg' &&
          ext[key] !== undefined && ext[key] !== null && String(ext[key]) !== '') {
        output[key] = ext[key];
      }
    });
    Object.keys(raw).forEach(function (key) {
      if (key === 'site' || key === 'base' || key === 'apiBase' || key === 'ext') return;
      if (key === 'ac') return;
      if (raw[key] !== undefined && raw[key] !== null && String(raw[key]) !== '') {
        output[key] = raw[key];
      }
    });
    output.ac = 'list';
    if (category) output.t = raw.t;
    if (raw.pg === undefined || raw.pg === null || String(raw.pg) === '') output.pg = 1;
    return output;
  }

  function t4HandleService(req) {
    var path = t4BusinessPath(req);
    var params = (req && req.params) || {};

    if (path === '/health' || path === '/api/health') {
      return Promise.resolve(t4JsonResponse({
        code: 0,
        msg: 'ok',
        data: { appId: T4_APP_ID, sources: 1, defaultSite: T4_SITE_KEY, siteKeys: [T4_SITE_KEY] }
      }));
    }
    if (path === '/config' || path === '/api/config' || path === '/api/v1/config') {
      return Promise.resolve(t4JsonResponse(t4Descriptor(t4ResolveBase(req))));
    }

    var requestedSite = t4SiteKey(req);
    if (requestedSite && requestedSite !== T4_SITE_KEY) {
      return Promise.resolve(t4ErrorResponse('SITE_NOT_FOUND', '找不到采集源: ' + requestedSite, 404));
    }

    if (params.play !== undefined && String(params.play) !== '') {
      try {
        return Promise.resolve(t4JsonResponse(t4NormalizePlay(params.play, params.flag)));
      } catch (error) {
        return Promise.resolve(t4ErrorResponse('INVALID_PLAY_URL', error.message, 400));
      }
    }

    var page = Number(params.pg) || 1;
    if (String(params.ac || '').toLowerCase() === 'detail' &&
        params.ids !== undefined && String(params.ids) !== '') {
      return requestCms({ ac: 'detail', ids: String(params.ids) }).then(function (payload) {
        return t4JsonResponse(t4NormalizeList(payload, page));
      });
    }
    if (params.wd !== undefined && String(params.wd) !== '') {
      return requestCms(t4CmsParams({ wd: params.wd, pg: page })).then(function (payload) {
        return t4JsonResponse(t4NormalizeList(payload, page));
      });
    }
    if (params.t !== undefined && String(params.t) !== '') {
      return requestCms(t4CmsParams(params, true)).then(function (payload) {
        return t4JsonResponse(t4NormalizeList(payload, page));
      });
    }
    return requestCms({ ac: 'list', pg: page, filter: 'true' }).then(function (payload) {
      return t4JsonResponse(t4NormalizeHome(payload));
    });
  }

  function t4SafeService(req) {
    return Promise.resolve().then(function () {
      return t4HandleService(req);
    }).catch(function (error) {
      var code = error && error.code ? error.code : 'UPSTREAM_FAILED';
      var message = error && error.message ? error.message : String(error);
      return t4ErrorResponse(code, message, 502);
    });
  }

  // T4 服务在页面不可见时也会被宿主调用，handler 本身只依赖请求参数和网络队列。
  ant.serve(t4SafeService);

  function parsePlayGroups(playFrom, playUrl) {
    var sources = String(playFrom || '').split('$$$');
    var groups = String(playUrl || '').split('$$$');

    return groups.map(function (group, groupIndex) {
      var episodes = group.split('#').map(function (entry, episodeIndex) {
        var value = entry.trim();
        if (!value) return null;
        var separator = value.indexOf('$');
        var name = separator >= 0 ? value.slice(0, separator).trim() : '';
        var url = separator >= 0 ? value.slice(separator + 1).trim() : value;
        if (!url) return null;
        return {
          name: name || '第 ' + (episodeIndex + 1) + ' 集',
          url: url
        };
      }).filter(Boolean);

      return {
        name: (sources[groupIndex] || '').trim() || '线路 ' + (groupIndex + 1),
        episodes: episodes
      };
    }).filter(function (group) { return group.episodes.length > 0; });
  }

  function isPlayableUrl(url) {
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function normalizeImageUrl(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    try {
      var resolved = new URL(value, API_BASE).href;
      return /^https?:\/\//i.test(resolved) ? resolved : '';
    } catch (error) {
      return '';
    }
  }

  function classNameFor(typeId) {
    var found = state.classes.find(function (item) { return String(item.type_id) === String(typeId); });
    return found ? found.type_name : '';
  }

  function persistCatalogState() {
    ant.storage.setJSON(STORAGE_KEY, {
      page: state.page,
      typeId: state.typeId,
      keyword: state.keyword
    }).catch(function () {
      return null;
    });
  }

  function createPoster(item, large, vodId) {
    var frame = element('div', large ? 'poster-frame poster-frame-large' : 'poster-frame');
    if (vodId !== undefined && vodId !== null) frame.dataset.posterId = String(vodId);
    var fallback = element('div', 'poster-fallback');
    fallback.setAttribute('aria-hidden', 'true');
    fallback.appendChild(element('span', 'poster-mark', 'MDZY'));
    fallback.appendChild(element('span', 'poster-letter', String(item.vod_name || '影').slice(0, 1)));
    frame.appendChild(fallback);

    var imageUrl = normalizeImageUrl(item.vod_pic);
    if (imageUrl) {
      var image = document.createElement('img');
      image.className = 'poster-image';
      image.alt = item.vod_name ? item.vod_name + ' 海报' : '影片海报';
      image.loading = large ? 'eager' : 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('load', function () {
        frame.classList.add('has-image');
      });
      image.addEventListener('error', function () {
        image.remove();
      });
      image.src = imageUrl;
      frame.appendChild(image);
    }
    return frame;
  }

  function renderCategories() {
    var fragment = document.createDocumentFragment();
    var allButton = element('button', 'category-button', '全部');
    allButton.type = 'button';
    allButton.dataset.action = 'choose-category';
    allButton.dataset.typeId = '';
    allButton.setAttribute('aria-pressed', state.typeId === '' ? 'true' : 'false');
    fragment.appendChild(allButton);

    state.classes.forEach(function (item) {
      var button = element('button', 'category-button', item.type_name || '未命名');
      button.type = 'button';
      button.dataset.action = 'choose-category';
      button.dataset.typeId = String(item.type_id);
      button.setAttribute('aria-pressed', String(state.typeId) === String(item.type_id) ? 'true' : 'false');
      fragment.appendChild(button);
    });

    dom.categoryNav.replaceChildren(fragment);
  }

  function renderSkeletons() {
    var fragment = document.createDocumentFragment();
    for (var index = 0; index < 8; index += 1) {
      var card = element('div', 'poster-card skeleton-card');
      card.setAttribute('aria-hidden', 'true');
      card.appendChild(element('div', 'poster-frame skeleton-block'));
      card.appendChild(element('div', 'skeleton-line skeleton-title'));
      card.appendChild(element('div', 'skeleton-line skeleton-meta'));
      fragment.appendChild(card);
    }
    dom.catalogGrid.replaceChildren(fragment);
  }

  function renderCatalog() {
    var fragment = document.createDocumentFragment();

    state.items.forEach(function (item) {
      var button = element('button', 'poster-card');
      button.type = 'button';
      button.dataset.action = 'open-detail';
      button.dataset.vodId = String(item.vod_id);
      button.setAttribute('aria-label', (item.vod_name || '未命名影片') + (item.vod_remarks ? '，' + item.vod_remarks : ''));
      var posterItem = Object.assign({}, item);
      if (!normalizeImageUrl(posterItem.vod_pic)) {
        posterItem.vod_pic = state.posterCache[String(item.vod_id)] || '';
      }
      button.appendChild(createPoster(posterItem, false, item.vod_id));

      var copy = element('span', 'poster-copy');
      copy.appendChild(element('strong', 'poster-title', item.vod_name || '未命名影片'));
      copy.appendChild(element('span', 'poster-meta', item.vod_remarks || item.type_name || '暂无备注'));
      button.appendChild(copy);
      fragment.appendChild(button);
    });

    dom.catalogGrid.replaceChildren(fragment);
    setHidden(dom.catalogEmpty, state.items.length !== 0);
    setHidden(dom.pagination, state.items.length === 0);
    dom.pageLabel.textContent = '第 ' + state.page + ' / ' + state.pageCount + ' 页';

    var previous = dom.pagination.querySelector('[data-action="previous-page"]');
    var next = dom.pagination.querySelector('[data-action="next-page"]');
    previous.disabled = state.page <= 1;
    next.disabled = state.page >= state.pageCount;

    dom.catalogTitle.textContent = state.keyword
      ? '“' + state.keyword + '”的搜索结果'
      : (classNameFor(state.typeId) || '最新内容');
    dom.catalogMeta.textContent = '共 ' + state.total + ' 条 · 当前第 ' + state.page + ' 页';
    setHidden(dom.clearSearch, !state.keyword);
  }

  function replaceCatalogPoster(vodId, name, imageUrl) {
    var frames = dom.catalogGrid.querySelectorAll('[data-poster-id]');
    var current = null;
    Array.prototype.some.call(frames, function (frame) {
      if (frame.dataset.posterId === String(vodId)) {
        current = frame;
        return true;
      }
      return false;
    });
    if (current) current.replaceWith(createPoster({ vod_name: name, vod_pic: imageUrl }, false, vodId));
  }

  function persistPosterCache() {
    var keys = Object.keys(state.posterCache);
    if (keys.length > 300) {
      keys.slice(0, keys.length - 300).forEach(function (key) {
        delete state.posterCache[key];
      });
    }
    return ant.storage.setJSON(POSTER_CACHE_KEY, state.posterCache).catch(function () {
      return null;
    });
  }

  function hydrateCatalogPosters(items, requestId) {
    var missing = items.filter(function (item) {
      return !normalizeImageUrl(item.vod_pic) && !normalizeImageUrl(state.posterCache[String(item.vod_id)]);
    });
    if (!missing.length) return;

    var chunks = [];
    for (var index = 0; index < missing.length; index += 8) {
      chunks.push(missing.slice(index, index + 8));
    }

    var changed = false;
    Promise.all(chunks.map(function (chunk) {
      return requestCms({
        ac: 'detail',
        ids: chunk.map(function (item) { return item.vod_id; }).join(',')
      }, false).then(function (payload) {
        if (!payload || !Array.isArray(payload.list)) return;
        payload.list.forEach(function (detail) {
          var imageUrl = normalizeImageUrl(detail.vod_pic);
          if (!imageUrl || detail.vod_id === undefined || detail.vod_id === null) return;
          var key = String(detail.vod_id);
          state.posterCache[key] = imageUrl;
          changed = true;
          if (requestId === state.catalogRequest) {
            replaceCatalogPoster(key, detail.vod_name || '影片', imageUrl);
          }
        });
      }).catch(function () {
        return null;
      });
    })).then(function () {
      if (changed) persistPosterCache();
    });
  }

  function showAlert(node, message, action, label) {
    node.replaceChildren();
    node.appendChild(element('span', '', message));
    if (action) {
      var button = element('button', 'alert-button', label || '重试');
      button.type = 'button';
      button.dataset.action = action;
      node.appendChild(button);
    }
    setHidden(node, false);
  }

  function showCatalogView() {
    dom.body.classList.remove('detail-open');
    setHidden(dom.catalogView, false);
    setHidden(dom.detailView, true);
    setHidden(dom.categoryNav, false);
  }

  function loadCatalog(options) {
    var next = options || {};
    if (next.typeId !== undefined) state.typeId = String(next.typeId);
    if (next.keyword !== undefined) state.keyword = String(next.keyword).trim();
    if (next.page !== undefined) state.page = Math.max(1, Number(next.page) || 1);

    showCatalogView();
    setHidden(dom.catalogAlert, true);
    setHidden(dom.catalogEmpty, true);
    setHidden(dom.pagination, true);
    setHidden(dom.catalogLoading, false);
    dom.catalogMeta.textContent = '正在加载';
    renderSkeletons();

    var requestId = ++state.catalogRequest;
    var params = { ac: 'list', pg: state.page };
    if (state.typeId) params.t = state.typeId;
    if (state.keyword) params.wd = state.keyword;

    return requestCms(params).then(function (payload) {
      if (requestId !== state.catalogRequest) return;
      if (!payload || !Array.isArray(payload.list)) {
        var invalid = new Error('采集源没有返回有效列表');
        invalid.code = 'INVALID_RESPONSE';
        throw invalid;
      }

      state.classes = Array.isArray(payload.class) ? payload.class : state.classes;
      state.items = payload.list;
      state.page = Math.max(1, Number(payload.page) || state.page);
      state.pageCount = Math.max(1, Number(payload.pagecount) || 1);
      state.total = Math.max(0, Number(payload.total) || state.items.length);
      dom.searchInput.value = state.keyword;

      renderCategories();
      renderCatalog();
      persistCatalogState();
      hydrateCatalogPosters(state.items.slice(), requestId);
    }).catch(function (error) {
      if (requestId !== state.catalogRequest) return;
      state.items = [];
      dom.catalogGrid.replaceChildren();
      dom.catalogMeta.textContent = '加载失败';
      showAlert(dom.catalogAlert, errorText(error), 'retry-catalog', '重新加载');
    }).finally(function () {
      if (requestId === state.catalogRequest) setHidden(dom.catalogLoading, true);
    });
  }

  function appendFact(list, label, value) {
    if (!value) return;
    list.appendChild(element('dt', '', label));
    list.appendChild(element('dd', '', value));
  }

  function renderDetail(item) {
    var fragment = document.createDocumentFragment();
    var hero = element('div', 'detail-hero');
    hero.appendChild(createPoster(item, true));

    var info = element('div', 'detail-info');
    info.appendChild(element('p', 'detail-type', item.type_name || '影视内容'));
    var title = element('h2', 'detail-title', item.vod_name || '未命名影片');
    title.id = 'detail-title';
    info.appendChild(title);

    var badges = element('div', 'detail-badges');
    [item.vod_remarks, item.vod_year, item.vod_area].filter(Boolean).forEach(function (value) {
      badges.appendChild(element('span', 'detail-badge', value));
    });
    info.appendChild(badges);

    var facts = element('dl', 'detail-facts');
    appendFact(facts, '导演', item.vod_director);
    appendFact(facts, '主演', item.vod_actor);
    info.appendChild(facts);
    hero.appendChild(info);
    fragment.appendChild(hero);

    var synopsisText = plainText(item.vod_content || item.vod_blurb);
    if (synopsisText) {
      var synopsis = element('section', 'synopsis');
      synopsis.appendChild(element('h3', '', '剧情简介'));
      synopsis.appendChild(element('p', '', synopsisText));
      fragment.appendChild(synopsis);
    }

    var playback = element('section', 'playback-section');
    playback.appendChild(element('h3', '', '播放选集'));
    var groups = parsePlayGroups(item.vod_play_from, item.vod_play_url);

    if (!groups.length) {
      playback.appendChild(element('p', 'empty-inline', '采集源暂未提供可播放地址。'));
    } else {
      groups.forEach(function (group, groupIndex) {
        var route = element('div', 'route-section');
        var routeHeading = element('div', 'route-heading');
        routeHeading.appendChild(element('h4', '', group.name));
        routeHeading.appendChild(element('span', '', group.episodes.length + ' 集'));
        route.appendChild(routeHeading);

        var episodeGrid = element('div', 'episode-grid');
        group.episodes.forEach(function (episode, episodeIndex) {
          var button = element('button', 'episode-button', episode.name);
          button.type = 'button';
          button.dataset.action = 'play-episode';
          button.dataset.url = episode.url;
          button.dataset.title = item.vod_name || '未命名影片';
          button.dataset.episodeName = episode.name;
          button.dataset.episodeKey = groupIndex + '-' + episodeIndex;
          episodeGrid.appendChild(button);
        });
        route.appendChild(episodeGrid);
        playback.appendChild(route);
      });
    }
    fragment.appendChild(playback);

    dom.detailContent.replaceChildren(fragment);
    setHidden(dom.detailContent, false);
  }

  function loadDetail(vodId) {
    state.detailId = String(vodId);
    state.lastFocusId = String(vodId);
    dom.body.classList.add('detail-open');
    setHidden(dom.catalogView, true);
    setHidden(dom.detailView, false);
    setHidden(dom.categoryNav, true);
    setHidden(dom.detailAlert, true);
    setHidden(dom.detailContent, true);
    setHidden(dom.detailLoading, false);
    window.scrollTo(0, 0);

    var requestId = ++state.detailRequest;
    return requestCms({ ac: 'detail', ids: state.detailId }).then(function (payload) {
      if (requestId !== state.detailRequest) return;
      if (!payload || !Array.isArray(payload.list) || !payload.list.length) {
        var missing = new Error('没有找到该影片的详情');
        missing.code = 'DETAIL_NOT_FOUND';
        throw missing;
      }
      renderDetail(payload.list[0]);
    }).catch(function (error) {
      if (requestId !== state.detailRequest) return;
      showAlert(dom.detailAlert, errorText(error), 'retry-detail', '重试详情');
    }).finally(function () {
      if (requestId === state.detailRequest) setHidden(dom.detailLoading, true);
    });
  }

  function backToCatalog() {
    state.detailRequest += 1;
    showCatalogView();
    window.scrollTo(0, 0);
    window.requestAnimationFrame(function () {
      var target = dom.catalogGrid.querySelector('[data-vod-id="' + state.lastFocusId + '"]');
      if (target) target.focus();
    });
  }

  function playEpisode(button) {
    var url = button.dataset.url || '';
    var title = button.dataset.title || '影片';
    var episodeName = button.dataset.episodeName || '播放';
    if (!isPlayableUrl(url)) {
      showAlert(dom.detailAlert, '该选集不是可直连的 HTTP(S) 媒体地址，当前小程序无法播放。');
      return Promise.resolve();
    }

    state.lastEpisodeSelector = button.dataset.episodeKey || '';
    setHidden(dom.detailAlert, true);
    return ant.ui.loading('正在打开播放器').then(function () {
      return ant.player.open({
        url: url,
        title: title + ' · ' + episodeName
      });
    }).then(function () {
      return ant.storage.setJSON('last_playback_v1', {
        vodId: state.detailId,
        title: title,
        episode: episodeName,
        playedAt: new Date().toISOString()
      });
    }).catch(function (error) {
      showAlert(dom.detailAlert, '播放器打开失败：' + errorText(error));
    }).finally(function () {
      return ant.ui.hideLoading().catch(function () { return null; });
    });
  }

  function runAction(button) {
    var action = button.dataset.action;
    if (action === 'choose-category') {
      dom.searchInput.value = '';
      return loadCatalog({ typeId: button.dataset.typeId || '', keyword: '', page: 1 });
    }
    if (action === 'open-detail') return loadDetail(button.dataset.vodId);
    if (action === 'clear-search') {
      dom.searchInput.value = '';
      return loadCatalog({ keyword: '', page: 1 });
    }
    if (action === 'previous-page' && state.page > 1) return loadCatalog({ page: state.page - 1 });
    if (action === 'next-page' && state.page < state.pageCount) return loadCatalog({ page: state.page + 1 });
    if (action === 'retry-catalog') return loadCatalog({ page: state.page });
    if (action === 'back-to-catalog') return Promise.resolve(backToCatalog());
    if (action === 'retry-detail') return loadDetail(state.detailId);
    if (action === 'play-episode') return playEpisode(button);
    return Promise.resolve();
  }

  document.body.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    Promise.resolve(runAction(button)).catch(function (error) {
      ant.ui.toast(errorText(error)).catch(function () { return null; });
    });
  });

  dom.searchForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var keyword = dom.searchInput.value.trim();
    if (!keyword) {
      ant.ui.toast('请输入片名').catch(function () { return null; });
      dom.searchInput.focus();
      return;
    }
    loadCatalog({ keyword: keyword, typeId: '', page: 1 });
  });

  function visibleFocusables() {
    return Array.prototype.slice.call(document.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
    )).filter(function (node) {
      var rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !node.hidden;
    });
  }

  function moveFocus(direction) {
    var items = visibleFocusables();
    if (!items.length) return;
    var current = document.activeElement;
    if (items.indexOf(current) < 0) {
      items[0].focus();
      items[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }

    var from = current.getBoundingClientRect();
    var fromX = from.left + from.width / 2;
    var fromY = from.top + from.height / 2;
    var best = null;
    var bestScore = Infinity;

    items.forEach(function (candidate) {
      if (candidate === current) return;
      var rect = candidate.getBoundingClientRect();
      var dx = rect.left + rect.width / 2 - fromX;
      var dy = rect.top + rect.height / 2 - fromY;
      var primary;
      var cross;

      if (direction === 'ArrowRight' && dx > 0) { primary = dx; cross = Math.abs(dy); }
      else if (direction === 'ArrowLeft' && dx < 0) { primary = -dx; cross = Math.abs(dy); }
      else if (direction === 'ArrowDown' && dy > 0) { primary = dy; cross = Math.abs(dx); }
      else if (direction === 'ArrowUp' && dy < 0) { primary = -dy; cross = Math.abs(dx); }
      else return;

      var score = primary * 10 + cross;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  ant.tv.onKey(function (event) {
    if (event.key === 'Enter' || event.key === 'Select') {
      if (document.activeElement && typeof document.activeElement.click === 'function') {
        document.activeElement.click();
      }
      return;
    }
    if (/^Arrow(Up|Down|Left|Right)$/.test(event.key)) moveFocus(event.key);
  });

  ant.player.onClose(function () {
    window.requestAnimationFrame(function () {
      if (!state.lastEpisodeSelector) return;
      var button = dom.detailContent.querySelector('[data-episode-key="' + state.lastEpisodeSelector + '"]');
      if (button) button.focus();
    });
  });

  ant.onShow(function () {
    /* Data remains visible after returning from the native player. */
  });

  ant.onHide(function () {
    /* No polling or timers need to be suspended. */
  });

  function initialize() {
    ant.env.getSystemInfo().then(function (info) {
      dom.env.textContent = info.platform + ' · ' + (info.isTV ? '电视模式' : '触屏模式') + (info.devMode ? ' · 调试' : '');
      if (info.isTV) dom.body.classList.add('tv');
    }).catch(function () {
      dom.env.textContent = '蚂蚁影视小程序';
    });

    Promise.all([
      ant.storage.getJSON(STORAGE_KEY, null).catch(function () { return null; }),
      ant.storage.getJSON(POSTER_CACHE_KEY, {}).catch(function () { return {}; })
    ]).then(function (stored) {
      var saved = stored[0];
      state.posterCache = stored[1] && typeof stored[1] === 'object' ? stored[1] : {};
      if (saved) {
        state.page = Math.max(1, Number(saved.page) || 1);
        state.typeId = String(saved.typeId || '');
        state.keyword = String(saved.keyword || '');
      }
      return loadCatalog({ page: state.page, typeId: state.typeId, keyword: state.keyword });
    }).catch(function () {
      return loadCatalog({ page: 1, typeId: '', keyword: '' });
    });
  }

  window.MdzyCms = {
    buildUrl: buildUrl,
    parsePlayGroups: parsePlayGroups,
    isPlayableUrl: isPlayableUrl,
    normalizeImageUrl: normalizeImageUrl
  };

  initialize();
})();
