/**
 * 591+永慶+信義新竹市買屋新物件通知 - Google Apps Script版
 * 對應本機Python版 python/scraper.py 的邏輯，資料庫換成Google Sheet。
 * 全部合併成一個檔案方便部署(Apps Script沒有真的import機制，分檔案純粹是視覺整理，
 * 部署要一個個貼很麻煩，所以直接合併)。
 *
 * Telegram token/chat_id不在這個檔案裡——存在Google的Script Properties
 * (專案設定 → 指令碼屬性)，這個檔案本身可以放心分享，沒有機密內容。
 */

// ============================================================
// 設定
// ============================================================

/**
 * 591+永慶+信義抓取設定。不想套用某個篩選條件，把值設成 null 就好。
 */

// 要不要抓某個網站，改 true/false 就好，不用碰程式碼
const ENABLED_SOURCES = {
  '591': true,
  yc: true,
  sinyi: true,
};

// 疑似重複刊登(同一戶被不同仲介刊登)的物件要不要發Telegram通知。
// false(預設)：不通知，但還是會記錄進Sheet、標記duplicate_of。
const NOTIFY_DUPLICATES = false;

// 591房屋交易網(sale.591.com.tw)設定。HOUSE_591是清單，每個物件是一組獨立的搜尋條件，會各自查完再合併結果。
const HOUSE_591 = [
  {
    regionid: 4,           // 縣市代碼（必填）新竹市=4
    sectionid: 371,         // 鄉鎮/區代碼（必填）東區=371、北區=372。同縣市內支援多選，逗號分隔字串，例如 "371,372"
    type: 2,                 // 類型：住宅=2（其他代碼未實測）
    shape: 2,                 // 型態：電梯大樓=2（別墅/透天厝/公寓/華廈代碼還沒實測）
    price: null,               // 總價區間(萬)，格式 "最低_最高"，例如 "0_750"。不限就設 null
    area: null,                 // 坪數區間，格式 "$最低_$最高"，例如 "$30_$50"。不限就設 null
    pattern: '2,3,4,5',          // 房數，逗號分隔多選，"2,3,4,5"代表2房以上。不限就設 null
    houseage: null,                // 屋齡(年)，格式 "最低_最高"，例如 "0_5" = 5年以下。不限就設 null
    parking: null,                   // 車位類型，逗號分隔數字，目前只驗證過1=平面式、2=機械式。不限就設 null
  },
  // 想再搜別的縣市，複製一組上面的物件、改regionid/sectionid即可，例如：
  // { regionid: 1, sectionid: 47, type: 2, shape: 2, price: null, area: null, pattern: '2,3,4,5', houseage: null, parking: null },
];

const HOUSE_591_MAX_PAGES = 5;  // 最多往前抓幾頁（用「早停」邏輯，通常用不到這麼多）

// 永慶房屋(buy.yungching.com.tw)設定。YUNGCHING是清單，每個物件是一組獨立的地區，各自查完再合併。
// min_rooms是程式讀「格局」文字自己判斷房數(不限就設 null)，跟下面的 rooms(平台原生篩選)是兩回事、
// 互不影響：min_rooms一定會套用，rooms只是多加一個讓網站先篩、可以少抓幾頁的優化，不設也沒關係。
const YUNGCHING = [
  {
    // 格式："縣市-鄉鎮區"，中間用「-」連接。同縣市內支援多選，逗號分隔多組，
    // 例如 "新竹市-東區,新竹市-北區" 同時搜兩區。跨縣市請用清單多加一組，不要塞逗號。
    region: '新竹市-東區',
    min_rooms: 2,

    // 以下是永慶網址上的原生篩選條件，格式對照 CONFIG_DETAIL.md 的「永慶房屋參數對照」表，
    // 不用可以全部留 null，不影響其他設定。
    price: null,        // 總價(萬)，格式 "最低-最高"，開放區間可留空一端，例如 "1000-" = 1000萬以上
    type: null,         // 型態，例如 "電梯大廈"、"華廈"、"透天別墅"
    rooms: null,        // 房數，格式同總價，例如 "2-2" = 剛好2房（跟上面的min_rooms是兩回事，見上方說明）
    area: null,         // 建坪(坪)，格式同總價，例如 "20-30"
    has_parking: null,  // 車位：true=有車位、false=無車位、null=不限

    // ⚠️ 已知衝突：實測發現type+area+has_parking三個「同時」設定時，永慶網站會回傳404
    // （其餘任意組合都正常，研判是該網站路由比對的問題）。三個都要用的話，改完記得
    // 手動跑一次 checkNewListings 確認有抓到資料，抓不到就拿掉其中一個試試看。詳見 CONFIG_DETAIL.md。
  },
  // { region: '台北市-大安區', min_rooms: 2, price: null, type: null, rooms: null, area: null, has_parking: null },
];

