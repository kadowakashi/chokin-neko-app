from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []
WARNINGS: list[str] = []


def error(message: str) -> None:
    ERRORS.append(message)


def warning(message: str) -> None:
    WARNINGS.append(message)


def exact_file(relative: str) -> bool:
    current = ROOT
    for part in Path(relative).parts:
        if not current.is_dir():
            return False
        names = {item.name: item for item in current.iterdir()}
        if part not in names:
            return False
        current = names[part]
    return current.is_file()


def local_path(reference: str) -> str | None:
    if not reference or reference.startswith(("#", "data:", "http://", "https://")):
        return None
    path = unquote(urlparse(reference).path).replace("\\", "/")
    if path.startswith("/"):
        warning(f"ドメインルート固定パスの疑い: {reference}")
        return None
    while path.startswith("./"):
        path = path[2:]
    return path or "index.html"


def main() -> int:
    print("GitHub Pages公開前診断\n")
    required = ["index.html", "manifest.webmanifest", "service-worker.js", "favicon.svg", ".nojekyll"]
    icons = ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"]
    for item in required + icons:
        path = ROOT / item
        if not path.exists():
            error(f"必要ファイルなし: {item}")
        elif path.stat().st_size == 0 and item != ".nojekyll":
            error(f"必要ファイルが0バイト: {item}")

    try:
        manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8-sig"))
        for key in ("name", "short_name", "description", "start_url", "scope", "display", "background_color", "theme_color", "icons"):
            if not manifest.get(key):
                error(f"Manifest項目なし: {key}")
        if manifest.get("start_url") != "./":
            error("Manifest start_urlは ./ を推奨")
        if manifest.get("scope") != "./":
            error("Manifest scopeは ./ を推奨")
        if manifest.get("display") != "standalone":
            error("Manifest displayがstandaloneではありません")
        for icon in manifest.get("icons", []):
            path = local_path(str(icon.get("src", "")))
            if path and not exact_file(path):
                error(f"Manifestアイコン不一致: {path}")
    except Exception as exc:
        error(f"Manifestを読めません: {exc}")

    text_files = list(ROOT.glob("*.html")) + list(ROOT.glob("*.css"))
    html_pattern = re.compile(r"(?:src|href)=[\"']([^\"']+)", re.I)
    css_pattern = re.compile(r"url\(\s*[\"']?([^\"')]+)", re.I)
    for file in text_files:
        text = file.read_text(encoding="utf-8-sig", errors="replace")
        pattern = html_pattern if file.suffix.lower() == ".html" else css_pattern
        for match in pattern.finditer(text):
            reference = match.group(1)
            path = local_path(reference)
            if path and not exact_file(path):
                error(f"参照先なし・大小文字不一致: {file.name} -> {path}")

    root_fixed = re.compile(r"(?:src|href)\s*=\s*[\"']/(?!/)|(?:fetch|register)\(\s*[\"']/(?!/)|url\(\s*[\"']?/(?!/)", re.I)
    for file in list(ROOT.glob("*.html")) + list(ROOT.glob("*.js")) + list(ROOT.glob("*.css")):
        if root_fixed.search(file.read_text(encoding="utf-8-sig", errors="replace")):
            warning(f"ドメインルート固定パスの疑い: {file.name}")

    index = (ROOT / "index.html").read_text(encoding="utf-8-sig")
    worker = (ROOT / "service-worker.js").read_text(encoding="utf-8-sig")
    app = (ROOT / "app.js").read_text(encoding="utf-8-sig")
    if "serviceWorker.register('./service-worker.js'" not in app:
        error("Service Worker登録を確認できません")
    if "./manifest.webmanifest" not in index:
        error("相対Manifest参照を確認できません")
    if "SKIP_WAITING" not in worker:
        warning("Service Worker更新メッセージを確認できません")
    assets_match = re.search(r"const ASSETS=\[(.*?)\];", worker, re.S)
    if not assets_match:
        error("Service Workerの事前キャッシュ一覧を読めません")
    else:
        for reference in re.findall(r"['\"]([^'\"]+)['\"]", assets_match.group(1)):
            path = local_path(reference)
            if path and not exact_file(path):
                error(f"Service Workerキャッシュ対象なし・大小文字不一致: {path}")

    try:
        catalog = json.loads((ROOT / "assets/cats/cat-catalog.json").read_text(encoding="utf-8-sig"))
        cats = [cat for cat in catalog.get("cats", []) if cat.get("enabled", True)]
        image_paths = [f"assets/cats/{cat['image']}" for cat in cats]
        missing = [path for path in image_paths if not exact_file(path)]
        if missing:
            error("猫画像不足: " + ", ".join(missing))
        asset_manifest = json.loads((ROOT / "assets/manifest.json").read_text(encoding="utf-8-sig"))
        available = set(asset_manifest.get("available", []))
        absent = [path for path in image_paths if path not in available]
        if absent:
            error("assets/manifest.json欠落: " + ", ".join(absent))
        broken_available = [path for path in sorted(available) if not exact_file(path)]
        if broken_available:
            error("assets/manifest.json参照先なし・大小文字不一致: " + ", ".join(broken_available))
        cat_result = f"{len(cats) - len(missing)} / {len(cats)}"
    except Exception as exc:
        error(f"猫カタログを検証できません: {exc}")
        cat_result = "確認失敗"

    allowed_json = {"manifest.webmanifest", "assets/manifest.json", "assets/cats/cat-catalog.json"}
    personal = []
    for file in ROOT.rglob("*.json"):
        relative = file.relative_to(ROOT).as_posix()
        if relative not in allowed_json and ("backup" in file.name.lower() or "chokin" in file.name.lower()):
            personal.append(relative)
    if personal:
        warning("公開注意JSON: " + ", ".join(personal))

    double_extensions = [path.relative_to(ROOT).as_posix() for path in ROOT.rglob("*") if path.is_file() and re.search(r"\.(png|jpg|jpeg|webp|json)\.\1$", path.name, re.I)]
    if double_extensions:
        error("二重拡張子: " + ", ".join(double_extensions))

    secret_patterns = [re.compile(r"AKIA[0-9A-Z]{16}"), re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----")]
    secret_hits = []
    for file in ROOT.rglob("*"):
        if not file.is_file() or "__pycache__" in file.parts or file.suffix.lower() not in {".html", ".js", ".css", ".json", ".md", ".py", ".bat", ".webmanifest"}:
            continue
        content = file.read_text(encoding="utf-8-sig", errors="ignore")
        if any(pattern.search(content) for pattern in secret_patterns):
            secret_hits.append(file.relative_to(ROOT).as_posix())
    if secret_hits:
        error("秘密情報らしい文字列: " + ", ".join(secret_hits))

    pycache = [path.relative_to(ROOT).as_posix() for path in ROOT.rglob("__pycache__")]
    if pycache:
        warning("Git除外対象のPythonキャッシュあり: " + ", ".join(pycache))

    print(f"基本ファイル：{'正常' if not any('必要ファイル' in item for item in ERRORS) else '要確認'}")
    print(f"PWA Manifest：{'正常' if not any('Manifest' in item for item in ERRORS) else '要確認'}")
    print(f"Service Worker：{'正常' if not any('Service Worker' in item for item in ERRORS) else '要確認'}")
    print(f"猫素材：{cat_result}")
    print(f"相対パス：{'正常' if not any('パス' in item or '参照先' in item for item in ERRORS + WARNINGS) else '要確認'}")
    print(f"公開注意ファイル：{len(personal)}")
    for item in ERRORS:
        print(f"エラー: {item}")
    for item in WARNINGS:
        print(f"警告: {item}")
    print(f"エラー：{len(ERRORS)}")
    print(f"警告：{len(WARNINGS)}")
    print("\nGitHub Pages公開準備完了" if not ERRORS else "\n修正後にもう一度診断してください")
    return 1 if ERRORS else 0


if __name__ == "__main__":
    raise SystemExit(main())
