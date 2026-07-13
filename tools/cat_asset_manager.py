#!/usr/bin/env python3
"""猫カタログの追加・同期・検証ツール（Python標準ライブラリのみ）。"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path

RARITIES = ("NORMAL", "RARE", "SUPER", "ULTRA", "LEGEND")
DEFAULTS = {
    "NORMAL": (10, "#fff4dc", "#ffd75a"),
    "RARE": (8, "#35245f", "#8e7cff"),
    "SUPER": (6, "#18256b", "#ffd34d"),
    "ULTRA": (4, "#741f30", "#ff68db"),
    "LEGEND": (2, "#6d183e", "#ffe05e"),
}
ID_RE = re.compile(r"^[a-z0-9_]+$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
REQUIRED = {
    "id", "name", "rarity", "image", "imageKey", "gachaEnabled",
    "slotEnabled", "weight", "themeColor", "accentColor", "message",
    "feverTitle", "sortOrder", "enabled",
}


class Paths:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.catalog = self.root / "assets" / "cats" / "cat-catalog.json"
        self.cats = self.root / "assets" / "cats"
        self.generated = self.root / "cat-characters.js"
        self.manifest = self.root / "assets" / "manifest.json"
        self.backups = self.root / "tools" / "backups"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def json_text(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def generated_js(catalog: dict) -> str:
    cats = []
    for source in sorted(catalog["cats"], key=lambda cat: (cat["sortOrder"], cat["id"])):
        if not source.get("enabled", True):
            continue
        cat = dict(source)
        cat["imagePath"] = f"assets/cats/{cat['image']}"
        cats.append(cat)
    data = json.dumps(cats, ensure_ascii=False, separators=(",", ":"))
    return f"""// このファイルはcat-catalog.jsonから自動生成されています。直接編集しないでください。
