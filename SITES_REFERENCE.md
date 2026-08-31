# 搜尋條件參數對照表

本文件說明 `config.py`（Python 版）／`Code.gs`（GAS 版）中 `HOUSE_591`、`YUNGCHING`、`SINYI` 三組設定的參數格式，並提供已實測驗證過的地區代碼對照表。

## 目錄

- [快速設定：使用網址解析工具](#快速設定使用網址解析工具)
- [591 參數對照](#591-參數對照)
- [永慶房屋參數對照](#永慶房屋參數對照)
- [信義房屋參數對照](#信義房屋參數對照)
- [`min_rooms` 為 per-target 設定](#min_rooms-為-per-target-設定)
- [手動從網址解析設定值](#手動從網址解析設定值)
- [附錄：591 `sectionid` 批次掃描](#附錄591-sectionid-批次掃描)

## 快速設定：使用網址解析工具

推薦流程：在各平台網站上手動選好縣市／行政區／篩選條件，複製瀏覽器網址列的搜尋結果網址，交給 `parse_url.py`（Python 版）或 `ParseUrl.gs`（GAS 版）自動解析。工具會依網域自動判斷平台，輸出可直接貼入設定檔的內容。

```bash
python3 parse_url.py "<平台搜尋結果網址>"
```

### 591 範例

```bash
python3 parse_url.py "https://sale.591.com.tw/list?regionid=4&sectionid=371&type=2&shape=2&pattern=2,3,4,5"
```

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

### 永慶範例

```bash
python3 parse_url.py "https://buy.yungching.com.tw/list/新竹市-東區_c/new_filter"
```

```
判斷為【永慶】的網址，解析結果（可以直接複製貼進 config.py 的 YUNGCHING 清單裡）：

    {
        'region': '新竹市-東區',
        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None
    },
```

### 信義範例

```bash
python3 parse_url.py "https://www.sinyi.com.tw/buy/list/Hsinchu-city"
```

```
判斷為【信義】的網址，解析結果（可以直接複製貼進 config.py 的 SINYI 清單裡）：

    {
        'region': 'Hsinchu-city',
        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None
    },

⚠️ 提醒：信義只能篩到縣市層級，抓到的會是整個縣市範圍，不會只有你想要的區。
```

工具無法解析、或需要沒驗證過的新代碼時，可參考下方各平台的參數對照表，或依照[手動從網址解析設定值](#手動從網址解析設定值)章節自行判讀。

## 591 參數對照

`HOUSE_591` 各參數採數字代碼，代碼本身無公開對照表，皆為手動於網站上選取後、由網址列反查取得。

| 參數 | 說明 | 已驗證的值 |
|---|---|---|
| `regionid` | 縣市 | 新竹市 = `4`、新竹縣 = `5` |
| `sectionid` | 鄉鎮/區 | 新竹市：東區 = `371`、北區 = `372`（香山區未測）。新竹縣：竹北市 = `54`、湖口鄉 = `55`、新豐鄉 = `56`、新埔鎮 = `57`、關西鎮 = `58`、芎林鄉 = `59`、寶山鄉 = `60`、竹東鎮 = `61`、五峰鄉 = `62`、橫山鄉 = `63`、尖石鄉 = `64`、北埔鄉 = `65`、峨嵋鄉 = `66` |
| `type` | 類型 | 住宅 = `2` |
| `shape` | 型態 | 電梯大樓 = `2`（別墅/透天厝/公寓/華廈代碼未測） |
| `price` | 總價區間（萬） | 格式 `"最低_最高"`，例：`"0_750"` |
| `area` | 坪數區間 | 格式 `"$最低_$最高"`，例：`"$30_$50"`（含 `$` 符號） |
| `pattern` | 房數 | 逗號分隔多選，`"2,3,4,5"` = 2 房以上 |
| `label` | 勾選條件 | 逗號分隔 ID，目前只知道組合結果 `"7,9,4,3,6,2,12,16"`，尚未拆解個別 ID 意義 |

**`sectionid` 支援多選**：以逗號分隔多個代碼即可，例如 `"371,372"` 代表東區＋北區同時搜尋（已實測，`total` 數會合併兩區、結果混合出現）。`regionid` 理論上也支援，但尚未實測。

**跨縣市（多個 `regionid`）不支援逗號合併**——已實測 `regionid="4,1"` 僅回傳其中一個縣市的結果。跨縣市需求請在 `HOUSE_591` 清單中新增獨立的 target dict，一組一個縣市。

**要新增未列出的地區代碼：**

1. 至 [sale.591.com.tw](https://sale.591.com.tw) 手動選取欲搜尋的縣市／鄉鎮區／其他篩選條件
2. 觀察網址列，`regionid=`、`sectionid=` 後面的數字即為代碼
3. 其他篩選條件（總價／坪數／房數）選取後同樣會反映於網址上

> ⚠️ 網頁手動選取偶有失效情況（面板已開合、確定按鈕存在於 DOM 但實際為隱藏/disabled 狀態，點擊後網址不更新）。此時改用 API 批次掃描效率更高，作法見[附錄](#附錄591-sectionid-批次掃描)。

## 永慶房屋參數對照

### 縣市／行政區

`YUNGCHING` 使用**中文地名直接組合**，不需查代碼表，格式固定：

```
"縣市-鄉鎮區"    例："新竹市-東區"、"台北市-大安區"、"新竹縣-竹北市"
```

只要中文縣市／鄉鎮區名稱正確即可使用——三個平台中唯一不需查代碼表的一組。

**支援多選**：以逗號分隔多組「縣市-鄉鎮區」，例如 `"新竹市-東區,新竹市-北區"`（已實測，結果混合出現兩區地址）。

### 其他篩選條件（網址路徑參數）

永慶的搜尋網址將每個篩選條件附加為 `{值}_{參數}` 的路徑片段，多個條件依序串接，例如：

```
https://buy.yungching.com.tw/list/新竹市-東區_c/1000-_price/電梯大廈_type/住宅_p/y_park/new_filter
```

以下為透過網站「更多條件」面板逐一點選並比對網址所整理出的對照表：

| UI 分類 | 網址參數 | 格式 | 已驗證的值 |
|---|---|---|---|
| 總價 | `_price` | `{最低}-{最高}`（萬），開放區間可留空一端 | `1000-` = 1000 萬以上 |
| 型態 | `_type` | 中文值 | `電梯大廈`、`華廈`、`透天別墅`（原始選項為「透天/別墅」，網址中 `/` 被移除）。「無電梯公寓」點選後未反映於網址，原因待查 |
| 房數 | `_rmp` | `{最低}-{最高}`（房） | `2-2` = 2 房 |
| 坪數（建坪） | `_pin` | `{最低}-{最高}`（坪） | `20-30` |
| 車位 | `_park` | `y` = 有車位／`n` = 無車位 | |
| 屋齡 | `_age` | `{最低}-{最高}`（年），開放區間可留空一端 | `-5` = 5 年以下、`-0` = 預售屋 |

**多筆條件並存**：不同參數的篩選條件會依序串接為多個路徑片段（如上方範例網址），已實測可行；同一參數內是否支援多選（例如型態同時選兩種）尚未測試。

> 「更多條件」面板還有用途、樓層、衛浴數、周邊環境、朝向、住宅特色等篩選，此表僅收錄較常用的幾項；如需其餘參數，可比照上方方法自行於面板點選並比對網址。

**已實作**：`YUNGCHING` 每組 target dict 都可以加上 `price`／`type`／`rooms`／`area`／`house_age`／`has_parking` 這幾個欄位（對應上表 `_price`／`_type`／`_rmp`／`_pin`／`_age`／`_park`），`yungching.py`（Python）與 `Code.gs`（GAS）都會把它們組進送出去的網址，讓永慶伺服器端先篩一次，用法與範例見 `config.py` 內的註解。`parse_url.py`／`ParseUrl.gs` 貼入含這些條件的完整網址也會自動解析出對應欄位。

**房數篩選**：`min_rooms` 與新的 `rooms` 欄位是兩回事、互不影響：`min_rooms` 由程式解析「格局」文字判斷、一定會套用；`rooms` 是額外多加的平台原生篩選（伺服器端先篩，可以少抓幾頁），不設也沒關係。

## 信義房屋參數對照

`SINYI` 使用**英文縣市名 + `-city`**，僅支援至縣市層級，**不支援鄉鎮區篩選**（信義系統將整個縣市視為單一地區代碼，未再拆分至行政區）。

| 縣市 | 已驗證的值 |
|---|---|
| 新竹市 | `Hsinchu-city` |
| 台北市 | `Taipei-city` |

**要新增未列出的縣市：**

1. 至 [www.sinyi.com.tw](https://www.sinyi.com.tw) 首頁地區選單選取欲搜尋的縣市
2. 觀察網址列 `/buy/list/{英文名}-city` 的英文名部分

> ⚠️ 選定縣市後**無法再篩選至鄉鎮區**，抓取結果為整個縣市範圍，程式將全數收錄，須自行依地址判斷是否符合需求。

**多選縣市**：格式上可能同樣支援逗號分隔，但尚未實測，使用前請先行驗證。

### 其他篩選條件（網址路徑參數）

信義的搜尋網址同樣將篩選條件附加為路徑片段，格式與永慶類似但用英文／拼音組成，多個條件依序串接，例如：

```
https://www.sinyi.com.tw/buy/list/Hsinchu-city/300-zip/dalou-type/1000-up-price/2-up-roomtotal/default-desc/1
```

以下為實測驗證過的參數（以「套用後回傳筆數是否變化」比對確認）：

| 說明 | 網址參數 | 格式 | 已驗證的值 |
|---|---|---|---|
| 型態 | `-type` | 拼音值 | `dalou` = 大樓（其餘型態如公寓、華廈、套房等代碼未逐一確認，猜測拼音多次嘗試無效，需另行比對） |
| 總價 | `-price` | `{最低}-up`（萬），代表最低金額以上 | `1000-up` = 1000 萬以上 |
| 房數 | `-roomtotal` | `{最低}-up`（房），代表最低房數以上 | `2-up` = 2 房以上 |

**⚠️ `-zip` 參數（如 `300-zip`）意義尚未完全確認**：`300` 為新竹市的郵遞區號，套用後回傳筆數與未篩選時完全相同（1161 筆不變），研判在僅選取單一縣市、且該縣市郵遞區號涵蓋全區的情況下不會實際限縮結果；是否能用更細的郵遞區號做到行政區層級篩選尚未驗證。

**多筆條件並存**：已實測上方範例網址（型態＋總價＋房數同時套用）可正常組合，結果筆數符合各條件交集。

**已實作**：`SINYI` 每組 target dict 都可以加上 `type`／`price`／`rooms`／`zip` 這幾個欄位（對應上表 `-type`／`-price`／`-roomtotal`／`-zip`），`sinyi.py`（Python）與 `Code.gs`（GAS）都會把它們組進送出去的網址；`zip` 效果未完全確認，不建議依賴它來達成行政區篩選，其餘三個已驗證有效。`parse_url.py`／`ParseUrl.gs` 貼入含這些條件的完整網址也會自動解析出對應欄位。

**房數篩選**：與永慶相同，`min_rooms`（格局文字判斷、一定套用）與新的 `rooms` 欄位（平台原生篩選、伺服器端先篩，不設也沒關係）是兩回事，互不影響。

## `min_rooms` 為 per-target 設定

永慶（`YUNGCHING`）、信義（`SINYI`）的每一組 target dict 皆須各自帶入 `min_rooms`，不同組可設定不同門檻（591 不受此限，591 的房數篩選走各 target dict 自身的 `pattern` 參數）。範例見 `config.py` 內註解。

## 手動從網址解析設定值

`parse_url.py`（Python 版）／`ParseUrl.gs`（GAS 版）無法使用、或需支援全新的第四個平台時，可依下列流程自行從網址判讀：

### 591

範例網址：

```
https://sale.591.com.tw/?regionid=4&sectionid=371&shape=2&type=2&pattern=2,3,4,5&price=0_750
```

1. 網址 `?` 後方以 `&` 分隔的每個 `key=value` 皆為一個參數
2. 僅需留意以下幾個：`regionid`、`sectionid`、`type`、`shape`、`price`、`area`、`pattern`、`label`（`firstRow`、`shType`、`order` 等為程式內部技術參數，可忽略）
3. 網址中未出現的參數代表「不限」，`HOUSE_591` 中應填入 `None`
4. 對照上例 → `{"regionid": 4, "sectionid": 371, "type": 2, "shape": 2, "price": "0_750", "area": None, "pattern": "2,3,4,5", "label": None}`

### 永慶

範例網址：

```
https://buy.yungching.com.tw/list/新竹市-東區_c/new_filter
```

1. 取 `/list/` 與 `_c/` 之間的文字段落，即為 `region` 的值
2. 本例中間段為 `新竹市-東區` → `{"region": "新竹市-東區", "min_rooms": 2}`
3. 若網址為編碼後的亂碼（`%E6%96%B0...`），貼至瀏覽器網址列按 Enter 通常會自動還原為中文，或使用任一「URL 解碼」工具轉換

### 信義

範例網址：

```
https://www.sinyi.com.tw/buy/list/Hsinchu-city/default-desc/1
```

1. 取 `/buy/list/` 之後、下一個 `/` 之前的段落，即為 `region` 的值
2. 本例為 `Hsinchu-city` → `{"region": "Hsinchu-city", "min_rooms": 2}`
3. 信義僅支援至縣市層級，即使選取鄉鎮區，網址亦不會反映該篩選

## 附錄：591 `sectionid` 批次掃描

當網頁手動選取失效（見[591 參數對照](#591-參數對照)的提醒）時，可改用 API 批次掃描直接列舉 `sectionid` 數字，效率遠高於逐一手動點選：

```python
import requests
from concurrent.futures import ThreadPoolExecutor

def check(sid):
    r = requests.get('https://bff-house.591.com.tw/v1/web/sale/list',
        params={'type': 2, 'category': 1, 'regionid': 5, 'sectionid': sid, 'section': sid,
                'shType': 'list', 'firstRow': 0},
        headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
    d = r.json()
    if d['data']['house_list']:
        return (sid, d['data']['house_list'][0].get('section_name'), d['data']['total'])

with ThreadPoolExecutor(max_workers=20) as ex:
    results = list(ex.map(check, range(1, 370)))
for r in results:
    if r:
        print(r)
```

此範例掃描 `regionid=5`（新竹縣）的 `sectionid` 範圍 1～370，一次列舉出全部 13 個鄉鎮的代碼（結果已收錄於[591 參數對照](#591-參數對照)表中）。

> ⚠️ 掃描範圍建議抓寬一點（例如 1～500），`max_workers` 不宜設定過高，避免對來源伺服器造成過大負擔或被判定為異常流量。掃描完成後請將結果補回本文件的對照表。

**驗證方式**：以查得的 `regionid=5, sectionid=54` 執行 `python3 parse_url.py "https://sale.591.com.tw/?regionid=5&sectionid=54&shape=2&type=2&pattern=2,3,4,5"`，再實際呼叫 `house_591._fetch_target()` 確認能正確取得竹北市資料（驗證結果：31 筆，社區、地址、格局、總價皆正常）。
