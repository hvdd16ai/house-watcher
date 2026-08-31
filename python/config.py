"""591抓取設定。不想套用某個篩選條件，把值設成 None，或整行註解掉都可以。"""

# 要不要抓某個網站，改 True/False 就好，不用碰程式碼
ENABLED_SOURCES = {
    "591": True,
    "yc": True,
    "sinyi": True,
}

# 疑似重複刊登(同一戶被不同仲介刊登)的物件要不要發Telegram通知。
# False(預設)：不通知，但還是會記錄進seen_houses.json、標記duplicate_of。
# True：連疑似重複的也通知(訊息裡一樣看不到重複標記，只是拿掉notify階段的過濾)。
NOTIFY_DUPLICATES = False

# 591房屋交易網(sale.591.com.tw)設定。HOUSE_591是清單，每一個dict是一組獨立的搜尋條件，會各自查完再合併結果。
# 想同時搜多個「跨縣市」目標，在清單裡多加一組dict即可（跨縣市的逗號字串實測不可靠，見SITES_REFERENCE.md）。
# 同縣市內的多區則可以直接用sectionid逗號分隔（見下方註解）。
HOUSE_591 = [
    {
        # 縣市代碼（必填）新竹市=4
        "regionid": 4,

        # 鄉鎮/區代碼（必填）東區=371、北區=372。同縣市內支援多選，逗號分隔字串，
        # 例如 "371,372" 同時搜東區+北區（實測過）
        "sectionid": 371,

        # 類型：住宅=2（其他代碼未實測）
        "type": 2,

        # 型態：電梯大樓=2（別墅/透天厝/公寓/華廈的代碼還沒實測，要用再測）
        "shape": 2,

        # 總價區間(萬)，格式 "最低_最高"，例如 "0_750"。不限就設 None
        "price": None,

        # 坪數區間，格式 "$最低_$最高"（591這個API的格式真的有$符號），例如 "$30_$50"。不限就設 None
        "area": None,

        # 房數，逗號分隔多選，例如 "2,3,4,5" 代表2房以上（勾選2/3/4/5房及以上）。不限就設 None
        "pattern": "2,3,4,5",

        # 勾選條件（含車位/有陽台/近捷運站...），逗號分隔的ID字串。
        # 目前只抓到部分組合、還沒完全拆解每個ID對應哪個條件，先設 None，之後要用再細抓。
        "label": None,
    },
    # 想再搜別的縣市，複製一組上面的dict、改regionid/sectionid即可，例如：
    # {"regionid": 1, "sectionid": 47, "type": 2, "shape": 2, "price": None, "area": None, "pattern": "2,3,4,5", "label": None},
]

HOUSE_591_MAX_PAGES = 5  # 最多往前抓幾頁（用「早停」邏輯，通常用不到這麼多）

# 永慶房屋(buy.yungching.com.tw)設定。YUNGCHING是清單，每個dict是一組獨立的地區，各自查完再合併。
# 永慶沒有591那種伺服器端房數篩選按鈕可用（實測591的pattern有小機率誤殺，這裡改用
# 「格局」文字自己判斷），每一組地區都要自己設 min_rooms（不限就設 None），不同組可以設不同門檻。
YUNGCHING = [
    {
        # 格式："縣市-鄉鎮區"，中間用「-」連接。同縣市內支援多選，逗號分隔多組，
        # 例如 "新竹市-東區,新竹市-北區" 同時搜兩區（實測過）。跨縣市請用清單多加一組，不要塞逗號。
        "region": "新竹市-東區",
        "min_rooms": 2,
    },
    # {"region": "台北市-大安區", "min_rooms": 2},
]

YUNGCHING_MAX_PAGES = 5

# 信義房屋(www.sinyi.com.tw)設定。SINYI是清單，每個dict是一組獨立的縣市，各自查完再合併。
# 注意：信義房屋沒辦法篩選到「東區」這麼細，只能篩到整個新竹市（會混進北區/香山區）。
# 一樣沒有伺服器端房數篩選，每一組縣市都要自己設 min_rooms（不限就設 None）。
SINYI = [
    {
        "region": "Hsinchu-city",
        "min_rooms": 2,
    },
    # {"region": "Taipei-city", "min_rooms": 2},
]

SINYI_MAX_PAGES = 5

PRUNE_DAYS = 180  # seen_houses.json 保留紀錄的天數，超過就清掉
