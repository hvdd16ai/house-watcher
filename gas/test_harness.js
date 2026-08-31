/**
 * 本機測試用：模擬 Apps Script 執行環境來跑 Code.gs（設定跟邏輯都合併在這一個檔案裡）。
 * UrlFetchApp 改用真的 curl 呼叫591/Telegram的真實API，
 * SpreadsheetApp/PropertiesService 用記憶體/本機檔案模擬。
 * 這個檔案不會被貼進Google Apps Script，純粹是這裡驗證邏輯用的。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { execFileSync } = require('child_process');

const GAS_DIR = __dirname;
const PROJECT_DIR = path.join(__dirname, '..');

// ---- 讀取 telegram_secret.json（沒有的話用假值，Telegram呼叫會失敗但不影響其他邏輯測試）----
const secretPath = path.join(PROJECT_DIR, 'python', 'telegram_secret.json');
const secret = fs.existsSync(secretPath)
  ? JSON.parse(fs.readFileSync(secretPath, 'utf8'))
  : { bot_token: 'FAKE_TOKEN', chat_id: 'FAKE_CHAT_ID' };
if (!fs.existsSync(secretPath)) {
  console.log('⚠️ 找不到 python/telegram_secret.json，用假值測試（Telegram不會真的發送成功，其他邏輯不受影響）。');
}

// ---- 用陣列模擬一個 Google Sheet ----
function createFakeSheet() {
  let data = [];
  return {
    appendRow: (rowArr) => { data.push(rowArr.slice()); },
    getLastRow: () => data.length,
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const rowData = data[row - 1 + r] || [];
          const rowOut = [];
          for (let c = 0; c < numCols; c++) rowOut.push(rowData[col - 1 + c]);
          out.push(rowOut);
        }
        return out;
      },
      setValues: (values) => {
        values.forEach((rowValues, i) => {
          const rowIdx = row - 1 + i;
          while (data.length <= rowIdx) data.push([]);
          rowValues.forEach((v, c) => { data[rowIdx][col - 1 + c] = v; });
        });
      },
    }),
    deleteRow: (rowNum) => { data.splice(rowNum - 1, 1); },
    _dump: () => data,
    _seed: (rows) => { data = rows; },
  };
}

const sheetsStore = {};
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (name) => sheetsStore[name] || null,
    insertSheet: (name) => {
      const sheet = createFakeSheet();
      sheetsStore[name] = sheet;
      return sheet;
    },
  }),
};

// ---- UrlFetchApp：真的用curl打591/Telegram的API ----
const UrlFetchApp = {
  fetch: (url, options) => {
    options = options || {};
    const method = (options.method || 'get').toLowerCase();
    const headers = options.headers || {};
    const args = ['-s', '-w', '\n___HTTP_CODE___%{http_code}'];
    if (method === 'post') {
      args.push('-X', 'POST');
      if (options.payload) {
        const body = new URLSearchParams(options.payload).toString();
        args.push('--data', body);
      }
    }
    Object.keys(headers).forEach((h) => {
      args.push('-H', `${h}: ${headers[h]}`);
    });
    args.push(url);
    const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    const marker = '___HTTP_CODE___';
    const idx = out.lastIndexOf(marker);
    const body = out.slice(0, idx);
    const code = parseInt(out.slice(idx + marker.length).trim(), 10);
    return {
      getResponseCode: () => code,
      getContentText: () => body,
    };
  },
};

const Utilities = {
  sleep: () => { /* 測試時不要真的等，直接跳過 */ },
  formatDate: (date) => {
    const taipei = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const pad = (n) => String(n).padStart(2, '0');
    return `${taipei.getFullYear()}-${pad(taipei.getMonth() + 1)}-${pad(taipei.getDate())}T${pad(taipei.getHours())}:${pad(taipei.getMinutes())}:${pad(taipei.getSeconds())}+08:00`;
  },
};

const Logger = { log: (...args) => console.log(...args) };

// ---- 用物件模擬 Script Properties(get/set都要支援，心跳功能會用到setProperty)----
const scriptProps = {
  TELEGRAM_BOT_TOKEN: secret.bot_token,
  TELEGRAM_CHAT_ID: String(secret.chat_id),
};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => (key in scriptProps ? scriptProps[key] : null),
    setProperty: (key, value) => { scriptProps[key] = value; },
  }),
};

// ---- 讀取 Code.gs(現在整套邏輯都合併在一個檔案裡)，在vm context執行 ----
const combinedSrc = fs.readFileSync(path.join(GAS_DIR, 'Code.gs'), 'utf8');

const context = { console, UrlFetchApp, SpreadsheetApp, PropertiesService, Utilities, Logger };
vm.createContext(context);
vm.runInContext(combinedSrc, context, { filename: 'gas-combined.js' });

// ---- 用Python版累積的 seen_houses.json 種進假Sheet，避免這次測試把已通知過的物件當新的洗版 ----
// Python版的key已經是 "591-xxx"/"yc-xxx"/"sinyi-xxx" 格式，跟GAS新schema的key欄位直接對應
const SHEET_HEADERS = [
  'key', 'source', 'houseid', 'community_name', 'title', 'address', 'room', 'area',
  'price', 'unitprice', 'houseage', 'floor', 'has_carport',
  'photo_url', 'url', 'posttime', 'first_seen', 'duplicate_of',
];

const seenPath = path.join(PROJECT_DIR, 'python', 'seen_houses.json');
let seenRows = [SHEET_HEADERS.slice()];
if (fs.existsSync(seenPath)) {
  const seenData = JSON.parse(fs.readFileSync(seenPath, 'utf8'));
  Object.keys(seenData).forEach((key) => {
    const r = seenData[key];
    const source = key.startsWith('yc-') ? 'yc' : (key.startsWith('sinyi-') ? 'sinyi' : '591');
    const houseid = key.slice(key.indexOf('-') + 1);
    seenRows.push([
      key, source, houseid, r.community_name || '', r.title || '', r.address || '', r.room || '',
      r.area || '', r.price || '', r.unitprice || '', r.houseage || '', r.floor || '',
      !!r.has_carport, r.photo_url || '', r.url || '', r.posttime || '', r.first_seen || '',
      (r.duplicate_of || []).join(','),
    ]);
  });
}
const seededSheet = createFakeSheet();
seededSheet._seed(seenRows);
sheetsStore['seen_houses'] = seededSheet;
console.log(`已用 seen_houses.json 種了 ${seenRows.length - 1} 筆舊資料進假Sheet，避免測試洗版通知。`);

// ---- 執行 checkNewListings() ----
vm.runInContext('checkNewListings()', context, { filename: 'harness-call.js' });

console.log('\n=== 執行後 Sheet 筆數 ===');
console.log(sheetsStore['seen_houses'].getLastRow() - 1, '筆（含舊資料）');