const YUNGCHING_MAX_PAGES = 5;

// 信義房屋(www.sinyi.com.tw)設定。SINYI是清單，每個物件是一組獨立的縣市，各自查完再合併。
// 注意：信義房屋沒辦法篩選到「東區」這麼細，只能篩到整個新竹市（會混進北區/香山區）。
// min_rooms邏輯同永慶，見上面 YUNGCHING 的說明。
const SINYI = [
  {
    region: 'Hsinchu-city',
    min_rooms: 2,

    // 以下是信義網址上的原生篩選條件，格式對照 CONFIG_DETAIL.md 的「信義房屋參數對照」表，
    // 不用可以全部留 null，不影響其他設定。
    type: null,         // 型態，拼音值，目前只驗證過 "dalou"(大樓)，其他型態代碼未確認
    price: null,        // 總價，格式 "最低-up"，例如 "1000-up" = 1000萬以上
    rooms: null,        // 房數，格式同總價，例如 "2-up" = 2房以上（跟上面的min_rooms是兩回事，見上方說明）
    has_parking: null,  // 車位：true=有車位、false=無車位、null=不限
  },
  // { region: 'Taipei-city', min_rooms: 2, type: null, price: null, rooms: null, has_parking: null },
];

const SINYI_MAX_PAGES = 5;

const PRUNE_DAYS = 180;  // seen_houses 保留紀錄的天數，超過就清掉

// Apps Script單次執行時間有上限（免費帳號約6分鐘），
// 所以重試次數/間隔比本機Python版短很多，真正的重試交給下一次的排程。
const MAX_RETRIES = 3;
const RETRY_DELAY_SECONDS = 5;

const SHEET_NAME = 'seen_houses';

// ============================================================
// 591房屋交易網(sale.591.com.tw)
// ============================================================


const HOUSE591_NAME = '591';
const HOUSE591_LABEL = '591';

const HOUSE591_API_URL = 'https://bff-house.591.com.tw/v1/web/sale/list';
const HOUSE591_DETAIL_URL_TEMPLATE = 'https://sale.591.com.tw/home/house/detail/{type}/{houseid}.html';

function house591FetchPage_(filters, firstRow) {
  const params = {
    category: 1,
    shType: 'list',
    order: 'posttime',
    orderType: 'desc',
    firstRow: firstRow,
  };
  Object.keys(filters).forEach((key) => {
    if (filters[key] !== null && filters[key] !== undefined) {
      params[key] = filters[key];
    }
  });
  if ('sectionid' in params) {
    params.section = params.sectionid;
  }

  const query = Object.keys(params)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const url = HOUSE591_API_URL + '?' + query;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const code = resp.getResponseCode();
      if (code === 200) {
        const data = JSON.parse(resp.getContentText());
        if (data.status === 1) {
          return (data.data && data.data.house_list) || [];
        }
        Logger.log('[591] API回應異常（firstRow=' + firstRow + '，第' + attempt + '/' + MAX_RETRIES + '次）: ' + data.msg);
      } else {
        Logger.log('[591] 抓取失敗，HTTP ' + code + '（firstRow=' + firstRow + '，第' + attempt + '/' + MAX_RETRIES + '次）');
      }
    } catch (e) {
      Logger.log('[591] 抓取失敗（firstRow=' + firstRow + '，第' + attempt + '/' + MAX_RETRIES + '次）: ' + e);
    }
    if (attempt < MAX_RETRIES) {
      Utilities.sleep(RETRY_DELAY_SECONDS * 1000);
    }
  }
  Logger.log('[591] firstRow=' + firstRow + ' 重試' + MAX_RETRIES + '次仍失敗，放棄本次抓取。');
  return null;
}