(() => {{
  'use strict';
  const cats = {data}.map(cat=>Object.freeze(cat));
  const RECENT_KEY='chokin-event-app.gachaRecent.v1';
  const weightedPick = list => {{ const total=list.reduce((sum,item)=>sum+item.adjustedWeight,0);let value=Math.random()*total;for(const item of list){{value-=item.adjustedWeight;if(value<=0)return item.cat;}}return list[0]?.cat; }};
  const byRarity = rarity => cats.filter(cat=>cat.rarity===rarity);
  function recent() {{ try {{ const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.slice(0,3):[]; }} catch {{ return []; }} }}
  function choose(rarity,{{persist=true,slot=false}}={{}}) {{
    const pool=(slot?cats.filter(cat=>cat.slotEnabled):cats.filter(cat=>cat.gachaEnabled&&cat.rarity===rarity));
    // 基本重み → 未取得なら×1.5 → 直近3回なら×0.35 → 重み付き抽選
    const history=recent(), weighted=pool.map(cat=>({{cat,adjustedWeight:cat.weight*(window.ChokinCollection?.isObtained(cat.id)?1:1.5)*(history.includes(cat.id)?.35:1)}}));
    const selected=weightedPick(weighted)||cats[0];
    if(persist&&!slot){{try{{localStorage.setItem(RECENT_KEY,JSON.stringify([selected.id,...history.filter(id=>id!==selected.id)].slice(0,3)));}}catch{{}}}}
    return selected;
  }}
  const get = id => cats.find(cat=>cat.id===id)||cats[0];
  window.ChokinCats={{all:Object.freeze(cats),byRarity,choose,get,recentKey:RECENT_KEY}};
}})();
"""


def validate_data(paths: Paths, catalog: dict, manifest: dict | None = None, check_generated=True):
    errors, warnings = [], []
    cats = catalog.get("cats") if isinstance(catalog, dict) else None
    if catalog.get("schemaVersion") != 1:
        errors.append("schemaVersionは1である必要があります")
    if not isinstance(cats, list):
        return ["catsは配列である必要があります"], warnings, Counter()
    for index, cat in enumerate(cats, 1):
        missing = REQUIRED - set(cat) if isinstance(cat, dict) else REQUIRED
        if missing:
            errors.append(f"猫{index}: 必須項目不足 {', '.join(sorted(missing))}")
            continue
        if not ID_RE.fullmatch(str(cat["id"])):
            errors.append(f"不正なID: {cat['id']}")
        if cat["rarity"] not in RARITIES:
            errors.append(f"不正なレアリティ: {cat['id']}={cat['rarity']}")
        if not COLOR_RE.fullmatch(str(cat["themeColor"])) or not COLOR_RE.fullmatch(str(cat["accentColor"])):
            errors.append(f"不正な色コード: {cat['id']}")
        if not isinstance(cat["weight"], (int, float)) or isinstance(cat["weight"], bool) or cat["weight"] <= 0:
            errors.append(f"抽選重みは0より大きくしてください: {cat['id']}")
        if not (paths.cats / str(cat["image"])).is_file():
            errors.append(f"登録画像がありません: {cat['image']}")
    for key, label in (("id", "ID"), ("name", "名前"), ("image", "画像名"), ("imageKey", "imageキー")):
        values = [cat.get(key) for cat in cats if isinstance(cat, dict)]
        for value, count in Counter(values).items():
            if value is not None and count > 1:
                errors.append(f"{label}重複: {value}")
    registered = {cat.get("image") for cat in cats if isinstance(cat, dict)}
    disk_images = {path.name for path in paths.cats.iterdir() if path.is_file() and path.suffix.lower() in {".png", ".webp"}}
    for name in sorted(disk_images - registered):
        warnings.append(f"未登録画像: {name}")
    if manifest is None:
        manifest = read_json(paths.manifest)
    available = set(manifest.get("available", []))
    for cat in cats:
        expected = f"assets/cats/{cat.get('image')}"
        if expected not in available:
            errors.append(f"manifest登録漏れ: {expected}")
    if check_generated and paths.generated.is_file() and paths.generated.read_text(encoding="utf-8") != generated_js(catalog):
        errors.append("cat-characters.jsがカタログと一致しません")
    counts = Counter(cat.get("rarity") for cat in cats if isinstance(cat, dict) and cat.get("enabled", True))
    return errors, warnings, counts


def backup_files(paths: Paths):
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    paths.backups.mkdir(parents=True, exist_ok=True)
    result = {}
    for source in (paths.catalog, paths.generated, paths.manifest):
        target = paths.backups / f"{source.stem}_{stamp}{source.suffix}"
        shutil.copy2(source, target)
        result[source] = target
    return result


def temp_text(path: Path, content: str) -> Path:
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
    return Path(name)


def updated_manifest(paths: Paths, catalog: dict, manifest: dict):
    result = dict(manifest)
    non_cats = [item for item in manifest.get("available", []) if not item.startswith("assets/cats/")]
    cat_assets = [f"assets/cats/{cat['image']}" for cat in sorted(catalog["cats"], key=lambda cat: (cat["sortOrder"], cat["id"])) if cat.get("enabled", True)]
    result["available"] = cat_assets + non_cats
    return result


def commit_files(replacements: dict[Path, str], backups: dict[Path, Path]):
    temps = {path: temp_text(path, content) for path, content in replacements.items()}
    try:
        for path, temp in temps.items():
            os.replace(temp, path)
    except Exception:
        for original, backup in backups.items():
            if original in replacements and backup.exists():
                shutil.copy2(backup, original)
        raise
    finally:
        for temp in temps.values():
            temp.unlink(missing_ok=True)


def sync(paths: Paths, catalog: dict | None = None, write_catalog=False, image_copy: tuple[Path, Path] | None = None):
    catalog = catalog or read_json(paths.catalog)
    manifest = read_json(paths.manifest)
    candidate_manifest = updated_manifest(paths, catalog, manifest)
    errors, _, _ = validate_data(paths, catalog, candidate_manifest, check_generated=False)
    if image_copy:
        source, destination = image_copy
        errors = [error for error in errors if error != f"登録画像がありません: {destination.name}"]
    if errors:
        raise ValueError("\n".join(errors))
    backups = backup_files(paths)
    replacements = {
        paths.generated: generated_js(catalog),
        paths.manifest: json_text(candidate_manifest),
    }
    if write_catalog:
        replacements[paths.catalog] = json_text(catalog)
    image_temp = None
    try:
        if image_copy:
            source, destination = image_copy
            image_temp = destination.with_name(f".{destination.name}.tmp")
            shutil.copy2(source, image_temp)
        commit_files(replacements, backups)
        if image_temp:
            os.replace(image_temp, image_copy[1])
    except Exception:
        image_temp and image_temp.unlink(missing_ok=True)
        image_copy and image_copy[1].unlink(missing_ok=True)
        for original, backup in backups.items():
            shutil.copy2(backup, original)
        raise
    errors, warnings, counts = validate_data(paths, read_json(paths.catalog), read_json(paths.manifest))
    if errors:
        raise RuntimeError("同期後の検証に失敗しました:\n" + "\n".join(errors))
    return warnings, counts


def ask(prompt: str, default=None, required=True):
    suffix = f" [{default}]" if default is not None else ""
    while True:
        value = input(f"{prompt}{suffix}: ").strip()
        if value:
            return value
        if default is not None:
            return str(default)
        if not required:
            return ""
        print("入力してください。")


def yes_no(prompt: str, default=True):
    marker = "Y/n" if default else "y/N"
    while True:
        value = input(f"{prompt} [{marker}]: ").strip().lower()
        if not value:
            return default
        if value in {"y", "yes", "1"}:
            return True
        if value in {"n", "no", "0"}:
            return False
        print("y または n を入力してください。")


def interactive_values():
    source = Path(ask("元画像の場所").strip('"')).expanduser()
    cat_id = ask("猫ID（英小文字・数字・_）")
    name = ask("猫の表示名")
    print("1. NORMAL\n2. RARE\n3. SUPER\n4. ULTRA\n5. LEGEND")
    while True:
        choice = ask("レアリティ番号")
        if choice in {"1", "2", "3", "4", "5"}:
            rarity = RARITIES[int(choice) - 1]
            break
        print("1～5を選択してください。")
    weight, theme, accent = DEFAULTS[rarity]
    return {
        "source": source, "id": cat_id, "name": name, "rarity": rarity,
        "gacha": yes_no("ガチャ対象", True), "slot": yes_no("スロット対象", True),
        "weight": ask("抽選重み", weight), "theme": ask("テーマ色", theme),
        "accent": ask("アクセント色", accent), "message": ask("専用メッセージ"),
        "fever": ask("FEVER名"),
    }


def add_cat(paths: Paths, values: dict):
    catalog = read_json(paths.catalog)
    source = Path(str(values["source"]).strip('"')).expanduser().resolve()
    cat_id, name, rarity = values["id"], values["name"], values["rarity"]
    image = f"cat_{cat_id}.png"
    image_key = f"cat_{cat_id}"
    if not source.is_file() or source.suffix.lower() != ".png":
        raise ValueError("元画像は存在するPNGファイルを指定してください")
    if not ID_RE.fullmatch(cat_id):
        raise ValueError("猫IDは半角英小文字・数字・アンダースコアだけを使用してください")
    if rarity not in RARITIES:
        raise ValueError("不正なレアリティです")
    if not COLOR_RE.fullmatch(values["theme"]) or not COLOR_RE.fullmatch(values["accent"]):
        raise ValueError("色は #RRGGBB 形式で入力してください")
    try:
        weight = float(values["weight"])
    except ValueError as error:
        raise ValueError("抽選重みは数値で入力してください") from error
    if weight <= 0:
        raise ValueError("抽選重みは0より大きくしてください")
    if weight.is_integer():
        weight = int(weight)
    existing = catalog["cats"]
    checks = (("id", cat_id, "ID"), ("name", name, "表示名"), ("image", image, "画像名"), ("imageKey", image_key, "imageキー"))
    for key, value, label in checks:
        if any(cat.get(key) == value for cat in existing):
            raise ValueError(f"{label}が重複しています: {value}")
    destination = paths.cats / image
    if destination.exists():
        raise ValueError(f"画像ファイルが既に存在します: {image}")
    sort_order = max((int(cat.get("sortOrder", 0)) for cat in existing), default=0) + 10
    new_cat = {
        "id": cat_id, "name": name, "rarity": rarity, "image": image,
        "imageKey": image_key, "gachaEnabled": bool(values["gacha"]),
        "slotEnabled": bool(values["slot"]), "weight": weight,
        "themeColor": values["theme"], "accentColor": values["accent"],
        "message": values["message"], "feverTitle": values["fever"],
        "sortOrder": sort_order, "enabled": True,
    }
    catalog["cats"].append(new_cat)
    catalog["catalogVersion"] = int(catalog.get("catalogVersion", 0)) + 1
    catalog["updatedAt"] = datetime.now().astimezone().isoformat(timespec="seconds")
    sync(paths, catalog, write_catalog=True, image_copy=(source, destination))
    print("\n猫登録完了\n")
    print(f"名前：{name}\nID：{cat_id}\nレアリティ：{rarity}\n画像：{image}\n")
    print(f"登録猫数：{len(catalog['cats'])}匹\n\nアプリを再読み込みしてください。")


def print_validation(paths: Paths):
    catalog, manifest = read_json(paths.catalog), read_json(paths.manifest)
    errors, warnings, counts = validate_data(paths, catalog, manifest)
    enabled = sum(1 for cat in catalog["cats"] if cat.get("enabled", True))
    print("猫素材検証\n")
    print(f"登録猫：{len(catalog['cats'])}\n有効猫：{enabled}\n")
    for rarity in RARITIES:
        print(f"{rarity}：{counts[rarity]}")
    print(f"\nエラー：{len(errors)}\n警告：{len(warnings)}")
    for item in errors:
        print(f"エラー: {item}")
    for item in warnings:
        print(f"警告: {item}")
    print("\n猫素材は正常です。" if not errors else "\n猫素材に問題があります。")
    return 0 if not errors else 1


def parse_bool(value: str) -> bool:
    return value.lower() in {"1", "true", "yes", "y"}


def main():
    parser = argparse.ArgumentParser(description="猫素材管理")
    parser.add_argument("command", nargs="?", choices=("add", "sync", "validate"), default="add")
    parser.add_argument("--source")
    parser.add_argument("--id")
    parser.add_argument("--name")
    parser.add_argument("--rarity", choices=RARITIES)
    parser.add_argument("--gacha", default="true")
    parser.add_argument("--slot", default="true")
    parser.add_argument("--weight")
    parser.add_argument("--theme")
    parser.add_argument("--accent")
    parser.add_argument("--message")
    parser.add_argument("--fever")
    args = parser.parse_args()
    paths = Paths(Path(__file__).resolve().parents[1])
    try:
        if args.command == "validate":
            return print_validation(paths)
        if args.command == "sync":
            warnings, _ = sync(paths)
            print("猫素材を同期しました。")
            for warning in warnings:
                print(f"警告: {warning}")
            return 0
        if args.source:
            required = (args.id, args.name, args.rarity, args.weight, args.theme, args.accent, args.message, args.fever)
            if not all(value is not None for value in required):
                raise ValueError("非対話追加では全項目を指定してください")
            values = {"source":args.source,"id":args.id,"name":args.name,"rarity":args.rarity,"gacha":parse_bool(args.gacha),"slot":parse_bool(args.slot),"weight":args.weight,"theme":args.theme,"accent":args.accent,"message":args.message,"fever":args.fever}
        else:
            values = interactive_values()
        add_cat(paths, values)
        return 0
    except (OSError, ValueError, json.JSONDecodeError, EOFError) as error:
        print(f"エラー: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
