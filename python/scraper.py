#!/usr/bin/env python3
"""合併591/永慶/信義的最新出售物件（搜尋地區/條件見config.py），找出還沒看過的物件。"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

import config
import house_591
import yungching
import sinyi

BASE_DIR = Path(__file__).resolve().parent
SEEN_PATH = BASE_DIR / "seen_houses.json"
TELEGRAM_SECRET_PATH = BASE_DIR / "telegram_secret.json"

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
TAIPEI_TZ = timezone(timedelta(hours=8))

# 每個來源模組都要有 NAME/LABEL/fetch_latest_listings(seen)/normalize(item)
SOURCES = [house_591, yungching, sinyi]
SOURCE_LABELS = {s.NAME: s.LABEL for s in SOURCES}


def load_telegram_secret():
    if not TELEGRAM_SECRET_PATH.exists():
        return None
    with open(TELEGRAM_SECRET_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_seen_houses():
    """讀取seen_houses.json。舊資料的key沒有來源前綴，自動補上"591-"（因為舊資料都只來自591）。"""
    if not SEEN_PATH.exists():
        return {}
    with open(SEEN_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    def add_prefix(key):
        if key.startswith("591-") or key.startswith("yc-") or key.startswith("sinyi-"):
            return key
        return f"591-{key}"

    migrated = {}
    for key, record in raw.items():
        record["duplicate_of"] = [add_prefix(k) for k in record.get("duplicate_of", [])]
        migrated[add_prefix(key)] = record
    return migrated


def save_seen_houses(seen):
    with open(SEEN_PATH, "w", encoding="utf-8") as f:
        json.dump(seen, f, ensure_ascii=False, indent=2)


def find_new_listings(items, seen):
    new_items = []
    seen_in_batch = set()
    for item in items:
        key = item["key"]
        if key not in seen and key not in seen_in_batch:
            new_items.append(item)
            seen_in_batch.add(key)
    return new_items


def content_key(item):
    """用地址+坪數+格局+總價當作「同一戶房子」的判斷依據"""
    return (item.get("address"), item.get("area"), item.get("room"), item.get("price"))


def build_content_index(seen):
    index = {}
    for key, record in seen.items():
        content = content_key(record)
        index.setdefault(content, []).append(key)
    return index


def find_duplicates(new_items, seen):
    """回傳 {key: [內容相同的其他key,...]}，同時涵蓋這批次內部互相重複的情況"""
    index = build_content_index(seen)
    duplicates_map = {}
    for item in new_items:
        key = item["key"]
        content = content_key(item)
        existing = index.get(content, [])
        if existing:
            duplicates_map[key] = list(existing)
        index.setdefault(content, []).append(key)
    return duplicates_map


def record_new_listings(seen, new_items, duplicates_map):
    now = datetime.now(TAIPEI_TZ).isoformat()
    for item in new_items:
        key = item["key"]
        seen[key] = {
            "source": item.get("source"),
            "title": item.get("title"),
            "community_name": item.get("community_name"),
            "address": item.get("address"),
            "room": item.get("room"),
            "area": item.get("area"),
            "price": item.get("price"),
            "unitprice": item.get("unitprice"),
            "houseage": item.get("houseage"),
            "floor": item.get("floor"),
            "has_carport": bool(item.get("has_carport")),
            "photo_url": item.get("photo_url"),
            "url": item.get("url"),
            "posttime": item.get("posttime"),
            "first_seen": now,
            "duplicate_of": duplicates_map.get(key, []),
        }


def prune_old(seen, days):
    cutoff = datetime.now(TAIPEI_TZ) - timedelta(days=days)
    kept = {}
    for houseid, record in seen.items():
        first_seen = record.get("first_seen")
        try:
            seen_time = datetime.fromisoformat(first_seen)
        except (TypeError, ValueError):
            kept[houseid] = record
            continue
        if seen_time >= cutoff:
            kept[houseid] = record
    return kept


def print_new_listings(new_items, duplicates_map):
    if not new_items:
        print("這次沒有新物件。")
        return
    print(f"發現 {len(new_items)} 筆新物件：\n")
    for item in new_items:
        key = item["key"]
        label = SOURCE_LABELS.get(item.get("source"), item.get("source"))
        name = item.get("community_name") or item.get("title")
        print(f"【{label}】【{name}】")
        print(f"  地址：{item.get('address')}")
        print(f"  格局：{item.get('room')}　坪數：{item.get('area')}坪　屋齡：{item.get('houseage')}年")
        print(f"  總價：{item.get('show_price')}萬　車位：{'有' if item.get('has_carport') else '無'}")
        print(f"  網址：{item.get('url')}")
        dup = duplicates_map.get(key)
        if dup:
            print(f"  ⚠️ 疑似重複刊登，已有其他仲介刊登過（key: {', '.join(dup)}）")
        print()


def build_telegram_caption(item, duplicate_of=None):
    label = SOURCE_LABELS.get(item.get("source"), item.get("source"))
    name = item.get("community_name") or item.get("title")
    lines = [
        f"<b>[{label}] {name}</b>",
        f"地址：{item.get('address')}",
        f"格局：{item.get('room')}　坪數：{item.get('area')}坪　屋齡：{item.get('houseage')}年",
        f"總價：{item.get('show_price')}萬　車位：{'有' if item.get('has_carport') else '無'}",
        item.get("url"),
    ]
    if duplicate_of:
        lines.append(f"⚠️ 疑似重複刊登，已有其他仲介刊登過（key: {', '.join(duplicate_of)}）")
    return "\n".join(lines)


def send_telegram_message(bot_token, chat_id, text):
    url = TELEGRAM_API.format(token=bot_token, method="sendMessage")
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    try:
        resp = requests.post(url, data=payload, timeout=10)
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        print(f"Telegram文字訊息傳送失敗: {e}")
        return False
    if not data.get("ok"):
        print(f"Telegram文字訊息傳送失敗: {data}")
        return False
    return True


def send_telegram_photo(bot_token, chat_id, photo_url, caption):
    url = TELEGRAM_API.format(token=bot_token, method="sendPhoto")
    payload = {"chat_id": chat_id, "photo": photo_url, "caption": caption, "parse_mode": "HTML"}
    try:
        resp = requests.post(url, data=payload, timeout=10)
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        print(f"Telegram圖片傳送失敗: {e}")
        return False
    if not data.get("ok"):
        print(f"Telegram圖片傳送失敗: {data}")
        return False
    return True


def notify_new_listings(new_items, duplicates_map, telegram_secret):
    if not telegram_secret:
        print("找不到 telegram_secret.json，略過Telegram通知。")
        return
    bot_token = telegram_secret["bot_token"]
    chat_id = telegram_secret["chat_id"]

    for item in new_items:
        duplicate_of = duplicates_map.get(item["key"])
        if not config.NOTIFY_DUPLICATES and duplicate_of:
            continue  # 疑似重複刊登，不發通知（仍會記錄進seen_houses.json）

        caption = build_telegram_caption(item, duplicate_of)
        photo_url = item.get("photo_url")
        sent = False
        if photo_url:
            sent = send_telegram_photo(bot_token, chat_id, photo_url, caption)
        if not sent:
            send_telegram_message(bot_token, chat_id, caption)


def check_config():
    """檢查ENABLED_SOURCES的key有沒有跟每個來源模組的NAME對上，避免打錯字被靜靜當成關閉。"""
    for source in SOURCES:
        if source.NAME not in config.ENABLED_SOURCES:
            print(
                f"⚠️ config.py 的 ENABLED_SOURCES 沒有 \"{source.NAME}\" 這個key，"
                f"{source.LABEL} 會被當成關閉。如果你想抓這個來源，檢查是不是打錯字。"
            )


def main():
    check_config()

    seen = load_seen_houses()
    all_items = []
    any_failure = False

    for source in SOURCES:
        if not config.ENABLED_SOURCES.get(source.NAME, False):
            continue
        items, failed = source.fetch_latest_listings(seen)
        if failed:
            any_failure = True
            print(f"⚠️ [{source.LABEL}] 本次抓取未完全成功，部分頁面抓取失敗，結果可能不完整。")
        all_items.extend(source.normalize(it) for it in items)

    if not all_items and any_failure:
        print("⚠️ 本次所有來源都抓取失敗，未取得任何資料，本次不更新 seen_houses.json，等下次排程重試。")
        return

    new_items = find_new_listings(all_items, seen)
    duplicates_map = find_duplicates(new_items, seen)

    print_new_listings(new_items, duplicates_map)

    telegram_secret = load_telegram_secret()
    notify_new_listings(new_items, duplicates_map, telegram_secret)

    record_new_listings(seen, new_items, duplicates_map)
    seen = prune_old(seen, config.PRUNE_DAYS)
    save_seen_houses(seen)


if __name__ == "__main__":
    main()
