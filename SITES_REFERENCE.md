# 各網站搜尋參數對照表

這份是「已經實測驗證過」的參數值，換地區/條件時先查這裡。沒有的值要自己重新測，測完記得回來補這份表。

---

## 591 (`config.py` 的 `HOUSE_591`)

用數字代碼，代碼本身查不到公開列表，都是**手動在網站上選過、看網址列反查出來的**。

| 參數 | 說明 | 已驗證的值 |
|---|---|---|
| `regionid` | 縣市 | 新竹市 = `4`、新竹縣 = `5` |
| `sectionid` | 鄉鎮/區 | 新竹市：東區 = `371`、北區 = `372`（香山區未測）。新竹縣：竹北市 = `54`、湖口鄉 = `55`、新豐鄉 = `56`、新埔鎮 = `57`、關西鎮 = `58`、芎林鄉 = `59`、寶山鄉 = `60`、竹東鎮 = `61`、五峰鄉 = `62`、橫山鄉 = `63`、尖石鄉 = `64`、北埔鄉 = `65`、峨嵋鄉 = `66` |
| `type` | 類型 | 住宅 = `2` |
| `shape` | 型態 | 電梯大樓 = `2`（別墅/透天厝/公寓/華廈代碼未測） |
| `price` | 總價區間(萬) | 格式 `"最低_最高"`，例：`"0_750"` |
| `area` | 坪數區間 | 格式 `"$最低_$最高"`，例：`"$30_$50"`（有`$`符號） |
| `pattern` | 房數 | 逗號分隔多選，`"2,3,4,5"` = 2房以上 |
| `label` | 勾選條件 | 逗號分隔ID，只知道組合結果`"7,9,4,3,6,2,12,16"`，未拆解個別ID意義 |

**`sectionid` 支援多選**：逗號分隔多個代碼即可，例如 `"371,372"` = 東區+北區同時搜（實測過，total數會合併兩區、結果混合出現）。`regionid` 理論上應該也支援，但沒實測過。

