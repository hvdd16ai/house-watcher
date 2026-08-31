#!/usr/bin/env python3
"""貼上591/永慶/信義任一個網站的網址，自動判斷是哪個網站，
轉成對應的 config.py 格式，不用自己查代碼。

用法：
    python3 parse_url.py "<591/永慶/信義的網址>"
"""
import re
import sys
from urllib.parse import parse_qs, unquote, urlparse


def parse_591(url):
    query = urlparse(url).query
    params = parse_qs(query)
    fields = ["regionid", "sectionid", "type", "shape", "price", "area", "pattern", "label"]
    int_fields = {"regionid", "sectionid", "type", "shape"}

    result = {}
    for key in fields:
        values = params.get(key)
        if not values:
            result[key] = None
            continue
        value = values[0]
        if key in int_fields and "," not in value and value.isdigit():
            value = int(value)
        result[key] = value

    lines = ["    {"]
    for key, value in result.items():
        lines.append(f"        {key!r}: {value!r},")
    lines.append("    },")

    missing = [k for k in ("regionid", "sectionid") if result[k] is None]
    warning = None
    if missing:
        warning = f"⚠️ 網址裡沒找到 {missing}，這兩個是必填欄位，確認一下網址是不是完整複製的。"
    return "\n".join(lines), warning


# (網址片段後綴, target dict的key)，對照 CONFIG_DETAIL.md 的「永慶房屋參數對照」表
YUNGCHING_SUFFIX_MAP = [
    ("_price", "price"),
    ("_type", "type"),
    ("_rmp", "rooms"),
    ("_pin", "area"),
    ("_age", "house_age"),
]


def parse_yungching(url):
    path = unquote(urlparse(url).path)
    m = re.search(r"/list/(.+?)_c/(.*)", path)
    if not m:
        return None, "⚠️ 網址格式不對，找不到地區資訊。網址應該長得像：https://buy.yungching.com.tw/list/新竹市-東區_c/..."
    region = m.group(1)
    segments = [s for s in m.group(2).split("/") if s and s != "new_filter"]

    extra = {field: None for _, field in YUNGCHING_SUFFIX_MAP}
    has_parking = None
    for seg in segments:
        if seg in ("y_park", "n_park"):
            has_parking = seg == "y_park"
            continue
        for suffix, field in YUNGCHING_SUFFIX_MAP:
            if seg.endswith(suffix):
                extra[field] = seg[: -len(suffix)]
                break

    lines = [
        "    {",
        f"        'region': {region!r},",
        "        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None",
    ]
    for _, field in YUNGCHING_SUFFIX_MAP:
        lines.append(f"        {field!r}: {extra[field]!r},")
    lines.append(f"        'has_parking': {has_parking!r},")
    lines.append("    },")
    return "\n".join(lines), None


# (網址片段後綴, target dict的key)，對照 CONFIG_DETAIL.md 的「信義房屋參數對照」表
SINYI_SUFFIX_MAP = [
    ("-type", "type"),
    ("-price", "price"),
    ("-roomtotal", "rooms"),
    ("-zip", "zip"),
]


def parse_sinyi(url):
    path = urlparse(url).path
    m = re.search(r"/buy/list/([^/]+)(.*)", path)
    if not m:
        return None, "⚠️ 網址格式不對，找不到縣市資訊。網址應該長得像：https://www.sinyi.com.tw/buy/list/Hsinchu-city"
    region = m.group(1)
    segments = [s for s in m.group(2).split("/") if s and s != "default-desc" and not s.isdigit()]

    extra = {field: None for _, field in SINYI_SUFFIX_MAP}
    for seg in segments:
        for suffix, field in SINYI_SUFFIX_MAP:
            if seg.endswith(suffix):
                extra[field] = seg[: -len(suffix)]
                break

    lines = [
        "    {",
        f"        'region': {region!r},",
        "        'min_rooms': 2,  # 記得確認房數門檻要設多少，不限就設 None",
    ]
    for _, field in SINYI_SUFFIX_MAP:
        lines.append(f"        {field!r}: {extra[field]!r},")
    lines.append("    },")
    return "\n".join(lines), "⚠️ 提醒：信義只能篩到縣市層級，抓到的會是整個縣市範圍，不會只有你想要的區。"


# (網域關鍵字, 顯示名稱, config.py裡對應的變數名, 解析函式)
SITE_HANDLERS = [
    ("sale.591.com.tw", "591", "HOUSE_591", parse_591),
    ("buy.yungching.com.tw", "永慶", "YUNGCHING", parse_yungching),
    ("www.sinyi.com.tw", "信義", "SINYI", parse_sinyi),
]


def main():
    if len(sys.argv) != 2:
        print('用法：python3 parse_url.py "<591/永慶/信義的網址>"')
        sys.exit(1)

    url = sys.argv[1]
    host = urlparse(url).netloc

    for domain, label, config_key, handler in SITE_HANDLERS:
        if domain in host:
            result, warning = handler(url)
            if result is None:
                print(warning)
                sys.exit(1)
            print(f"判斷為【{label}】的網址，解析結果（可以直接複製貼進 config.py 的 {config_key} 清單裡）：\n")
            print(result)
            if warning:
                print(f"\n{warning}")
            return

    print(f"⚠️ 看不出這是哪個網站的網址（網域：{host}），目前只支援 591/永慶/信義。")
    sys.exit(1)


if __name__ == "__main__":
    main()
