from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

import make_transparent_test as processor


ROOT = Path(__file__).resolve().parents[2]
INPUT_DIR = ROOT / "assets" / "cats"
OUTPUT_DIR = ROOT / "assets" / "cats-transparent"
QA_DIR = Path(__file__).resolve().parent / "v09112" / "all"
INPUT_NAMES = (
    "cat_celebrate.png",
    "cat_cosmic.png",
    "cat_surprised.png",
    "cat_royal.png",
    "cat_black.png",
    "cat_calico.png",
    "cat_orange_tabby.png",
    "cat_hachiware.png",
    "cat_ninja.png",
    "cat_wizard.png",
    "cat_samurai.png",
    "cat_angel.png",
    "cat_deity.png",
    "cat_gray.png",
    "cat_pirate.png",
    "cat_knight.png",
    "cat_detective.png",
    "cat_chef.png",
    "cat_dragon.png",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bbox_from_mask(mask: np.ndarray) -> list[int] | None:
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def bbox_delta(first: list[int] | None, second: list[int] | None) -> list[int] | None:
    if first is None or second is None:
        return None
    return [second[index] - first[index] for index in range(4)]


def add_quality_warnings(metrics: dict[str, object], rgba: np.ndarray) -> None:
    warnings = list(metrics.get("warnings", []))
    alpha = rgba[:, :, 3]
    height, width = alpha.shape
    edge = np.concatenate((alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]))
    edge_opaque_ratio = float((edge > 0).mean())
    metrics["edgeOpaqueRatio"] = round(edge_opaque_ratio, 6)
    if edge_opaque_ratio > 0.08:
        warnings.append("画像外周に不透明画素が多く、長方形背景が残っている可能性があります")
    bbox = metrics.get("opaqueBoundingBox")
    if bbox:
        bbox_width = int(bbox[2]) - int(bbox[0])
        bbox_height = int(bbox[3]) - int(bbox[1])
        if bbox_width < width * 0.30 or bbox_height < height * 0.30:
            warnings.append("不透明部分の境界ボックスが極端に縮小しています")
    if int(metrics.get("semiTransparentPixels", 0)) <= 0:
        warnings.append("輪郭用の半透明画素がありません")
    if int(metrics.get("fullyTransparentPixels", 0)) <= 0:
        warnings.append("完全透明画素がありません")
    metrics["warnings"] = list(dict.fromkeys(warnings))


def main() -> None:
    missing = [name for name in INPUT_NAMES if not (INPUT_DIR / name).is_file()]
    if missing:
        raise RuntimeError(f"対象画像が不足しています: {', '.join(missing)}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)
    hashes_before = {name: sha256(INPUT_DIR / name) for name in INPUT_NAMES}
    report: dict[str, object] = {
        "testVersion": "v09112-all",
        "method": "adaptive two-color perimeter clustering and border-connected background removal",
        "settings": {
            "strictThresholdRange": [10.0, 16.0],
            "featherDistance": processor.FEATHER_DISTANCE,
            "contourProtectionFilter": 5,
            "outerNoiseBandRatio": 0.04,
            "resize": False,
            "trim": False,
        },
        "images": {},
    }
    comparison_rows: list[tuple[str, Image.Image, Image.Image]] = []
    for name in INPUT_NAMES:
        source_path = INPUT_DIR / name
        output_path = OUTPUT_DIR / name
        temporary_path = OUTPUT_DIR / f".{name}.tmp"
        with Image.open(source_path) as source:
            source.load()
            if source.format != "PNG":
                raise RuntimeError(f"{name} はPNGではありません")
            source_format = source.format
            source_mode = source.mode
            original = source.convert("RGB")
        rgba_array, metrics = processor.make_transparent(np.asarray(original, dtype=np.uint8))
        add_quality_warnings(metrics, rgba_array)
        transparent = Image.fromarray(rgba_array, "RGBA")
        transparent.save(temporary_path, format="PNG", optimize=True)
        with Image.open(temporary_path) as decoded:
            decoded.load()
            decode_ok = decoded.format == "PNG" and decoded.mode == "RGBA"
            output_size = list(decoded.size)
            output_mode = decoded.mode
            has_alpha = "A" in decoded.getbands()
        if not decode_ok or output_size != list(original.size) or not has_alpha:
            temporary_path.unlink(missing_ok=True)
            raise RuntimeError(f"{name} の出力検証に失敗しました")
        temporary_path.replace(output_path)
        detected_source_bbox = bbox_from_mask(rgba_array[:, :, 3] > 0)
        metrics.update({
            "sourcePath": source_path.relative_to(ROOT).as_posix(),
            "outputPath": output_path.relative_to(ROOT).as_posix(),
            "sourceFormat": source_format,
            "sourceMode": source_mode,
            "sourceSize": list(original.size),
            "sourceOpaqueBoundingBox": [0, 0, original.width, original.height],
            "detectedSourceContentBoundingBox": detected_source_bbox,
            "outputSize": output_size,
            "outputMode": output_mode,
            "outputBoundingBoxDifference": bbox_delta(detected_source_bbox, metrics.get("opaqueBoundingBox")),
            "sourceSha256Before": hashes_before[name],
            "outputSha256": sha256(output_path),
            "outputFileBytes": output_path.stat().st_size,
            "pngDecodeOk": decode_ok,
            "hasAlphaChannel": has_alpha,
        })
        report["images"][name] = metrics
        comparison_rows.append((name.removesuffix(".png"), original, transparent))

    sheets = []
    for index, start in enumerate(range(0, len(comparison_rows), 5), 1):
        sheet_path = QA_DIR / f"comparison_sheet_{index:02d}.png"
        processor.make_comparison(comparison_rows[start:start + 5]).save(sheet_path, format="PNG", optimize=True)
        sheets.append(sheet_path.relative_to(ROOT).as_posix())
    hashes_after = {name: sha256(INPUT_DIR / name) for name in INPUT_NAMES}
    report["sourceHashesUnchanged"] = hashes_before == hashes_after
    report["sourceSha256After"] = hashes_after
    report["comparisonSheets"] = sheets
    report["majorWarningCount"] = sum(len(item["warnings"]) for item in report["images"].values())
    report_path = QA_DIR / "transparency_report_all.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if hashes_before != hashes_after:
        raise RuntimeError("元画像のハッシュが変化しました")
    print(json.dumps({
        "generated": len(report["images"]),
        "majorWarningCount": report["majorWarningCount"],
        "sourceHashesUnchanged": report["sourceHashesUnchanged"],
        "comparisonSheets": sheets,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
