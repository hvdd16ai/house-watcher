# 設定參數詳解

本文件說明 `config.py`（Python 版）／`Code.gs`（GAS 版）中 `HOUSE_591`、`YUNGCHING`、`SINYI` 三組設定的每一個參數：意義、格式、怎麼填。所有參數**不需要就填 `None`**（GAS 版填 `null`），不影響其他欄位。

## 目錄

- [各網站支援總覽](#各網站支援總覽)
- [591（HOUSE_591）](#591house_591)
- [永慶房屋（YUNGCHING）](#永慶房屋yungching)
- [信義房屋（SINYI）](#信義房屋sinyi)
- [其餘補充](#其餘補充)
- [附錄：591 `sectionid` 批次掃描](#附錄591-sectionid-批次掃描)

## 各網站支援總覽

| 篩選條件 | 591 | 永慶 | 信義 |
|---|---|---|---|
| 縣市 | ✅ `regionid` | ✅ 內含在 `region` | ✅ `region`（僅到縣市層級） |
| 行政區 | ✅ `sectionid` | ✅ 內含在 `region` | ❌ 不支援，只能整個縣市 |
| 總價 | ✅ `price` | ✅ `price` | ✅ `price` |
| 型態（電梯大樓/華廈等） | ✅ `shape` | ✅ `type` | ✅ `type`（僅驗證 1 種型態代碼） |
| 房數（平台原生篩選） | ✅ `pattern` | ✅ `rooms` | ✅ `rooms` |
| 房數（程式讀格局文字判斷） | 不需要，591 伺服器端已篩 | ✅ `min_rooms`（必填備援機制） | ✅ `min_rooms`（必填備援機制） |
| 坪數 | ✅ `area` | ✅ `area`（建坪） | ❌ 未提供 |
| 車位 | ✅ `parking`（車位類型代碼） | ✅ `has_parking` | ✅ `has_parking` |
| 屋齡 | ✅ `houseage` | ✅ `house_age` | ❌ 未提供 |

591 的房數是伺服器端真的篩過，永慶／信義沒有可靠的伺服器端房數勾選介面，所以程式一律用「格局」文字自己判斷（`min_rooms`），這個機制**每組 target 都必填**、一定會套用；新加的 `rooms` 欄位只是額外讓網站先篩一次以減少要抓的頁數，兩者互不影響，設不設都可以。

## 591（HOUSE_591）

### 參數對照

| 參數 | 說明 | 範例的值 |
|---|---|---|
| `regionid` | 縣市代碼（必填） | `4`（新竹市） |
| `sectionid` | 鄉鎮/區代碼（必填），同縣市內支援逗號多選 | `371`（東區），或 `"371,372"`（東區+北區） |
| `type` | 類型 | `2`（住宅） |
| `shape` | 型態 | `2`（電梯大樓） |
| `price` | 總價區間(萬)，格式 `"最低_最高"` | `"0_750"`；不需要請填 `None` |
| `area` | 坪數區間，格式 `"$最低_$最高"`（含 `$` 符號） | `"$30_$50"`；不需要請填 `None` |
| `pattern` | 房數（平台原生篩選），逗號分隔多選 | `"2,3,4,5"` = 2房以上；不需要請填 `None` |
| `houseage` | 屋齡(年)，格式 `"最低_最高"` | `"0_5"` = 5年以下；不需要請填 `None` |
| `parking` | 車位類型，逗號分隔數字，目前只驗證過 `1`=平面式、`2`=機械式 | `"1,2"`；不需要請填 `None` |

### 如何填 config

#### 手動

1. 至 [sale.591.com.tw](https://sale.591.com.tw) 手動選取縣市／鄉鎮區／總價／坪數／房數等條件
2. 觀察網址列，每個 `key=value` 就是一個參數，例如：
   ```
   https://sale.591.com.tw/?regionid=4&sectionid=371&type=2&shape=2&price=0_750&area=$30_$50&pattern=2,3,4,5&houseage=0_5&parking=1,2
   ```

範例（涵蓋所有欄位）：

```python
{
    "regionid": 4,
    "sectionid": 371,
    "type": 2,
    "shape": 2,
    "price": "0_750",
    "area": "$30_$50",
    "pattern": "2,3,4,5",
    "houseage": "0_5",
    "parking": "1,2",
},
```

> ⚠️ 網頁手動選取偶有失效情況（面板已開合、確定按鈕存在於 DOM 但實際為隱藏/disabled 狀態，點擊後網址不更新）。此時改用 API 批次掃描效率更高，作法見[附錄](#附錄591-sectionid-批次掃描)。

#### 自動（`parse_url.py`）

```bash
python3 parse_url.py "https://sale.591.com.tw/?regionid=4&sectionid=371&type=2&shape=2&price=0_750&area=\$30_\$50&pattern=2,3,4,5&houseage=0_5&parking=1,2"
```

輸出：

```
判斷為【591】的網址，解析結果（可以直接複製貼進 config.py 的 HOUSE_591 清單裡）：

    {
        'regionid': 4,
        'sectionid': 371,
        'type': 2,
        'shape': 2,
        'price': '0_750',
        'area': '$30_$50',
        'pattern': '2,3,4,5',
        'houseage': '0_5',
        'parking': '1,2',
    },
```

> Shell 裡 `$` 是特殊字元，貼網址時記得跳脫成 `\$`（如上例），或整段用單引號包起來。

## 永慶房屋（YUNGCHING）

### 參數對照

| 參數 | 說明 | 範例的值 |
|---|---|---|
| `region` | 縣市-鄉鎮區（必填），格式 `"縣市-鄉鎮區"`，同縣市內支援逗號多選 | `"新竹市-東區"`，或 `"新竹市-東區,新竹市-北區"` |
| `min_rooms` | 房數門檻，程式讀「格局」文字判斷（必填備援機制） | `2`；不限就填 `None` |
| `price` | 總價(萬)，格式 `"最低-最高"`，開放區間可留空一端 | `"1000-"` = 1000萬以上；不需要請填 `None` |
| `type` | 型態 | `"電梯大廈"`、`"華廈"`、`"透天別墅"`；不需要請填 `None` |
| `rooms` | 房數（平台原生篩選，格式同總價） | `"2-2"` = 剛好2房；不需要請填 `None` |
| `area` | 建坪(坪)，格式同總價 | `"20-30"`；不需要請填 `None` |
| `house_age` | 屋齡(年)，格式同總價，開放區間可留空一端 | `"-5"` = 5年以下；不需要請填 `None` |
| `has_parking` | 車位 | `True`=有車位、`False`=無車位、`None`=不限 |

> ⚠️ **已知衝突**：實測發現同時設定 `type` + `area` + `has_parking` 這三個欄位時，永慶網站會回傳 404（其餘任意兩兩組合、或搭配 `price`／`rooms`／`house_age` 都正常）。研判是該網站路由比對的問題，不是本專案程式的錯。若同時用到這三個欄位，建議先手動執行 `python3 scraper.py` 確認有正常抓到資料，抓不到就拿掉其中一個試試看。

### 如何填 config

#### 手動

1. 至 [buy.yungching.com.tw](https://buy.yungching.com.tw) 手動選取地區、點「更多」開啟篩選面板逐一勾選
2. 觀察網址列，每個篩選條件會變成 `{值}_{參數}` 的路徑片段

範例（涵蓋所有欄位，`has_parking` 換成 `rooms`／`house_age` 搭配以避開上方的已知衝突）：

```python
{
    "region": "新竹市-東區",
    "min_rooms": 2,
    "price": "1000-",
    "type": "電梯大廈",
    "rooms": "2-2",
    "area": "20-30",
    "house_age": "-5",
    "has_parking": None,
},
```

對應網址：`https://buy.yungching.com.tw/list/新竹市-東區_c/1000-_price/電梯大廈_type/2-2_rmp/20-30_pin/-5_age/new_filter`

#### 自動（`parse_url.py`）

```bash
python3 parse_url.py "https://buy.yungching.com.tw/list/新竹市-東區_c/1000-_price/電梯大廈_type/2-2_rmp/20-30_pin/y_park/-5_age/new_filter"
```

輸出：

```
判斷為【永慶】的網址，解析結果（可以直接複製貼進 config.py 的 YUNGCHING 清單裡）：

    {
        'region': '新竹市-東區',
        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None
        'price': '1000-',
        'type': '電梯大廈',
        'rooms': '2-2',
        'area': '20-30',
        'house_age': '-5',
        'has_parking': True,
    },
```

> 這裡故意示範連 `has_parking` 都貼進去解析看看，工具照樣能正確解析出來（因為它只是照網址片段拆解，不會幫你檢查組合會不會 404）——但套用到 `config.py` 實際抓資料前，記得看一下上方的已知衝突提醒。

## 信義房屋（SINYI）

### 參數對照

| 參數 | 說明 | 範例的值 |
|---|---|---|
| `region` | 縣市（必填），格式 `"英文縣市名-city"`，**只到縣市層級，不支援鄉鎮區** | `"Hsinchu-city"` |
| `min_rooms` | 房數門檻，程式讀「格局」文字判斷（必填備援機制） | `2`；不限就填 `None` |
| `type` | 型態，拼音值，目前只驗證過 1 種代碼 | `"dalou"` = 大樓；不需要請填 `None` |
| `price` | 總價，格式 `"最低-up"`，代表最低金額以上 | `"1000-up"` = 1000萬以上；不需要請填 `None` |
| `rooms` | 房數（平台原生篩選），格式同總價 | `"2-up"` = 2房以上；不需要請填 `None` |
| `has_parking` | 車位。信義的車位篩選不是「值+後綴」格式，勾選「有車位」時網站會把全部子類型湊成一長串固定字串，設 `True` 時程式會直接套用那串固定值 | `True`=有車位、`False`=無車位、`None`=不限 |

> ⚠️ 信義沒辦法篩選到「東區」這麼細，只能篩到整個縣市（會混進其他區的物件），這是網站本身的限制。

### 如何填 config

#### 手動

1. 至 [www.sinyi.com.tw](https://www.sinyi.com.tw) 手動選取縣市、勾選型態/總價/房數等條件
2. 觀察網址列，每個篩選條件會變成 `{值}-{參數}` 的路徑片段

範例（涵蓋所有欄位）：

```python
{
    "region": "Hsinchu-city",
    "min_rooms": 2,
    "type": "dalou",
    "price": "1000-up",
    "rooms": "2-up",
    "has_parking": True,
},
```

對應網址：`https://www.sinyi.com.tw/buy/list/Hsinchu-city/dalou-type/1000-up-price/2-up-roomtotal/plane-auto-mix-mechanical-firstfloor-tower-other-yesparking/default-desc/1`

#### 自動（`parse_url.py`）

```bash
python3 parse_url.py "https://www.sinyi.com.tw/buy/list/Hsinchu-city/dalou-type/1000-up-price/2-up-roomtotal/plane-auto-mix-mechanical-firstfloor-tower-other-yesparking/default-desc/1"
```

輸出：

```
判斷為【信義】的網址，解析結果（可以直接複製貼進 config.py 的 SINYI 清單裡）：

    {
        'region': 'Hsinchu-city',
        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None
        'type': 'dalou',
        'price': '1000-up',
        'rooms': '2-up',
        'has_parking': True,
    },

⚠️ 提醒：信義只能篩到縣市層級，抓到的會是整個縣市範圍，不會只有你想要的區。
```

## 其餘補充

**GAS 版格式差異**：`Code.gs` 的欄位、值、用法跟 Python 版完全對應，只是語法不同——`None`→`null`、`True`/`False`→`true`/`false`、dict→物件（`{}`）、字串一樣用單引號。`ParseUrl.gs` 對應 `parse_url.py`，使用方式見 [README.md](README.md#部署google-apps-script)。

**跨縣市不能用逗號合併**：591 已實測 `regionid="4,1"` 只會回傳其中一個縣市的結果；永慶／信義的 `region` 理論上也一樣。跨縣市需求請在清單（`HOUSE_591`／`YUNGCHING`／`SINYI`）裡新增獨立的一組 target，一組一個縣市，各自查完程式會自動合併結果。

**`min_rooms` 是 per-target 設定**：永慶、信義的每一組 target 都要自己帶 `min_rooms`，不同組可以設不同門檻（591 不受此限，591 的房數走各自 target 的 `pattern`）。

**有了 `rooms` 為什麼還要 `min_rooms`**：兩者不是取代關係。`rooms` 沒設定時（`None`）程式完全不會套用房數篩選，這時候唯一的房數把關就是 `min_rooms`；就算 `rooms` 有設定，也只是讓網站先篩一次、減少要抓的頁數，`min_rooms` 之後還是會再判斷一次格局文字，兩層一起才保證最終結果一定符合房數門檻。所以 `min_rooms` 建議維持必填。

**網址解析工具讀不到某個參數怎麼辦**：`parse_url.py`／`ParseUrl.gs` 認得的參數就是上面各表列出的這些；網址裡如果有沒列到的片段，會被工具忽略（不會出現在輸出結果、也不會報錯），代表這個條件目前沒有對應的 config 欄位，可以到本文件最上面幾個表格對照，或直接忽略該條件、改用程式解析「格局」文字之類的既有機制間接達成。

## 附錄：591 `sectionid` 批次掃描

當網頁手動選取失效（見上方[591](#591house_591)的提醒）時，可改用 API 批次掃描直接列舉 `sectionid` 數字，效率遠高於逐一手動點選：

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

此範例掃描 `regionid=5`（新竹縣）的 `sectionid` 範圍 1～370，一次列舉出全部 13 個鄉鎮的代碼：竹北市 = `54`、湖口鄉 = `55`、新豐鄉 = `56`、新埔鎮 = `57`、關西鎮 = `58`、芎林鄉 = `59`、寶山鄉 = `60`、竹東鎮 = `61`、五峰鄉 = `62`、橫山鄉 = `63`、尖石鄉 = `64`、北埔鄉 = `65`、峨嵋鄉 = `66`。

> ⚠️ 掃描範圍建議抓寬一點（例如 1～500），`max_workers` 不宜設定過高，避免對來源伺服器造成過大負擔或被判定為異常流量。

**驗證方式**：以查得的 `regionid=5, sectionid=54` 執行 `python3 parse_url.py "https://sale.591.com.tw/?regionid=5&sectionid=54&shape=2&type=2&pattern=2,3,4,5"`，再實際呼叫 `house_591._fetch_target()` 確認能正確取得竹北市資料（驗證結果：31 筆，社區、地址、格局、總價皆正常）。
