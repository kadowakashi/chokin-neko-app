from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
INPUT_DIR = Path(__file__).resolve().parent / "input"
QA_DIR = Path(__file__).resolve().parent / "output"
PUBLIC_DIR = ROOT / "assets" / "cats-transparent"
PROCESSOR_DIR = ROOT / "tools" / "transparency-test"
sys.path.insert(0, str(PROCESSOR_DIR))

import make_transparent_test as processor  # noqa: E402
from build_transparent_cats import add_quality_warnings, bbox_delta, bbox_from_mask  # noqa: E402


SPECS = (
    ("gardener", "cat_gardener_source.png", "cat_gardener.png"),
    ("ranger", "cat_ranger_source.png", "cat_ranger.png"),
    ("idol", "cat_idol_source.png", "cat_idol.png"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def count_alpha(alpha: np.ndarray) -> dict[str, int]:
    return {
        "fullyTransparentPixels": int((alpha == 0).sum()),
        "semiTransparentPixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "fullyOpaquePixels": int((alpha == 255).sum()),
    }


def process_one(cat_id: str, source_name: str, output_name: str) -> tuple[dict[str, object], tuple[str, Image.Image, Image.Image]]:
    source_path = INPUT_DIR / source_name
    output_path = PUBLIC_DIR / output_name
    temporary_path = PUBLIC_DIR / f".{output_name}.tmp"
    with Image.open(source_path) as source:
        source.load()
        source_format = source.format
        source_mode = source.mode
        source_size = list(source.size)
        original = source.convert("RGB")

    rgba_array, metrics = processor.make_transparent(np.asarray(original, dtype=np.uint8))
    add_quality_warnings(metrics, rgba_array)
    transparent = Image.fromarray(rgba_array, "RGBA")
    transparent.save(temporary_path, format="PNG", optimize=True)
    with Image.open(temporary_path) as decoded:
        decoded.load()
        output_format = decoded.format
        output_mode = decoded.mode
        output_size = list(decoded.size)
        has_alpha = "A" in decoded.getbands()
    if output_format != "PNG" or output_mode != "RGBA" or output_size != source_size or not has_alpha:
        temporary_path.unlink(missing_ok=True)
        raise RuntimeError(f"{cat_id}: output validation failed")
    temporary_path.replace(output_path)

    alpha = rgba_array[:, :, 3]
    detected_bbox = bbox_from_mask(alpha > 0)
    metrics.update({
        "id": cat_id,
        "sourcePath": source_path.relative_to(ROOT).as_posix(),
        "outputPath": output_path.relative_to(ROOT).as_posix(),
        "sourceFormat": source_format,
        "sourceMode": source_mode,
        "sourceSize": source_size,
        "outputFormat": output_format,
        "outputMode": output_mode,
        "outputSize": output_size,
        "resize": False,
        "trim": False,
        "hasAlphaChannel": has_alpha,
        "pngDecodeOk": True,
        "detectedSourceContentBoundingBox": detected_bbox,
        "outputBoundingBoxDifference": bbox_delta(detected_bbox, metrics.get("opaqueBoundingBox")),
        "sourceSha256": sha256(source_path),
        "outputSha256": sha256(output_path),
        "outputFileBytes": output_path.stat().st_size,
        **count_alpha(alpha),
    })
    return metrics, (cat_id, original, transparent)


def main() -> None:
    missing = [source for _, source, _ in SPECS if not (INPUT_DIR / source).is_file()]
    if missing:
        raise RuntimeError("missing inputs: " + ", ".join(missing))
    QA_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    before = {source: sha256(INPUT_DIR / source) for _, source, _ in SPECS}
    report: dict[str, object] = {
        "testVersion": "v0.9.14-new-cats",
        "method": "adaptive two-color perimeter clustering and border-connected background removal",
        "settings": {
            "strictThresholdRange": [10.0, 16.0],
            "featherDistance": processor.FEATHER_DISTANCE,
            "contourProtectionFilter": 5,
            "resize": False,
            "trim": False,
        },
        "images": {},
    }
    rows: list[tuple[str, Image.Image, Image.Image]] = []
    for cat_id, source_name, output_name in SPECS:
        metrics, row = process_one(cat_id, source_name, output_name)
        report["images"][cat_id] = metrics
        rows.append(row)
        check_path = QA_DIR / f"cat_{cat_id}_transparency_check.png"
        processor.make_comparison([row]).save(check_path, format="PNG", optimize=True)

    sheet_path = QA_DIR / "new_cats_comparison_sheet.png"
    processor.make_comparison(rows).save(sheet_path, format="PNG", optimize=True)
    after = {source: sha256(INPUT_DIR / source) for _, source, _ in SPECS}
    report["sourceSha256Before"] = before
    report["sourceSha256After"] = after
    report["sourceHashesUnchanged"] = before == after
    report["majorWarningCount"] = sum(len(item["warnings"]) for item in report["images"].values())
    report["comparisonSheet"] = sheet_path.relative_to(ROOT).as_posix()
    report_path = QA_DIR / "new_cats_transparency_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if before != after:
        raise RuntimeError("source hashes changed")
    print(json.dumps({
        "generated": len(report["images"]),
        "majorWarningCount": report["majorWarningCount"],
        "sourceHashesUnchanged": report["sourceHashesUnchanged"],
        "report": report_path.relative_to(ROOT).as_posix(),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
