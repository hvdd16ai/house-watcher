# house-watcher

新物件監控工具，持續追蹤 [591](https://sale.591.com.tw)、[永慶房屋](https://buy.yungching.com.tw)、[信義房屋](https://www.sinyi.com.tw) 三個平台，符合設定條件的新刊登物件透過 Telegram 即時通知。

提供兩種部署方式：本機 Python(排程執行)與 Google Apps Script(雲端執行)，功能與設定邏輯一致，可依需求擇一或並行使用。

## 目錄

- [功能特色](#功能特色)
- [運作原理](#運作原理)
- [部署方式比較](#部署方式比較)
- [前置作業：建立 Telegram Bot](#前置作業建立-telegram-bot)
- [部署：Python](#部署python)
- [部署：Google Apps Script](#部署google-apps-script)
- [設定參考](#設定參考)
- [疑難排解](#疑難排解)
- [資料來源比較](#資料來源比較)
- [專案結構](#專案結構)
- [實作細節](#實作細節)
- [使用限制與聲明](#使用限制與聲明)

## 功能特色

- 同時支援三個房屋交易平台，來源可個別啟用/停用
- 每個平台支援多組搜尋條件(可同時追蹤多個縣市/行政區)
- 內建去重機制，同一物件不會重複通知
- 自動偵測同一戶被不同仲介重複刊登的情況
- 抓取失敗自動重試，並明確區分「抓取失敗」與「無新物件」
- 提供網址解析工具，貼上平台搜尋結果網址即可自動產生對應設定

## 運作原理

1. 依排程週期向三個平台請求符合設定條件的最新物件列表（Python 版由使用者自行於 crontab 設定；GAS 版 `setupTrigger()` 預設每 2 小時，可自行修改）
2. 比對本地／雲端資料庫中已通知過的物件紀錄，篩選出尚未出現過的物件
3. 將新物件透過 Telegram Bot 推播通知，並寫入資料庫供下次比對使用

物件識別採用各平台原生的唯一編號（591 為 `houseid`、永慶／信義為各自的物件代碼），並加上來源前綴（如 `591-20658410`）避免跨平台編號衝突。

## 部署方式比較

| | Python 版 | Google Apps Script 版 |
|---|---|---|
| 執行環境 | 本機電腦 | Google 雲端 |
| 前置需求 | Python 3、終端機操作 | Google 帳號 |
| 優點 | 設定直觀、log 易於查閱 | 免主機維護，穩定持續執行 |
| 限制 | 電腦需保持開機且未進入睡眠 | 需透過瀏覽器操作 Apps Script 編輯器 |

兩者可並行部署，功能完全對等；同時啟用會收到重複通知，建議擇一使用。

## 前置作業：建立 Telegram Bot

無論選擇哪種部署方式，皆需先建立 Telegram Bot 作為通知管道。

1. 於 Telegram 搜尋官方帳號 **`@BotFather`**
2. 傳送 `/newbot` 指令
3. 依提示設定：
   - Bot 顯示名稱（任意）
   - Bot username（須以 `bot` 結尾，例如 `myhousewatch_bot`）
4. 建立完成後取得 **Bot Token**，格式如下：
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
5. 於 Telegram 搜尋剛建立的 bot username，傳送任意訊息（例如 `hi`）——此步驟為觸發 Chat ID 查詢的必要動作
6. 查詢 **Chat ID**：將下列網址中的 `YOUR_TOKEN` 替換為實際 Token 後於瀏覽器開啟：
   ```
   https://api.telegram.org/botYOUR_TOKEN/getUpdates
   ```
   回應中 `"chat":{"id":...}` 的數值即為 Chat ID。若回傳 `"result":[]`，表示尚未完成步驟 5，請先傳送訊息後重新整理。

請妥善保存 **Bot Token** 與 **Chat ID**，後續設定步驟需要使用。

## 部署：Python

### 環境需求

- Python 3（於終端機執行 `python3 --version` 確認版本，未安裝請至 [python.org](https://www.python.org/downloads/) 下載）

### 安裝

```bash
git clone https://github.com/hvdd16ai/house-watcher.git
cd house-watcher
pip3 install -r requirements.txt
```

### 設定

**1. Telegram 憑證**

```bash
cd python
cp telegram_secret.example.json telegram_secret.json
```

編輯 `telegram_secret.json`，填入實際 Token 與 Chat ID：

```json
{
  "bot_username": "your_bot_username",
  "bot_token": "<Bot Token>",
  "chat_id": "<Chat ID>"
}
```

> 此檔案已列入 `.gitignore`，不會被提交至版本控制。

**2. 搜尋條件**

編輯 `config.py`，修改 `HOUSE_591`、`YUNGCHING`、`SINYI` 三組設定（預設為新竹市東區）。地區代碼可參考 [`SITES_REFERENCE.md`](SITES_REFERENCE.md)，或使用附帶工具自動解析：

```bash
python3 parse_url.py "<平台搜尋結果網址>"
```

範例（591 新竹市東區搜尋結果網址）：

```bash
python3 parse_url.py "https://sale.591.com.tw/list?regionid=4&sectionid=371&type=2&shape=2&pattern=2,3,4,5"
```

輸出：

```
判斷為【591】的網址，解析結果（可以直接複製貼進 config.py 的 HOUSE_591 清單裡）：

    {
        'regionid': 4,
        'sectionid': 371,
        'type': 2,
        'shape': 2,
        'price': None,
        'area': None,
        'pattern': '2,3,4,5',
        'label': None,
    },
```

複製 `{...}` 這一段貼進 `config.py` 的 `HOUSE_591` 清單裡即可。

永慶／信義的網址也用同一支工具，會自動判斷網站並輸出對應格式：

```bash
python3 parse_url.py "https://buy.yungching.com.tw/list/新竹市-東區_c/new_filter"
```

輸出：

```
判斷為【永慶】的網址，解析結果（可以直接複製貼進 config.py 的 YUNGCHING 清單裡）：

    {
        'region': '新竹市-東區',
        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None
    },
```

```bash
python3 parse_url.py "https://www.sinyi.com.tw/buy/list/Hsinchu-city"
```

輸出：

```
判斷為【信義】的網址，解析結果（可以直接複製貼進 config.py 的 SINYI 清單裡）：

    {
        'region': 'Hsinchu-city',
        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None
    },

⚠️ 提醒：信義只能篩到縣市層級，抓到的會是整個縣市範圍，不會只有你想要的區。
```

### 執行

**手動測試：**

```bash
python3 scraper.py
```

> 首次執行會將當下抓取結果全數視為新物件，可能產生大量通知——此為建立去重基準資料的預期行為，後續執行僅會通知真正的新增物件。

**建立排程**（macOS / Linux，使用 `crontab`）：

```bash
crontab -e
```

新增以下內容（範例為每 2 小時執行一次，⚠️ **路徑需替換為實際安裝位置**）：

```
0 */2 * * * /usr/bin/python3 /absolute/path/house-watcher/python/scraper.py >> /absolute/path/house-watcher/python/cron.log 2>&1
```

Windows 環境請改用「工作排程器」（Task Scheduler）設定定期執行 `scraper.py`。

## 部署：Google Apps Script

### 環境需求

- Google 帳號，無需安裝任何軟體

### 建立專案

1. 建立一份新的 Google 試算表（作為資料儲存用途）
2. 於選單列選擇 **擴充功能 → Apps Script**
3. 清空預設的 `Code.gs` 內容，貼入本專案 [`gas/Code.gs`](gas/Code.gs) 全部程式碼並儲存
4. （選用）新增檔案 `ParseUrl`，貼入 [`gas/ParseUrl.gs`](gas/ParseUrl.gs) 內容，供網址解析工具使用

### 設定 Telegram 憑證

憑證不寫入程式碼，改存於 Apps Script 的指令碼屬性：

1. 編輯器左側「專案設定」（齒輪圖示）
2. 「指令碼屬性」→「新增指令碼屬性」，新增以下兩筆：

| 屬性名稱 | 值 |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot Token |
| `TELEGRAM_CHAT_ID` | Chat ID |

### 設定搜尋條件

於 `Code.gs` 開頭修改 `HOUSE_591`、`YUNGCHING`、`SINYI` 設定，格式與 Python 版一致，說明見程式內註解與 [`SITES_REFERENCE.md`](SITES_REFERENCE.md)。

### 執行與授權

1. 函式選單選擇 **`checkNewListings`**，點擊執行
2. 首次執行將觸發 Google 權限確認流程：依序選擇帳號 →（若出現「Google 尚未驗證這個應用程式」）點擊「進階」→「前往（不安全）」→「允許」。此提示為 Apps Script 對未送審自訂腳本的標準警示，非安全疑慮。
3. 執行完成後可於 `Ctrl+Enter` 或「執行紀錄」確認結果；試算表將新增 `seen_houses` 分頁記錄物件資料
4. Telegram 應收到通知（首次執行同樣會產生大量通知，屬預期行為）

### 建立排程

1. 函式選單改選 **`setupTrigger`**，點擊執行
2. 完成後即建立每 2 小時自動執行一次的時間觸發器，可於編輯器左側「觸發條件」確認

## 設定參考

Python 版位於 `config.py`，Apps Script 版位於 `Code.gs` 開頭，設定項目一一對應：

| 設定項目 | 說明 |
|---|---|
| `ENABLED_SOURCES` | 各資料來源啟用開關 |
| `HOUSE_591` / `YUNGCHING` / `SINYI` | 各平台搜尋條件清單，支援多組目標同時追蹤 |
| `min_rooms`（YUNGCHING／SINYI 個別設定） | 房數門檻；此二平台無伺服器端房數篩選，改由程式解析格局文字判斷 |
| `NOTIFY_DUPLICATES` | 疑似重複刊登物件是否推播通知，預設 `false` |
| `PRUNE_DAYS` | 歷史紀錄保留天數，預設 180 天 |

## 疑難排解

**未收到任何通知**
- 確認 `telegram_secret.json`（Python）或指令碼屬性（Apps Script）憑證正確
- 確認已完成「前置作業」步驟 5（傳送訊息予 Bot）
- 檢視執行紀錄：Python 版查看 `cron.log`；Apps Script 版查看「執行紀錄」

**單次執行通知數量異常龐大**
- 屬預期行為，發生於首次執行、新增資料來源、或大幅調整篩選條件時（程式將當下結果全數視為基準資料）

**信義房屋通知包含非目標行政區**
- 信義房屋平台未提供行政區層級篩選，僅能篩選至縣市層級，此為平台本身限制，程式將完整收錄該縣市結果，需自行依地址判斷

## 資料來源比較

| | 591 | 永慶 | 信義 |
|---|---|---|---|
| 篩選精細度 | 可達行政區層級 | 可達行政區層級 | 僅達縣市層級 |
| 資料取得方式 | 平台內部 JSON API | 解析伺服器渲染 HTML | 解析頁面內嵌 JSON |
| 房數篩選 | 平台伺服器端（極少數情況存在誤判） | 程式端解析格局文字 | 程式端解析格局文字 |

## 專案結構

```
house-watcher/
├── requirements.txt
├── SITES_REFERENCE.md          # 各平台搜尋參數對照表
├── python/                     # Python 版
│   ├── scraper.py                主流程：來源調度、去重、通知、資料儲存
│   ├── house_591.py               591 資料擷取邏輯
│   ├── yungching.py                永慶房屋資料擷取邏輯
│   ├── sinyi.py                     信義房屋資料擷取邏輯
│   ├── config.py                     設定檔
│   ├── parse_url.py                   網址解析工具
│   └── telegram_secret.example.json     Telegram 憑證範本
└── gas/                        # Google Apps Script 版
    ├── Code.gs                   主程式（單一檔案，簡化部署流程）
    ├── ParseUrl.gs                網址解析工具（選用）
    └── test_harness.js             本機模擬測試工具（開發用途）
```

## 實作細節

- **去重機制**：各物件以來源前綴＋平台原生編號組成唯一鍵值（如 `591-20658410`、`yc-1234567`、`sinyi-C363504`），已通知物件不會重複推播
- **重複刊登偵測**：地址、坪數、格局、總價四項欄位完全一致時，判定為同一物件之重複刊登，標記 `duplicate_of` 並依 `NOTIFY_DUPLICATES` 設定決定是否通知，紀錄則無論如何皆會保留
- **容錯處理**：抓取失敗時自動重試，重試後仍失敗會明確標示錯誤，不會與「無新物件」混淆
- **分頁策略**：依各平台排序機制抓取最新物件，遇已記錄物件即停止翻頁，避免每次執行重複掃描全部資料

## 使用限制與聲明

本工具僅整理、比對各平台公開網頁資訊並提供個人化通知，供個人使用。請使用者自行評估各平台服務條款之適用性；建議抓取頻率維持在 2 小時以上（GAS 版預設即為 2 小時），已考量對來源平台之負擔，請避免調整為高頻率請求，亦不得用於商業用途。
