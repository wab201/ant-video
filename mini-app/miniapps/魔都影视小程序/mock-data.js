/* Browser-only fixtures. The host build always uses the live CMS endpoint. */
(function () {
  'use strict';

  var classes = [
    { type_id: 1, type_name: '电影' },
    { type_id: 2, type_name: '电视剧' },
    { type_id: 3, type_name: '综艺' }
  ];

  var items = [
    { vod_id: 101, vod_name: '论坛求助我要撬兄弟的心上人', type_id: 1, type_name: '电影', vod_pic: '', vod_remarks: '高清' },
    { vod_id: 102, vod_name: '海上心狱', type_id: 1, type_name: '电影', vod_pic: '', vod_remarks: '1080P' },
    { vod_id: 103, vod_name: '女警出更第二季', type_id: 2, type_name: '电视剧', vod_pic: '', vod_remarks: '更新至 6 集' },
    { vod_id: 104, vod_name: '11点热吵店', type_id: 3, type_name: '综艺', vod_pic: '', vod_remarks: '更新至 20260909' },
    { vod_id: 105, vod_name: '小姐不熙娣', type_id: 3, type_name: '综艺', vod_pic: '', vod_remarks: '更新至 20260909' },
    { vod_id: 106, vod_name: '豆腐妈妈', type_id: 2, type_name: '电视剧', vod_pic: '', vod_remarks: '更新至 8 集' },
    { vod_id: 107, vod_name: '早春晴朗', type_id: 2, type_name: '电视剧', vod_pic: '', vod_remarks: '全 24 集' },
    { vod_id: 108, vod_name: '最后目击', type_id: 1, type_name: '电影', vod_pic: '', vod_remarks: '中字' },
    { vod_id: 109, vod_name: '女人我最大', type_id: 3, type_name: '综艺', vod_pic: '', vod_remarks: '更新至 20260909' }
  ];

  var posters = {
    101: 'https://www.mdzypic.com/upload/vod/20260909-1/00f0c64afea869d2954f419646b7c19b.jpg',
    102: 'https://www.mdzypic.com/upload/vod/20260909-1/09e4666311c9a3903da32b4281d182b9.webp',
    103: 'https://www.mdzypic.com/upload/vod/20260814-1/b087dc8f7d2d569ae74415791b3f653a.webp',
    104: 'https://www.mdzypic.com/upload/vod/20240614-1/be071926638e63f1e703b05f97bb595c.jpg',
    105: 'https://www.mdzypic.com/upload/vod/20240614-1/862f492e7ceaa63a8e6d9017501d0400.jpg',
    106: 'https://www.mdzypic.com/upload/vod/20260118-1/c0728b5e3df3a9e9491eb46f7c0b334a.webp',
    107: 'https://www.mdzypic.com/upload/vod/20260826-1/96f5d544e694f05c4d1f760907f804a8.webp',
    108: 'https://www.mdzypic.com/upload/vod/20260909-1/39edeb25dcbb4cffa2817d623e247652.webp',
    109: 'https://www.mdzypic.com/upload/vod/20240614-1/7fb4457b0f7b3d55d7f88f111bef5dd2.jpg'
  };

  function detailFor(item) {
    var media = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
    var copy = Object.assign({}, item);
    copy.vod_pic = posters[item.vod_id] || '';
    copy.vod_year = '2026';
    copy.vod_area = '中国';
    copy.vod_actor = '演示演员甲, 演示演员乙';
    copy.vod_director = '演示导演';
    copy.vod_content = '<p>这是浏览器开发环境中的固定夹具，用于验证详情、线路和选集布局。</p>';
    copy.vod_play_from = 'modum3u8$$$备用线路';
    copy.vod_play_url = '正片$' + media + '#预告$' + media + '$$$正片$' + media;
    return copy;
  }

  window.__mdzyMockApi = {
    request: function (params) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          if (params.ac === 'detail') {
            var ids = String(params.ids || '').split(',');
            var found = items.filter(function (item) { return ids.indexOf(String(item.vod_id)) >= 0; });
            resolve({ code: 1, list: found.map(detailFor) });
            return;
          }

          var filtered = items.slice();
          if (params.t) {
            filtered = filtered.filter(function (item) { return String(item.type_id) === String(params.t); });
          }
          if (params.wd) {
            var keyword = String(params.wd).toLowerCase();
            filtered = filtered.filter(function (item) { return item.vod_name.toLowerCase().indexOf(keyword) >= 0; });
          }

          var limit = 6;
          var page = Math.max(1, Number(params.pg) || 1);
          var pagecount = Math.max(1, Math.ceil(filtered.length / limit));
          page = Math.min(page, pagecount);
          resolve({
            code: 1,
            page: page,
            pagecount: pagecount,
            limit: limit,
            total: filtered.length,
            class: classes,
            list: filtered.slice((page - 1) * limit, page * limit)
          });
        }, 180);
      });
    }
  };
})();
