"""永慶房屋(buy.yungching.com.tw)抓取邏輯。
永慶是伺服器端渲染(SSR)，原始HTML就有完整資料，不用碰它有加密保護的內部API，
直接用BeautifulSoup解析HTML即可。
"""
import re
import time

import requests
from bs4 import BeautifulSoup

import config

NAME = "yc"
LABEL = "永慶"

BASE_URL = "https://buy.yungching.com.tw"

MAX_RETRIES = 10
RETRY_DELAY_SECONDS = 60

# (target dict的key, 網址片段後綴)，對照 SITES_REFERENCE.md 的「永慶房屋參數對照」表
FILTER_PARAM_MAP = [
    ("price", "_price"),
    ("type", "_type"),
    ("rooms", "_rmp"),
    ("area", "_pin"),
    ("house_age", "_age"),
]


def _build_filter_segments(target):
    """依target dict組出永慶網址的篩選路徑片段（不含地區、不含new_filter）。沒設定的欄位不會出現在網址裡。"""
    segments = [f"{target[key]}{suffix}" for key, suffix in FILTER_PARAM_MAP if target.get(key)]
    has_parking = target.get("has_parking")
    if has_parking is not None:
        segments.append(("y" if has_parking else "n") + "_park")
    return segments


def fetch_page(region, page, filter_segments=None):
    """抓一頁(依「新上架」排序)，回傳解析後的物件list；失敗重試後仍失敗回傳None。"""
    path = "/".join([f"{region}_c"] + (filter_segments or []) + ["new_filter"])
    url = f"{BASE_URL}/list/{path}"
    params = {"pg": page}
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"[永慶] 抓取失敗（page={page}，第{attempt}/{MAX_RETRIES}次）: {e}")
        else:
            return parse_listings(resp.text)
        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_SECONDS)
    print(f"[永慶] page={page} 重試{MAX_RETRIES}次仍失敗，放棄本次抓取。")
    return None


def _text_of(card, cls):
    el = card.select_one("." + cls)
    return el.get_text(strip=True) if el else None


def _extract_houseage(card):
    """屋齡那個span沒有class，用「在case-info裡、沒有class、文字符合X年格式」找出來。"""
    case_info = card.select_one(".case-info")
    if not case_info:
        return None
    for span in case_info.find_all("span", recursive=False):
        if not span.get("class"):
            text = span.get_text(strip=True)
            if re.match(r"^[\d.]+年$|^--年$", text):
                return text.rstrip("年")
    return None


def parse_listings(html):
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select('a.link[href^="house/"]')
    items = []
    seen_in_page = set()

    for card in cards:
        href = card.get("href")
        house_id = href.split("/")[-1]
        if house_id in seen_in_page:
            continue  # 同一頁裡置頂物件有時會重複出現一次，跳過
        seen_in_page.add(house_id)

        address = _text_of(card, "address")
        if address:
            address = re.sub(r"^[一-鿿]+[市縣][一-鿿]+[區鄉鎮市]", "", address)

        area_text = _text_of(card, "regArea") or ""
        area_match = re.search(r"[\d.]+", area_text)
        area = float(area_match.group()) if area_match else None

        price_text = (_text_of(card, "price") or "").replace(",", "")
        price = int(price_text) if price_text.isdigit() else None

        room_text = _text_of(card, "room") or ""
        room_match = re.match(r"(\d+)房", room_text)
        room_count = int(room_match.group(1)) if room_match else None

        car_text = _text_of(card, "car")
        has_carport = bool(car_text) and "無" not in car_text

        img = card.select_one("img")
        photo_url = img.get("src") if img else None

        items.append({
            "houseid": house_id,
            "title": _text_of(card, "caseName"),
            "community_name": _text_of(card, "community"),
            "address": address,
            "room": room_text,
            "room_count": room_count,
            "area": area,
            "price": price,
            "houseage": _extract_houseage(card),
            "floor": _text_of(card, "floor"),
            "has_carport": has_carport,
            "photo_url": photo_url,
            "url": f"{BASE_URL}/{href}",
        })

    return items


def _fetch_target(region, seen, max_pages, min_rooms, filter_segments=None):
    """抓一組地區，依「新上架」排序抓前幾頁，遇到已看過的物件就早停。回傳 (物件list, fetch_failed)。
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

        last_key = "yc-" + items[-1]["houseid"]

        qualifying_items = items
        if min_rooms is not None:
            qualifying_items = [it for it in items if it.get("room_count") is not None and it["room_count"] >= min_rooms]

        all_items.extend(qualifying_items)

        if last_key in seen:
            break
    return all_items, fetch_failed


def fetch_latest_listings(seen):
    """config.YUNGCHING是清單，每組地區各自抓完再合併。回傳 (物件list, fetch_failed)。
    每組target只讀自己dict裡的設定，不會共用全域值。
    """
    max_pages = config.YUNGCHING_MAX_PAGES

    all_items = []
    fetch_failed = False
    for target in config.YUNGCHING:
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
        "key": f"yc-{houseid}",
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
