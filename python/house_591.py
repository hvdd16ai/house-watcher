"""591房屋交易網(sale.591.com.tw)抓取邏輯"""
import time

import requests

import config

NAME = "591"
LABEL = "591"

API_URL = "https://bff-house.591.com.tw/v1/web/sale/list"
DETAIL_URL_TEMPLATE = "https://sale.591.com.tw/home/house/detail/{type}/{houseid}.html"
MAX_RETRIES = 10
RETRY_DELAY_SECONDS = 60


def fetch_page(filters, first_row):
    # 固定的技術性參數（跟篩選條件無關，591 API本身需要這些才能運作）
    params = {
        "category": 1,
        "shType": "list",
        "order": "posttime",
        "orderType": "desc",
        "firstRow": first_row,
    }
    # 把 config.py 裡設定的篩選條件加進去，值是 None 的就跳過（代表不套用這個條件）
    for key, value in filters.items():
        if value is not None:
            params[key] = value
    # section 是 sectionid 的技術性重複參數（591實際請求裡兩個都要）
    if "sectionid" in params:
        params["section"] = params["sectionid"]

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(
                API_URL, params=params, timeout=10,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            print(f"[591] 抓取失敗（firstRow={first_row}，第{attempt}/{MAX_RETRIES}次）: {e}")
        except ValueError as e:
            print(f"[591] 回應不是合法JSON（firstRow={first_row}，第{attempt}/{MAX_RETRIES}次）: {e}")
        else:
            if data.get("status") == 1:
                return data.get("data", {}).get("house_list", [])
            print(f"[591] API回應異常（firstRow={first_row}，第{attempt}/{MAX_RETRIES}次）: {data.get('msg')}")

        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_SECONDS)

    print(f"[591] firstRow={first_row} 重試{MAX_RETRIES}次仍失敗，放棄本次抓取。")
    return None


def _fetch_target(filters, seen, max_pages):
    """抓一組搜尋條件。回傳 (物件list, fetch_failed)。
    firstRow用「目前為止591實際回傳的總筆數」累加計算，不假設每頁固定幾筆。
    """
    all_items = []
    fetch_failed = False
    first_row = 0
    for _ in range(max_pages):
        items = fetch_page(filters, first_row)
        if items is None:
            fetch_failed = True
            break
        if not items:
            break
        first_row += len(items)

        valid_items = [item for item in items if item.get("houseid") is not None]
        if len(valid_items) != len(items):
            print(f"[591] 忽略 {len(items) - len(valid_items)} 筆缺少houseid的異常資料（firstRow={first_row}）")
        if not valid_items:
            break

        all_items.extend(valid_items)
        last_key = "591-" + str(valid_items[-1].get("houseid"))
        if last_key in seen:
            break
    return all_items, fetch_failed


def fetch_latest_listings(seen):
    """config.HOUSE_591是清單，每組搜尋條件各自抓完再合併。回傳 (物件list, fetch_failed)。"""
    max_pages = config.HOUSE_591_MAX_PAGES

    all_items = []
    fetch_failed = False
    for filters in config.HOUSE_591:
        items, failed = _fetch_target(filters, seen, max_pages)
        all_items.extend(items)
        if failed:
            fetch_failed = True
    return all_items, fetch_failed


def normalize(item):
    houseid = item.get("houseid")
    return {
        "source": NAME,
        "key": f"591-{houseid}",
        "title": item.get("title"),
        "community_name": item.get("community_name"),
        "address": item.get("address"),
        "room": item.get("room"),
        "area": item.get("area"),
        "price": item.get("price"),
        "show_price": item.get("showprice"),
        "unitprice": item.get("unitprice"),
        "houseage": item.get("houseage"),
        "floor": item.get("floor"),
        "has_carport": bool(item.get("has_carport")),
        "photo_url": item.get("photo_url"),
        "url": DETAIL_URL_TEMPLATE.format(type=item.get("type"), houseid=houseid),
        "posttime": item.get("posttime"),
    }