function house591FetchTarget_(filters, seenIds, maxPages) {
  // firstRow用「目前為止591實際回傳的總筆數」累加計算，不假設每頁固定幾筆。
  const allItems = [];
  let fetchFailed = false;
  let firstRow = 0;
  for (let page = 0; page < maxPages; page++) {
    const items = house591FetchPage_(filters, firstRow);
    if (items === null) {
      fetchFailed = true;
      break;
    }
    if (!items.length) break;
    firstRow += items.length;

    const validItems = items.filter((it) => it.houseid !== undefined && it.houseid !== null);
    if (validItems.length !== items.length) {
      Logger.log('[591] 忽略 ' + (items.length - validItems.length) + ' 筆缺少houseid的異常資料');
    }
    if (!validItems.length) break;

    Array.prototype.push.apply(allItems, validItems);
    const lastKey = '591-' + String(validItems[validItems.length - 1].houseid);
    if (seenIds.has(lastKey)) break;
  }
  return { items: allItems, fetchFailed: fetchFailed };
}

function house591FetchLatestListings_(seenIds) {
  // HOUSE_591是清單，每組搜尋條件各自抓完再合併。
  const allItems = [];
  let fetchFailed = false;
  HOUSE_591.forEach((filters) => {
    const result = house591FetchTarget_(filters, seenIds, HOUSE_591_MAX_PAGES);
    Array.prototype.push.apply(allItems, result.items);
    if (result.fetchFailed) fetchFailed = true;
  });
  return { items: allItems, fetchFailed: fetchFailed };
}

function house591Normalize_(item) {
  const houseid = item.houseid;
  return {
    source: HOUSE591_NAME,
    key: '591-' + houseid,
    houseid: houseid,
    title: item.title,
    community_name: item.community_name,
    address: item.address,
    room: item.room,
    area: item.area,
    price: item.price,
    show_price: item.showprice,
    unitprice: item.unitprice,
    houseage: item.houseage,
    floor: item.floor,
    has_carport: !!item.has_carport,
    photo_url: item.photo_url,
    url: HOUSE591_DETAIL_URL_TEMPLATE.replace('{type}', item.type).replace('{houseid}', houseid),
    posttime: item.posttime,
  };
}

const HOUSE591_SOURCE = {
  name: HOUSE591_NAME,
  label: HOUSE591_LABEL,
  fetchLatestListings: house591FetchLatestListings_,
  normalize: house591Normalize_,
};

// ============================================================
// 永慶房屋(buy.yungching.com.tw)
// ============================================================


const YC_NAME = 'yc';
const YC_LABEL = '永慶';
const YC_BASE_URL = 'https://buy.yungching.com.tw';

function ycExtractField_(chunk, className) {
  const re = new RegExp('class="' + className + '"[^>]*>([^<]*)<');
  const m = chunk.match(re);
  return m ? m[1].trim() : null;
}

