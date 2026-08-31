"""信義房屋(www.sinyi.com.tw)抓取邏輯。
信義房屋是Next.js SSR網站，資料乾淨地嵌在 __NEXT_DATA__ 這個JSON裡，
不需要解析HTML標籤，直接從JSON拿資料即可(比永慶還單純)。

注意：信義房屋沒辦法篩選到「新竹市東區」這麼細，只能篩到整個新竹市，
會混進北區/香山區的物件，這是網站本身的限制(它把整個新竹市當一個地區代碼)。
另外它的排序參數(URL上的xxx-desc)實測不影響結果，抓到的順序不保證是新到舊，
但不影響「有沒有抓過」的去重判斷，只是「翻頁翻多深」比較沒把握。
"""
import json
import re
import time

import requests

import config

NAME = "sinyi"
LABEL = "信義"

BASE_URL = "https://www.sinyi.com.tw"

MAX_RETRIES = 10
RETRY_DELAY_SECONDS = 60

# (target dict的key, 網址片段後綴)，對照 CONFIG_DETAIL.md 的「信義房屋參數對照」表
FILTER_PARAM_MAP = [
    ("type", "-type"),
    ("price", "-price"),
    ("rooms", "-roomtotal"),
    ("zip", "-zip"),
]


def _build_filter_segments(target):
    """依target dict組出信義網址的篩選路徑片段（不含地區、不含排序/頁碼）。沒設定的欄位不會出現在網址裡。"""
    return [f"{target[key]}{suffix}" for key, suffix in FILTER_PARAM_MAP if target.get(key)]


def fetch_page(region, page, filter_segments=None):
    path = "/".join([region] + (filter_segments or []) + ["default-desc", str(page)])
    url = f"{BASE_URL}/buy/list/{path}"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"[信義] 抓取失敗（page={page}，第{attempt}/{MAX_RETRIES}次）: {e}")
        else:
            return parse_listings(resp.text)
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_SECONDS)
    print(f"[信義] page={page} 重試{MAX_RETRIES}次仍失敗，放棄本次抓取。")
    return None


def parse_listings(html):
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        return []
    data = json.loads(m.group(1))
    try:
        raw_list = data["props"]["initialReduxState"]["buyReducer"]["list"]
    except (KeyError, TypeError):
        return []

    items = []
    for it in raw_list:
        house_no = it.get("houseNo")
        if not house_no:
            continue

        address = it.get("address") or ""
        address = re.sub(r"^[一-鿿]+[市縣]", "", address)

        room_text = it.get("layout") or ""
        room_match = re.match(r"(\d+)房", room_text)
        room_count = int(room_match.group(1)) if room_match else None

        houseage_text = it.get("age") or ""
        houseage = houseage_text.rstrip("年") if houseage_text else None

        floor = it.get("floor")
        totalfloor = it.get("totalfloor")
        floor_display = f"{floor}/{totalfloor}F" if floor and totalfloor else None

        photo_url = it.get("largeImage") or ((it.get("image") or [None])[0])

        items.append({
            "houseid": house_no,
            "title": it.get("name"),
            "community_name": it.get("commName"),
            "address": address,
            "room": room_text,
            "room_count": room_count,
            "area": it.get("areaBuilding"),
            "price": it.get("totalPrice"),
            "houseage": houseage,
            "floor": floor_display,
            "has_carport": bool(it.get("isParking")),
            "photo_url": photo_url,
            "url": it.get("shareURL") or f"{BASE_URL}/buy/house/{house_no}",
        })
    return items


def _fetch_target(region, seen, max_pages, min_rooms, filter_segments=None):
    """抓一組縣市。回傳 (物件list, fetch_failed)。region沒有區級篩選，只到縣市層級。
    頁碼式分頁不需要知道每頁固定幾筆，抓到空頁就代表到底了。
    """
    all_items = []
    fetch_failed = False
    for page in range(1, max_pages + 1):
        items = fetch_page(region, page, filter_segments)
        if items is None:
            fetch_failed = True
            break
        if not items:
            break

        last_key = "sinyi-" + items[-1]["houseid"]

        qualifying_items = items
        if min_rooms is not None:
            qualifying_items = [it for it in items if it.get("room_count") is not None and it["room_count"] >= min_rooms]

        all_items.extend(qualifying_items)

        if last_key in seen:
            break
    return all_items, fetch_failed


def fetch_latest_listings(seen):
    """config.SINYI是清單，每組縣市各自抓完再合併。回傳 (物件list, fetch_failed)。
    每組target只讀自己dict裡的設定，不會共用全域值。
    """
    max_pages = config.SINYI_MAX_PAGES

    all_items = []
    fetch_failed = False
    for target in config.SINYI:
        filter_segments = _build_filter_segments(target)
        items, failed = _fetch_target(target["region"], seen, max_pages, target.get("min_rooms"), filter_segments)
        all_items.extend(items)
        if failed:
            fetch_failed = True
    return all_items, fetch_failed


def normalize(item):
    houseid = item.get("houseid")
    price = item.get("price")
    return {
        "source": NAME,
        "key": f"sinyi-{houseid}",
        "title": item.get("title"),
        "community_name": item.get("community_name"),
        "address": item.get("address"),
        "room": item.get("room"),
        "area": item.get("area"),
        "price": price,
        "show_price": f"{price:,}" if price is not None else None,
        "unitprice": None,
        "houseage": item.get("houseage"),
        "floor": item.get("floor"),
        "has_carport": bool(item.get("has_carport")),
        "photo_url": item.get("photo_url"),
        "url": item.get("url"),
        "posttime": None,
    }
