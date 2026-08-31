"""591/永慶/信義抓取設定。不想套用某個篩選條件，把值設成 None，或整行註解掉都可以。"""

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

# 已經看過的物件如果降價了，要不要另外發一則「降價提醒」的Telegram通知(跟一般新物件通知分開)。
# price一律都會更新進seen_houses.json，這個設定只影響要不要「推播」，邏輯跟NOTIFY_DUPLICATES一樣。
# 注意：只有這次剛好又被抓到的物件才驗得到降價(通常是降價後排序被往前推、剛好在抓取範圍內)，
# 不保證100%抓到每一次降價。
NOTIFY_PRICE_DROPS = True

# 排程正常執行、但這次完全沒有新物件也沒有降價時，要不要定期發一則「還活著」的心跳通知，
# 避免排程默默壞掉卻不知道。HEARTBEAT_HOURS是最短間隔(小時)，避免每次執行都發。
HEARTBEAT_ENABLED = False
HEARTBEAT_HOURS = 24

# 591房屋交易網(sale.591.com.tw)設定。HOUSE_591是清單，每一個dict是一組獨立的搜尋條件，會各自查完再合併結果。
# 想同時搜多個「跨縣市」目標，在清單裡多加一組dict即可（跨縣市的逗號字串實測不可靠，見CONFIG_DETAIL.md）。
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

        # 屋齡(年)，格式 "最低_最高"，例如 "0_5" = 5年以下、"5_10" = 5~10年。不限就設 None
        "houseage": None,

        # 車位類型，逗號分隔數字，目前只驗證過 1=平面式、2=機械式（其他代碼未測，要用再自己到網站上點選比對）。不限就設 None
        "parking": None,
    },
    # 想再搜別的縣市，複製一組上面的dict、改regionid/sectionid即可，例如：
    # {"regionid": 1, "sectionid": 5, "type": 2, "shape": 2, "price": None, "area": None, "pattern": "2,3,4,5", "houseage": None, "parking": None},  # 台北市大安區
]

HOUSE_591_MAX_PAGES = 5  # 最多往前抓幾頁（用「早停」邏輯，通常用不到這麼多）

# 永慶房屋(buy.yungching.com.tw)設定。YUNGCHING是清單，每個dict是一組獨立的地區，各自查完再合併。
# min_rooms是程式讀「格局」文字自己判斷房數(不限就設 None)，跟下面的 rooms(平台原生篩選)是兩回事、
# 互不影響：min_rooms一定會套用，rooms只是多加一個讓網站先篩、可以少抓幾頁的優化，不設也沒關係。
YUNGCHING = [
    {
        # 格式："縣市-鄉鎮區"，中間用「-」連接。同縣市內支援多選，逗號分隔多組，
        # 例如 "新竹市-東區,新竹市-北區" 同時搜兩區（實測過）。跨縣市請用清單多加一組，不要塞逗號。
        "region": "新竹市-東區",
        "min_rooms": 2,

        # 以下是永慶網址上的原生篩選條件，格式對照 CONFIG_DETAIL.md 的「永慶房屋參數對照」表，
        # 不用可以全部留 None，不影響其他設定。
        "price": None,        # 總價(萬)，格式 "最低-最高"，開放區間可留空一端，例如 "1000-" = 1000萬以上
        "type": None,         # 型態，例如 "電梯大廈"、"華廈"、"透天別墅"
        "rooms": None,        # 房數，格式同總價，例如 "2-2" = 剛好2房（跟上面的min_rooms是兩回事，見上方說明）
        "area": None,         # 建坪(坪)，格式同總價，例如 "20-30"
        "has_parking": None,  # 車位：True=有車位、False=無車位、None=不限

        # ⚠️ 已知衝突：實測發現type+area+has_parking三個「同時」設定時，永慶網站會回傳404
        # （其餘任意組合都正常，研判是該網站路由比對的問題）。三個都要用的話，改完記得
        # 手動跑一次 scraper.py 確認有抓到資料，抓不到就拿掉其中一個試試看。詳見 CONFIG_DETAIL.md。
    },
    # {"region": "台北市-大安區", "min_rooms": 2, "price": None, "type": None, "rooms": None, "area": None, "has_parking": None},
]

YUNGCHING_MAX_PAGES = 5

# 信義房屋(www.sinyi.com.tw)設定。SINYI是清單，每個dict是一組獨立的縣市，各自查完再合併。
# 注意：信義房屋沒辦法篩選到「東區」這麼細，只能篩到整個新竹市（會混進北區/香山區）。
# min_rooms是程式讀「格局」文字自己判斷房數(不限就設 None)，跟下面的 rooms(平台原生篩選)是兩回事，
# 邏輯同永慶，見上面 YUNGCHING 的說明。
SINYI = [
    {
        "region": "Hsinchu-city",
        "min_rooms": 2,

        # 以下是信義網址上的原生篩選條件，格式對照 CONFIG_DETAIL.md 的「信義房屋參數對照」表，
        # 不用可以全部留 None，不影響其他設定。
        "type": None,         # 型態，拼音值，目前只驗證過 "dalou"(大樓)，其他型態代碼未確認
        "price": None,        # 總價，格式 "最低-up"，例如 "1000-up" = 1000萬以上
        "rooms": None,        # 房數，格式同總價，例如 "2-up" = 2房以上（跟上面的min_rooms是兩回事，見上方說明）
        "has_parking": None,  # 車位：True=有車位、False=無車位、None=不限
    },
    # {"region": "Taipei-city", "min_rooms": 2, "type": None, "price": None, "rooms": None, "has_parking": None},
]

SINYI_MAX_PAGES = 5

PRUNE_DAYS = 180  # seen_houses.json 保留紀錄的天數，超過就清掉