function ycParseListings_(html) {
  const idRe = /href="house\/(\d+)"/g;
  const matches = [];
  let m;
  while ((m = idRe.exec(html)) !== null) {
    matches.push({ id: m[1], index: m.index });
  }

  const items = [];
  const seenIds = {};
  for (let i = 0; i < matches.length; i++) {
    const id = matches[i].id;
    if (seenIds[id]) continue; // 同一頁裡置頂物件有時會重複出現一次，跳過
    seenIds[id] = true;

    const start = matches[i].index;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : Math.min(html.length, start + 6000);
    const chunk = html.slice(start, end);

    let address = ycExtractField_(chunk, 'address');
    if (address) {
      address = address.replace(/^[一-鿿]+[市縣][一-鿿]+[區鄉鎮市]/, '');
    }

    const areaText = ycExtractField_(chunk, 'regArea') || '';
    const areaMatch = areaText.match(/[\d.]+/);
    const area = areaMatch ? parseFloat(areaMatch[0]) : null;

    const priceText = (ycExtractField_(chunk, 'price') || '').replace(/,/g, '');
    const price = /^\d+$/.test(priceText) ? parseInt(priceText, 10) : null;

    const roomText = ycExtractField_(chunk, 'room') || '';
    const roomMatch = roomText.match(/^(\d+)房/);
    const roomCount = roomMatch ? parseInt(roomMatch[1], 10) : null;

    const carText = ycExtractField_(chunk, 'car');
    const hasCarport = !!carText && carText.indexOf('無') === -1;

    const ageMatch = chunk.match(/<span[^>]*>([\d.]+年|--年)<\/span>/);
    const houseage = ageMatch ? ageMatch[1].replace('年', '') : null;

    const imgMatch = chunk.match(/<img[^>]*src="([^"]+)"/);
    const photoUrl = imgMatch ? imgMatch[1].replace(/&amp;/g, '&') : null;

    items.push({
      houseid: id,
      title: ycExtractField_(chunk, 'caseName'),
      community_name: ycExtractField_(chunk, 'community'),
      address: address,
      room: roomText,
      room_count: roomCount,
      area: area,
      price: price,
      houseage: houseage,
      floor: ycExtractField_(chunk, 'floor'),
      has_carport: hasCarport,
      photo_url: photoUrl,
      url: YC_BASE_URL + '/house/' + id,
    });
  }
  return items;
}

// [target物件的key, 網址片段後綴]，對照 CONFIG_DETAIL.md 的「永慶房屋參數對照」表
const YC_FILTER_PARAM_MAP = [
  ['price', '_price'],
  ['type', '_type'],
  ['rooms', '_rmp'],
  ['area', '_pin'],
  ['house_age', '_age'],
];

function ycBuildFilterSegments_(target) {
  const segments = [];
  YC_FILTER_PARAM_MAP.forEach((pair) => {
    const value = target[pair[0]];
    if (value) segments.push(value + pair[1]);
  });
  if (target.has_parking !== null && target.has_parking !== undefined) {
    segments.push((target.has_parking ? 'y' : 'n') + '_park');
  }
  return segments;
}

function ycFetchPage_(region, page, filterSegments) {
  const segments = (filterSegments || []).map(encodeURIComponent);
  const path = encodeURIComponent(region) + '_c/' + segments.concat(['new_filter']).join('/');
  const url = YC_BASE_URL + '/list/' + path + '?pg=' + page;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const code = resp.getResponseCode();
      if (code === 200) {
        return ycParseListings_(resp.getContentText());
      }
      Logger.log('[永慶] 抓取失敗，HTTP ' + code + '（page=' + page + '，第' + attempt + '/' + MAX_RETRIES + '次）');
    } catch (e) {
      Logger.log('[永慶] 抓取失敗（page=' + page + '，第' + attempt + '/' + MAX_RETRIES + '次）: ' + e);
    }
    if (attempt < MAX_RETRIES) {
      Utilities.sleep(RETRY_DELAY_SECONDS * 1000);
    }
  }
  Logger.log('[永慶] page=' + page + ' 重試' + MAX_RETRIES + '次仍失敗，放棄本次抓取。');
  return null;
}

function ycFetchTarget_(region, seenIds, maxPages, minRooms, filterSegments) {
  // 頁碼式分頁不需要知道每頁固定幾筆，抓到空頁就代表到底了。
  const allItems = [];
  let fetchFailed = false;
  for (let page = 1; page <= maxPages; page++) {
    const items = ycFetchPage_(region, page, filterSegments);
    if (items === null) {
      fetchFailed = true;
      break;
    }
    if (!items.length) break;

    const lastKey = 'yc-' + items[items.length - 1].houseid;

    let qualifying = items;
    if (minRooms !== null && minRooms !== undefined) {
      qualifying = items.filter((it) => it.room_count !== null && it.room_count >= minRooms);
    }
    Array.prototype.push.apply(allItems, qualifying);

    if (seenIds.has(lastKey)) break;
  }
  return { items: allItems, fetchFailed: fetchFailed };
}

