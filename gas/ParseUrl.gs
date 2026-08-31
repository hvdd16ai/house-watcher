/**
 * 貼上591/永慶/信義任一個網站的網址，自動判斷是哪個網站，
 * 轉成對應的 Config.gs 格式，不用自己查代碼。
 * 對應本機Python版 parse_url.py，邏輯相同。
 *
 * 使用方式：
 * 1. 把網址貼進下面 parseUrl() 裡的 URL_TO_PARSE 常數
 * 2. 在編輯器上方函式選單選擇 parseUrl，點執行
 * 3. 看「執行記錄」(Ctrl+Enter 或選單「查看」→「記錄」) 裡印出的結果
 */

function parse591Url_(url) {
  const queryString = url.split('?')[1] || '';
  const params = {};
  queryString.split('&').forEach((pair) => {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });

  const fields = ['regionid', 'sectionid', 'type', 'shape', 'price', 'area', 'pattern', 'label'];
  const intFields = ['regionid', 'sectionid', 'type', 'shape'];

  const result = {};
  fields.forEach((key) => {
    let value = params[key];
    if (value === undefined) {
      result[key] = null;
      return;
    }
    if (intFields.indexOf(key) !== -1 && value.indexOf(',') === -1 && /^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    result[key] = value;
  });

  const lines = ['  {'];
  fields.forEach((key) => {
    const v = result[key];
    const literal = v === null ? 'null' : (typeof v === 'number' ? v : "'" + v + "'");
    lines.push('    ' + key + ': ' + literal + ',');
  });
  lines.push('  },');

  const missing = ['regionid', 'sectionid'].filter((k) => result[k] === null);
  const warning = missing.length
    ? '⚠️ 網址裡沒找到 ' + missing.join(', ') + '，這兩個是必填欄位，確認一下網址是不是完整複製的。'
    : null;

  return { text: lines.join('\n'), warning: warning, configKey: 'HOUSE_591' };
}

// [網址片段後綴, target物件的key]，對照 CONFIG_DETAIL.md 的「永慶房屋參數對照」表
const YC_PARSE_SUFFIX_MAP = [
  ['_price', 'price'],
  ['_type', 'type'],
  ['_rmp', 'rooms'],
  ['_pin', 'area'],
  ['_age', 'house_age'],
];

function parseYungchingUrl_(url) {
  const path = decodeURIComponent(url.split('?')[0]);
  const m = path.match(/\/list\/(.+?)_c\/(.*)/);
  if (!m) {
    return {
      text: null,
      warning: '⚠️ 網址格式不對，找不到地區資訊。網址應該長得像：https://buy.yungching.com.tw/list/新竹市-東區_c/...',
      configKey: 'YUNGCHING',
    };
  }
  const region = m[1];
  const segments = m[2].split('/').filter((s) => s && s !== 'new_filter');

  const extra = {};
  YC_PARSE_SUFFIX_MAP.forEach((pair) => { extra[pair[1]] = null; });
  let hasParking = null;
  segments.forEach((seg) => {
    if (seg === 'y_park' || seg === 'n_park') {
      hasParking = seg === 'y_park';
      return;
    }
    YC_PARSE_SUFFIX_MAP.some((pair) => {
      if (seg.endsWith(pair[0])) {
        extra[pair[1]] = seg.slice(0, -pair[0].length);
        return true;
      }
      return false;
    });
  });

  const litOf = (v) => (v === null ? 'null' : "'" + v + "'");
  const lines = [
    '  {',
    "    region: '" + region + "',",
    '    min_rooms: 2,  // 記得確認房數門檻要設多少，不限就設 null',
  ];
  YC_PARSE_SUFFIX_MAP.forEach((pair) => {
    lines.push('    ' + pair[1] + ': ' + litOf(extra[pair[1]]) + ',');
  });
  lines.push('    has_parking: ' + (hasParking === null ? 'null' : hasParking) + ',');
  lines.push('  },');
  return { text: lines.join('\n'), warning: null, configKey: 'YUNGCHING' };
}

// [網址片段後綴, target物件的key]，對照 CONFIG_DETAIL.md 的「信義房屋參數對照」表
const SINYI_PARSE_SUFFIX_MAP = [
  ['-type', 'type'],
  ['-price', 'price'],
  ['-roomtotal', 'rooms'],
  ['-zip', 'zip'],
];

function parseSinyiUrl_(url) {
  const path = url.split('?')[0];
  const m = path.match(/\/buy\/list\/([^/]+)(.*)/);
  if (!m) {
    return {
      text: null,
      warning: '⚠️ 網址格式不對，找不到縣市資訊。網址應該長得像：https://www.sinyi.com.tw/buy/list/Hsinchu-city',
      configKey: 'SINYI',
    };
  }
  const region = m[1];
  const segments = m[2].split('/').filter((s) => s && s !== 'default-desc' && !/^\d+$/.test(s));

  const extra = {};
  SINYI_PARSE_SUFFIX_MAP.forEach((pair) => { extra[pair[1]] = null; });
  segments.forEach((seg) => {
    SINYI_PARSE_SUFFIX_MAP.some((pair) => {
      if (seg.endsWith(pair[0])) {
        extra[pair[1]] = seg.slice(0, -pair[0].length);
        return true;
      }
      return false;
    });
  });

  const litOf = (v) => (v === null ? 'null' : "'" + v + "'");
  const lines = [
    '  {',
    "    region: '" + region + "',",
    '    min_rooms: 2,  // 記得確認房數門檻要設多少，不限就設 null',
  ];
  SINYI_PARSE_SUFFIX_MAP.forEach((pair) => {
    lines.push('    ' + pair[1] + ': ' + litOf(extra[pair[1]]) + ',');
  });
  lines.push('  },');
  return {
    text: lines.join('\n'),
    warning: '⚠️ 提醒：信義只能篩到縣市層級，抓到的會是整個縣市範圍，不會只有你想要的區。',
    configKey: 'SINYI',
  };
}

// 貼要解析的網址在這裡
const URL_TO_PARSE = 'https://sale.591.com.tw/?regionid=4&sectionid=371&shape=2&type=2&pattern=2,3,4,5';

function parseUrl() {
  const url = URL_TO_PARSE;
  let host;
  try {
    host = url.match(/^https?:\/\/([^/]+)/)[1];
  } catch (e) {
    Logger.log('⚠️ 不是合法的網址：' + url);
    return;
  }

  let result;
  if (host.indexOf('sale.591.com.tw') !== -1) {
    result = parse591Url_(url);
  } else if (host.indexOf('buy.yungching.com.tw') !== -1) {
    result = parseYungchingUrl_(url);
  } else if (host.indexOf('www.sinyi.com.tw') !== -1) {
    result = parseSinyiUrl_(url);
  } else {
    Logger.log('⚠️ 看不出這是哪個網站的網址（網域：' + host + '），目前只支援 591/永慶/信義。');
    return;
  }

  if (result.text === null) {
    Logger.log(result.warning);
    return;
  }

  Logger.log('解析結果（可以直接複製貼進 Config.gs 的 ' + result.configKey + ' 清單裡）：\n\n' + result.text);
  if (result.warning) {
    Logger.log('\n' + result.warning);
  }
}
