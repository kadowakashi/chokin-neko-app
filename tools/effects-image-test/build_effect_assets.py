from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
INPUT_DIR = Path(__file__).resolve().parent / "input"
QA_DIR = Path(__file__).resolve().parent / "output"
PUBLIC_DIR = ROOT / "assets" / "scenes"
SPECS = (
    ("shockwave_core", "shockwave_core_source.png", "shockwave_core.png"),
    ("golden_blessing_core", "golden_blessing_core_source.png", "golden_blessing_core.png"),
    ("solar_core", "solar_core_source.png", "solar_core.png"),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_metrics(rgba: np.ndarray) -> dict[str, object]:
    alpha = rgba[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    bbox = None if not len(xs) else [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    edge = np.concatenate((alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]))
    h, w = alpha.shape
    central = alpha[h // 4:h * 3 // 4, w // 4:w * 3 // 4]
    return {
        "fullyTransparentPixels": int((alpha == 0).sum()),
        "semiTransparentPixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "fullyOpaquePixels": int((alpha == 255).sum()),
        "transparentRatio": round(float((alpha == 0).mean()), 6),
        "opaqueBoundingBox": bbox,
        "edgeNonTransparentRatio": round(float((edge > 0).mean()), 6),
        "centralTransparentRatio": round(float((central == 0).mean()), 6),
    }


def checkerboard(size: tuple[int, int], square: int = 20) -> Image.Image:
    width, height = size
    yy, xx = np.indices((height, width))
    values = np.where(((xx // square) + (yy // square)) % 2 == 0, 235, 202).astype(np.uint8)
    return Image.fromarray(np.dstack((values, values, values)), "RGB")


def composite(rgba: Image.Image, color: str | None = None) -> Image.Image:
    background = checkerboard(rgba.size) if color is None else Image.new("RGB", rgba.size, color)
    result = background.convert("RGBA")
    result.alpha_composite(rgba)
    return result.convert("RGB")


def fit_panel(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    panel = Image.new("RGB", size, "#10162b")
    copy = image.convert("RGB")
    copy.thumbnail((size[0] - 12, size[1] - 12), Image.Resampling.LANCZOS)
    panel.paste(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return panel


def make_sheet(rows: list[tuple[str, Image.Image, Image.Image]]) -> Image.Image:
    panel = (188, 188)
    row_label_width, label_height, margin = 150, 28, 10
    columns = ("Input", "Checker", "White", "Navy", "Black", "Alpha mask")
    width = row_label_width + len(columns) * (panel[0] + margin) + margin
    height = label_height + len(rows) * (panel[1] + label_height + margin) + margin
    sheet = Image.new("RGB", (width, height), "#080d1c")
    draw, font = ImageDraw.Draw(sheet), ImageFont.load_default()
    for index, title in enumerate(columns):
        draw.text((row_label_width + index * (panel[0] + margin) + 4, 8), title, fill="white", font=font)
    for row_index, (name, source, output) in enumerate(rows):
        y = label_height + row_index * (panel[1] + label_height + margin)
        draw.text((10, y + 10), name, fill="white", font=font)
        alpha = output.getchannel("A")
        views = (
            composite(source, "#000000"),
            composite(output),
            composite(output, "#ffffff"),
            composite(output, "#071127"),
            composite(output, "#000000"),
            Image.merge("RGB", (alpha, alpha, alpha)),
        )
        for column_index, view in enumerate(views):
            x = row_label_width + column_index * (panel[0] + margin)
            sheet.paste(fit_panel(view, panel), (x, y))
    return sheet


def process_one(effect_id: str, source_name: str, output_name: str) -> tuple[dict[str, object], tuple[str, Image.Image, Image.Image]]:
    source_path = INPUT_DIR / source_name
    output_path = PUBLIC_DIR / output_name
    with Image.open(source_path) as source:
        source.load()
        source_format = source.format
        source_mode = source.mode
        source_size = list(source.size)
        rgba_image = source.convert("RGBA")
        rgba = np.asarray(rgba_image, dtype=np.uint8)

    metrics = alpha_metrics(rgba)
    warnings: list[str] = []
    if source_format != "PNG":
        warnings.append("source is not PNG")
    if source_mode != "RGBA":
        warnings.append("source is not RGBA")
    if int(metrics["fullyTransparentPixels"]) <= 0:
        warnings.append("no fully transparent pixels")
    if int(metrics["semiTransparentPixels"]) <= 0:
        warnings.append("no semi-transparent pixels")
    if int(metrics["fullyOpaquePixels"]) <= 0:
        warnings.append("no fully opaque pixels")
    if float(metrics["edgeNonTransparentRatio"]) > 0.02:
        warnings.append("possible rectangular background on outer edge")
    if float(metrics["centralTransparentRatio"]) > 0.08:
        warnings.append("possible transparent hole in central subject")
    if warnings:
        raise RuntimeError(f"{effect_id}: " + "; ".join(warnings))

    # The supplied PNG already contains a high-quality graded alpha channel.
    # Copying bytes preserves glow fringes and avoids damaging thin lightning,
    # wings, stars, and flame tips with another threshold pass.
    shutil.copyfile(source_path, output_path)
    with Image.open(output_path) as decoded:
        decoded.load()
        output_format = decoded.format
        output_mode = decoded.mode
        output_size = list(decoded.size)
        output_image = decoded.convert("RGBA")
    if output_format != "PNG" or output_mode != "RGBA" or output_size != source_size:
        output_path.unlink(missing_ok=True)
        raise RuntimeError(f"{effect_id}: output validation failed")

    metrics.update({
        "id": effect_id,
        "method": "preserve supplied graded alpha; validate perimeter connectivity and central integrity",
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
        "rotation": False,
        "pngDecodeOk": True,
        "hasAlphaChannel": True,
        "outputFileBytes": output_path.stat().st_size,
        "outputSha256": sha256(output_path),
        "warnings": warnings,
    })
    return metrics, (effect_id, rgba_image, output_image)


def main() -> None:
    missing = [source for _, source, _ in SPECS if not (INPUT_DIR / source).is_file()]
    if missing:
        raise RuntimeError("missing inputs: " + ", ".join(missing))
    QA_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    before = {source: sha256(INPUT_DIR / source) for _, source, _ in SPECS}
    report: dict[str, object] = {
        "testVersion": "v0.9.15-effect-assets",
        "method": "preserve supplied graded alpha with perimeter and central-integrity validation",
        "images": {},
    }
    rows: list[tuple[str, Image.Image, Image.Image]] = []
    for effect_id, source_name, output_name in SPECS:
        metrics, row = process_one(effect_id, source_name, output_name)
        report["images"][effect_id] = metrics
        rows.append(row)
        make_sheet([row]).save(QA_DIR / f"{effect_id}_transparency_check.png", format="PNG", optimize=True)

    sheet_path = QA_DIR / "effects_comparison_sheet.png"
    make_sheet(rows).save(sheet_path, format="PNG", optimize=True)
    after = {source: sha256(INPUT_DIR / source) for _, source, _ in SPECS}
    report["sourceSha256Before"] = before
    report["sourceSha256After"] = after
    report["sourceHashesUnchanged"] = before == after
    report["majorWarningCount"] = sum(len(item["warnings"]) for item in report["images"].values())
    report["comparisonSheet"] = sheet_path.relative_to(ROOT).as_posix()
    report_path = QA_DIR / "effects_transparency_report.json"
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