function ycFetchLatestListings_(seenIds) {
  // YUNGCHING是清單，每組地區各自抓完再合併。每組target只讀自己物件裡的min_rooms，不共用全域值。
  const allItems = [];
  let fetchFailed = false;
  YUNGCHING.forEach((target) => {
    const filterSegments = ycBuildFilterSegments_(target);
    const result = ycFetchTarget_(target.region, seenIds, YUNGCHING_MAX_PAGES, target.min_rooms, filterSegments);
    Array.prototype.push.apply(allItems, result.items);
    if (result.fetchFailed) fetchFailed = true;
  });
  return { items: allItems, fetchFailed: fetchFailed };
}

function ycNormalize_(item) {
  const houseid = item.houseid;
  const price = item.price;
  return {
    source: YC_NAME,
    key: 'yc-' + houseid,
    houseid: houseid,
    title: item.title,
    community_name: item.community_name,
    address: item.address,
    room: item.room,
    area: item.area,
    price: price,
    show_price: price !== null && price !== undefined ? price.toLocaleString('en-US') : null,
    unitprice: null,
    houseage: item.houseage,
    floor: item.floor,
    has_carport: !!item.has_carport,
    photo_url: item.photo_url,
    url: item.url,
    posttime: null,
  };
}

const YUNGCHING_SOURCE = {
  name: YC_NAME,
  label: YC_LABEL,
  fetchLatestListings: ycFetchLatestListings_,
  normalize: ycNormalize_,
};

// ============================================================
// 信義房屋(www.sinyi.com.tw)
// ============================================================


const SINYI_NAME = 'sinyi';
const SINYI_LABEL = '信義';
const SINYI_BASE_URL = 'https://www.sinyi.com.tw';

function sinyiParseListings_(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return [];

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    return [];
  }

  let rawList;
  try {
    rawList = data.props.initialReduxState.buyReducer.list;
  } catch (e) {
    return [];
  }
  if (!rawList) return [];

  const items = [];
  rawList.forEach((it) => {
    const houseNo = it.houseNo;
    if (!houseNo) return;

    let address = it.address || '';
    address = address.replace(/^[一-鿿]+[市縣]/, '');

    const roomText = it.layout || '';
    const roomMatch = roomText.match(/^(\d+)房/);
    const roomCount = roomMatch ? parseInt(roomMatch[1], 10) : null;

    const houseageText = it.age || '';
    const houseage = houseageText ? houseageText.replace(/年$/, '') : null;

    const floor = it.floor;
    const totalfloor = it.totalfloor;
    const floorDisplay = (floor && totalfloor) ? (floor + '/' + totalfloor + 'F') : null;

    const photoUrl = it.largeImage || ((it.image && it.image[0]) || null);

    items.push({
      houseid: houseNo,
      title: it.name,
      community_name: it.commName,
      address: address,
      room: roomText,
      room_count: roomCount,
      area: it.areaBuilding,
      price: it.totalPrice,
      houseage: houseage,
      floor: floorDisplay,
      has_carport: !!it.isParking,
      photo_url: photoUrl,
      url: it.shareURL || (SINYI_BASE_URL + '/buy/house/' + houseNo),
    });
  });
  return items;
}

// [target物件的key, 網址片段後綴]，對照 CONFIG_DETAIL.md 的「信義房屋參數對照」表
const SINYI_FILTER_PARAM_MAP = [
  ['type', '-type'],
  ['price', '-price'],
  ['rooms', '-roomtotal'],
];

// 車位不是「值+後綴」的格式，勾選「有車位」時網站會把全部子類型湊成一長串固定字串，
// 這裡直接照抄那串固定值，不逐一拆解子類型。
const SINYI_PARKING_YES_SEGMENT = 'plane-auto-mix-mechanical-firstfloor-tower-other-yesparking';
const SINYI_PARKING_NO_SEGMENT = 'noparking';

function sinyiBuildFilterSegments_(target) {
  const segments = [];
  SINYI_FILTER_PARAM_MAP.forEach((pair) => {
    const value = target[pair[0]];
    if (value) segments.push(value + pair[1]);
  });
  if (target.has_parking !== null && target.has_parking !== undefined) {
    segments.push(target.has_parking ? SINYI_PARKING_YES_SEGMENT : SINYI_PARKING_NO_SEGMENT);
  }
  return segments;
}