**要換地區/新增代碼，怎麼查：**
1. 去 [sale.591.com.tw](https://sale.591.com.tw) 手動選你要的縣市/鄉鎮區/其他篩選條件
2. 看網址列，`regionid=`、`sectionid=` 後面的數字就是代碼
3. 其他篩選條件(總價/坪數/房數)點選後也會直接反映在網址上

**⚠️ 網頁手動選有時會失效，這時改用 API 批次掃描比較快**：實際查「新竹縣竹北市」的 `sectionid` 時，在瀏覽器上勾選鄉鎮checkbox、點「確定」按鈕都正常，但畫面上的網址列**沒有跟著更新**（面板開合狀態跟預期不一致，「確定」按鈕在DOM裡但實際上是隱藏/disabled的，點了沒反應）。與其一直在瀏覽器裡除錯，改成直接對 API **批次掃描** `sectionid` 數字比逐一手動點快很多：

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
掃 `regionid=5`(新竹縣) 的 1~370，一次就把 13 個鄉鎮的 `sectionid` 全部掃出來（見上表），比一個一個去網頁上點快非常多。**掃描範圍抓大一點(例如1~500)、`max_workers`不要開太高(避免被當成攻擊)**，掃完記得把結果補進這份表。

**驗證范例**：用查到的 `regionid=5, sectionid=54` 跑 `python3 parse_url.py "https://sale.591.com.tw/?regionid=5&sectionid=54&shape=2&type=2&pattern=2,3,4,5"`，再用 `house_591._fetch_target()` 實際打一次 API 確認真的抓得到竹北市的資料(結果：31筆，社區、地址、格局、總價都正常)。

---

## 永慶房屋 (`config.py` 的 `YUNGCHING`)

用**中文地名直接組合**，不需要查代碼表，格式固定：

```
"縣市-鄉鎮區"    例："新竹市-東區"、"台北市-大安區"、"新竹縣-竹北市"
```

只要中文縣市/鄉鎮區名稱打對就能用，這是唯一三個網站裡不用查代碼表的。

**支援多選**：逗號分隔多組「縣市-鄉鎮區」，例如 `"新竹市-東區,新竹市-北區"`（實測過，結果混合出現兩區地址）。

房數(2房以上)沒有用永慶自己的篩選按鈕，是程式自己讀「格局」文字判斷（每組target dict裡的`min_rooms`），因為實測永慶的房數篩選按鈕格式比較複雜、還沒抓出穩定規則。

---

## 信義房屋 (`config.py` 的 `SINYI`)

用**英文縣市名 + `-city`**，只做到縣市層級，**不支援鄉鎮區篩選**（信義系統本身把整個新竹市當一個地區代碼，沒有拆到東區/北區）。

| 縣市 | 已驗證的值 |
|---|---|
| 新竹市 | `Hsinchu-city` |
| 台北市 | `Taipei-city` |

**要換縣市，怎麼查：**
1. 去 [www.sinyi.com.tw](https://www.sinyi.com.tw) 首頁的地區選單找你要的縣市
2. 點下去看網址列 `/buy/list/{英文名}-city` 的英文名部分
3. ⚠️ 選好後**沒辦法再篩到鄉鎮區**，抓到的會是整個縣市範圍，程式會全部收下、由你自己看地址判斷

**多選縣市**：格式上可能也支援逗號分隔，但還沒實測過，要用的話要先測試確認。

房數(2房以上)一樣是程式讀「格局」文字判斷（每組target dict裡的`min_rooms`），信義沒有伺服器端房數篩選。

---

## `min_rooms` 是per-target設定，不是共用值

永慶(`YUNGCHING`)、信義(`SINYI`)的每一組 target dict 都要自己帶 `min_rooms`，不同組可以設不同門檻（591不受影響，591走自己target dict裡的`pattern`篩選）。詳見 `config.py` 裡的範例註解。

---

## 手動從網址找出設定值(不靠程式)

`parse_url.py`(本機)/`ParseUrl.gs`(Apps Script) 壞掉、或要支援全新的第四個網站時，可以照這個流程自己讀網址：

### 591
範例網址：
```
https://sale.591.com.tw/?regionid=4&sectionid=371&shape=2&type=2&pattern=2,3,4,5&price=0_750
```
1. 網址 `?` 後面每個 `key=value`、用 `&` 分開的都是一個參數
2. 只挑我們關心的幾個：`regionid`、`sectionid`、`type`、`shape`、`price`、`area`、`pattern`、`label`（其他像`firstRow`、`shType`、`order`是程式內部技術參數，不用管）
3. 網址裡沒出現的參數，代表「不限」，`HOUSE_591` 裡要填 `None`
4. 對照上面這個例子 → `{"regionid": 4, "sectionid": 371, "type": 2, "shape": 2, "price": "0_750", "area": None, "pattern": "2,3,4,5", "label": None}`

### 永慶
範例網址：
```
https://buy.yungching.com.tw/list/新竹市-東區_c/new_filter
```
1. 找 `/list/` 跟 `_c/` 中間那一段文字，那就是 `region` 的值
2. 這個例子中間是 `新竹市-東區` → `{"region": "新竹市-東區", "min_rooms": 2}`
3. 如果網址是編碼過的亂碼(`%E6%96%B0...`)，貼到瀏覽器網址列按 Enter 通常會自動變回中文，或用任何「URL解碼」工具轉一下

### 信義
範例網址：
```
https://www.sinyi.com.tw/buy/list/Hsinchu-city/default-desc/1
```
1. 找 `/buy/list/` 後面、下一個 `/` 之前的那一段，那就是 `region` 的值
2. 這個例子是 `Hsinchu-city` → `{"region": "Hsinchu-city", "min_rooms": 2}`
3. 記得信義只能到縣市層級，選了鄉鎮區也沒用，網址不會反映出來