function sinyiFetchPage_(region, page, filterSegments) {
  const segments = (filterSegments || []).map(encodeURIComponent);
  const path = encodeURIComponent(region) + '/' + segments.concat(['default-desc', String(page)]).join('/');
  const url = SINYI_BASE_URL + '/buy/list/' + path;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const code = resp.getResponseCode();
      if (code === 200) {
        return sinyiParseListings_(resp.getContentText());
      }
      Logger.log('[信義] 抓取失敗，HTTP ' + code + '（page=' + page + '，第' + attempt + '/' + MAX_RETRIES + '次）');
    } catch (e) {
      Logger.log('[信義] 抓取失敗（page=' + page + '，第' + attempt + '/' + MAX_RETRIES + '次）: ' + e);
    }
    if (attempt < MAX_RETRIES) {
      Utilities.sleep(RETRY_DELAY_SECONDS * 1000);
    }
  }
  Logger.log('[信義] page=' + page + ' 重試' + MAX_RETRIES + '次仍失敗，放棄本次抓取。');
  return null;
}

function sinyiFetchTarget_(region, seenIds, maxPages, minRooms, filterSegments) {
  // 頁碼式分頁不需要知道每頁固定幾筆，抓到空頁就代表到底了。
  const allItems = [];
  let fetchFailed = false;
  for (let page = 1; page <= maxPages; page++) {
    const items = sinyiFetchPage_(region, page, filterSegments);
    if (items === null) {
      fetchFailed = true;
      break;
    }
    if (!items.length) break;

    const lastKey = 'sinyi-' + items[items.length - 1].houseid;

    let qualifying = items;
    if (minRooms !== null && minRooms !== undefined) {
      qualifying = items.filter((it) => it.room_count !== null && it.room_count >= minRooms);
    }
    Array.prototype.push.apply(allItems, qualifying);

    if (seenIds.has(lastKey)) break;
  }
  return { items: allItems, fetchFailed: fetchFailed };
}

function sinyiFetchLatestListings_(seenIds) {
  // SINYI是清單，每組縣市各自抓完再合併。每組target只讀自己物件裡的min_rooms，不共用全域值。
  const allItems = [];
  let fetchFailed = false;
  SINYI.forEach((target) => {
    const filterSegments = sinyiBuildFilterSegments_(target);
    const result = sinyiFetchTarget_(target.region, seenIds, SINYI_MAX_PAGES, target.min_rooms, filterSegments);
    Array.prototype.push.apply(allItems, result.items);
    if (result.fetchFailed) fetchFailed = true;
  });
  return { items: allItems, fetchFailed: fetchFailed };
}

function sinyiNormalize_(item) {
  const houseid = item.houseid;
  const price = item.price;
  return {
    source: SINYI_NAME,
    key: 'sinyi-' + houseid,
    houseid: houseid,
    title: item.title,
    community_name: item.community_name,
    address: item.address,
    room: item.room,
    area: item.area,
    price: price,
    show_price: price !== null && price !== undefined ? price.toLocaleString('en-US') : null,
    unitprice: null,
    houseage: item.houseage,
    floor: item.floor,
    has_carport: !!item.has_carport,
    photo_url: item.photo_url,
    url: item.url,
    posttime: null,
  };
}

const SINYI_SOURCE = {
  name: SINYI_NAME,
  label: SINYI_LABEL,
  fetchLatestListings: sinyiFetchLatestListings_,
  normalize: sinyiNormalize_,
};

// ============================================================
// 主流程(來源合併、去重、通知、Sheet存取)
// ============================================================


const TELEGRAM_API = 'https://api.telegram.org/bot{token}/{method}';

const SHEET_HEADERS = [
  'key', 'source', 'houseid', 'community_name', 'title', 'address', 'room', 'area',
  'price', 'unitprice', 'houseage', 'floor', 'has_carport',
  'photo_url', 'url', 'posttime', 'first_seen', 'duplicate_of',
];

/**
 * 每個來源都要有 name/label/fetchLatestListings(seenIds)/normalize(item)。
 * 用函式回傳(不是top-level const)，避免Apps Script跨檔案載入順序不保證、
 * 讀到還沒定義的HOUSE591_SOURCE等變數。
 */
function getSources_() {
  return [HOUSE591_SOURCE, YUNGCHING_SOURCE, SINYI_SOURCE];
}

function getSourceLabels_() {
  const labels = {};
  getSources_().forEach((s) => { labels[s.name] = s.label; });
  return labels;
}

function contentKey_(item) {
  return [item.address, item.area, item.room, item.price].join('|');
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(SHEET_HEADERS);
  }
  return sheet;
}

function loadSeenIds_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();
  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  return new Set(keys.map(String));
}

function rowToRecord_(row) {
  const record = {};
  SHEET_HEADERS.forEach((h, i) => { record[h] = row[i]; });
  return record;
}

function loadContentIndex_(sheet) {
  const lastRow = sheet.getLastRow();
  const index = {};
  if (lastRow < 2) return index;
  const rows = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS.length).getValues();
  rows.forEach((row) => {
    const record = rowToRecord_(row);
    const key = contentKey_(record);
    if (!index[key]) index[key] = [];
    index[key].push(String(record.key));
  });
  return index;
}

function findNewListings_(items, seenIds) {
  const newItems = [];
  const seenInBatch = new Set();
  items.forEach((item) => {
    const key = item.key;
    if (!seenIds.has(key) && !seenInBatch.has(key)) {
      newItems.push(item);
      seenInBatch.add(key);
    }
  });
  return newItems;
}

function findDuplicates_(newItems, contentIndex) {
  const duplicatesMap = {};
  newItems.forEach((item) => {
    const key = item.key;
    const content = contentKey_(item);
    const existing = contentIndex[content] || [];
    if (existing.length) {
      duplicatesMap[key] = existing.slice();
    }
    if (!contentIndex[content]) contentIndex[content] = [];
    contentIndex[content].push(key);
  });
  return duplicatesMap;
}

function appendNewRows_(sheet, newItems, duplicatesMap) {
  if (!newItems.length) return;
  const now = Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
  const rows = newItems.map((item) => [
    item.key,
    item.source,
    item.houseid,
    item.community_name || '',
    item.title || '',
    item.address || '',
    item.room || '',
    item.area || '',
    item.price || '',
    item.unitprice || '',
    item.houseage || '',
    item.floor || '',
    !!item.has_carport,
    item.photo_url || '',
    item.url || '',
    item.posttime || '',
    now,
    (duplicatesMap[item.key] || []).join(','),
  ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, SHEET_HEADERS.length).setValues(rows);
}

function pruneOld_(sheet, days) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const firstSeenCol = SHEET_HEADERS.indexOf('first_seen') + 1;
  const values = sheet.getRange(2, firstSeenCol, lastRow - 1, 1).getValues();

  // 從最後一列往前刪，避免刪除時列號位移影響前面還沒檢查的列
  for (let i = values.length - 1; i >= 0; i--) {
    const firstSeen = new Date(values[i][0]);
    if (!isNaN(firstSeen) && firstSeen < cutoff) {
      sheet.deleteRow(i + 2);
    }
  }
}

function buildTelegramCaption_(item, duplicateOf) {
  const label = getSourceLabels_()[item.source] || item.source;
  const name = item.community_name || item.title;
  const lines = [
    '<b>[' + label + '] ' + name + '</b>',
    '地址：' + item.address,
    '格局：' + item.room + '　坪數：' + item.area + '坪　屋齡：' + item.houseage + '年',
    '總價：' + item.show_price + '萬　車位：' + (item.has_carport ? '有' : '無'),
    item.url,
  ];
  if (duplicateOf && duplicateOf.length) {
    lines.push('⚠️ 疑似重複刊登，已有其他仲介刊登過（key: ' + duplicateOf.join(', ') + '）');
  }
  return lines.join('\n');
}

function sendTelegramMessage_(botToken, chatId, text) {
  const url = TELEGRAM_API.replace('{token}', botToken).replace('{method}', 'sendMessage');
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: { chat_id: chatId, text: text, parse_mode: 'HTML' },
      muteHttpExceptions: true,
    });
    const data = JSON.parse(resp.getContentText());
    if (!data.ok) {
      Logger.log('Telegram文字訊息傳送失敗: ' + resp.getContentText());
      return false;
    }
    return true;
  } catch (e) {
    Logger.log('Telegram文字訊息傳送失敗: ' + e);
    return false;
  }
}

function sendTelegramPhoto_(botToken, chatId, photoUrl, caption) {
  const url = TELEGRAM_API.replace('{token}', botToken).replace('{method}', 'sendPhoto');
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: { chat_id: chatId, photo: photoUrl, caption: caption, parse_mode: 'HTML' },
      muteHttpExceptions: true,
    });
    const data = JSON.parse(resp.getContentText());
    if (!data.ok) {
      Logger.log('Telegram圖片傳送失敗: ' + resp.getContentText());
      return false;
    }
    return true;
  } catch (e) {
    Logger.log('Telegram圖片傳送失敗: ' + e);
    return false;
  }
}

function notifyNewListings_(newItems, duplicatesMap) {
  const props = PropertiesService.getScriptProperties();
  const botToken = props.getProperty('TELEGRAM_BOT_TOKEN');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!botToken || !chatId) {
    Logger.log('找不到 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID（Script Properties），略過通知。');
    return;
  }
  newItems.forEach((item) => {
    const duplicateOf = duplicatesMap[item.key];
    if (!NOTIFY_DUPLICATES && duplicateOf) return; // 疑似重複刊登，不發通知（仍會記錄進Sheet）

    const caption = buildTelegramCaption_(item, duplicateOf);
    let sent = false;
    if (item.photo_url) {
      sent = sendTelegramPhoto_(botToken, chatId, item.photo_url, caption);
    }
    if (!sent) {
      sendTelegramMessage_(botToken, chatId, caption);
    }
  });
}

/**
 * 檢查ENABLED_SOURCES的key有沒有跟每個來源模組的name對上，避免打錯字被靜靜當成關閉。
 */
function checkConfig_() {
  getSources_().forEach((source) => {
    if (!(source.name in ENABLED_SOURCES)) {
      Logger.log(
        '⚠️ ENABLED_SOURCES 沒有 "' + source.name + '" 這個key，' +
        source.label + ' 會被當成關閉。如果你想抓這個來源，檢查是不是打錯字。'
      );
    }
  });
}

/**
 * 主要進入點：時間觸發器要指向這個函式。
 */
function checkNewListings() {
  checkConfig_();

  const sheet = getSheet_();
  const seenIds = loadSeenIds_(sheet);
  const allItems = [];
  let anyFailure = false;

  getSources_().forEach((source) => {
    if (!ENABLED_SOURCES[source.name]) return;
    const result = source.fetchLatestListings(seenIds);
    if (result.fetchFailed) {
      anyFailure = true;
      Logger.log('⚠️ [' + source.label + '] 本次抓取未完全成功，部分頁面抓取失敗，結果可能不完整。');
    }
    Array.prototype.push.apply(allItems, result.items.map(source.normalize));
  });

  if (!allItems.length && anyFailure) {
    Logger.log('⚠️ 本次所有來源都抓取失敗，未取得任何資料，等下次排程重試。');
    return;
  }

  const newItems = findNewListings_(allItems, seenIds);
  const contentIndex = loadContentIndex_(sheet);
  const duplicatesMap = findDuplicates_(newItems, contentIndex);

  Logger.log('發現 ' + newItems.length + ' 筆新物件。');

  notifyNewListings_(newItems, duplicatesMap);
  appendNewRows_(sheet, newItems, duplicatesMap);
  pruneOld_(sheet, PRUNE_DAYS);
}

/**
 * 只要手動執行一次：建立「每2小時執行 checkNewListings」的時間觸發器。
 */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'checkNewListings') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('checkNewListings').timeBased().everyHours(2).create();
  Logger.log('已建立每2小時觸發器。');
}
