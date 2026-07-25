from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
INPUT_DIR = ROOT / "assets" / "cats"
OUTPUT_DIR = Path(__file__).resolve().parent / "v09112"
INPUT_NAMES = ("cat_angel.png", "cat_black.png", "cat_royal.png")
FEATHER_DISTANCE = 24.0


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def estimate_background(rgb: np.ndarray) -> tuple[np.ndarray, float, dict[str, float]]:
    edge = np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1])).astype(np.float32)
    luminance = edge.mean(axis=1)
    chroma = edge.max(axis=1) - edge.min(axis=1)
    samples = edge[(luminance > 190.0) & (chroma < 22.0)]
    if len(samples) < 64:
        raise RuntimeError("外周背景色のサンプルが不足しています")
    sample_luminance = samples.mean(axis=1)
    centers = np.stack((samples[np.argmin(sample_luminance)], samples[np.argmax(sample_luminance)]))
    for _ in range(12):
        distances = ((samples[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        groups = distances.argmin(axis=1)
        next_centers = []
        for index in range(2):
            group = samples[groups == index]
            if not len(group):
                raise RuntimeError("外周背景色を2色へ安定して分離できません")
            next_centers.append(group.mean(axis=0))
        centers = np.stack(next_centers)
    edge_distance = np.sqrt(((samples[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)).min(axis=1)
    percentile_995 = float(np.percentile(edge_distance, 99.5))
    strict_threshold = float(np.clip(percentile_995 + 2.5, 10.0, 16.0))
    return centers, strict_threshold, {
        "edgeSampleCount": int(len(samples)),
        "edgeDistanceP995": round(percentile_995, 3),
        "strictThreshold": round(strict_threshold, 3),
        "softThreshold": round(strict_threshold + FEATHER_DISTANCE, 3),
    }


def border_connected(candidate: np.ndarray) -> np.ndarray:
    height, width = candidate.shape
    padded = Image.new("L", (width + 2, height + 2), 255)
    padded.paste(Image.fromarray(np.where(candidate, 255, 0).astype(np.uint8), "L"), (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128, thresh=0)
    return np.asarray(padded, dtype=np.uint8)[1:-1, 1:-1] == 128


def smoothstep(value: np.ndarray) -> np.ndarray:
    clipped = np.clip(value, 0.0, 1.0)
    return clipped * clipped * (3.0 - 2.0 * clipped)


def dilate(mask: np.ndarray, size: int) -> np.ndarray:
    image = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L")
    return np.asarray(image.filter(ImageFilter.MaxFilter(size)), dtype=np.uint8) > 0


def connected_from_center(foreground: np.ndarray) -> np.ndarray:
    height, width = foreground.shape
    if not foreground.any():
        return np.zeros_like(foreground)
    mask = Image.fromarray(np.where(foreground, 255, 0).astype(np.uint8), "L")
    density = np.asarray(mask.filter(ImageFilter.BoxBlur(14)), dtype=np.uint8).copy()
    central = np.zeros_like(foreground)
    central[height // 4:height * 3 // 4, width // 4:width * 3 // 4] = True
    density[~central | ~foreground] = 0
    seed_y, seed_x = np.unravel_index(int(density.argmax()), density.shape)
    ImageDraw.floodfill(mask, (int(seed_x), int(seed_y)), 128, thresh=0)
    return np.asarray(mask, dtype=np.uint8) == 128


def make_transparent(rgb: np.ndarray) -> tuple[np.ndarray, dict[str, object]]:
    centers, strict_threshold, background_stats = estimate_background(rgb)
    pixels = rgb.astype(np.float32)
    distances = np.sqrt(((pixels[:, :, None, :] - centers[None, None, :, :]) ** 2).sum(axis=3))
    nearest_center = distances.argmin(axis=2)
    distance = distances.min(axis=2)
    soft_threshold = strict_threshold + FEATHER_DISTANCE
    foreground_core = distance > soft_threshold
    connectivity_barrier = dilate(foreground_core, 5)
    strict_candidate = distance <= strict_threshold
    soft_candidate = distance <= soft_threshold
    strict_connected = border_connected(strict_candidate & ~connectivity_barrier)
    soft_connected = border_connected(soft_candidate & ~connectivity_barrier)
    strict_connected |= dilate(strict_connected, 3) & strict_candidate & ~foreground_core
    soft_connected |= dilate(soft_connected, 5) & soft_candidate & ~foreground_core
    alpha = np.full(distance.shape, 255, dtype=np.uint8)
    alpha[strict_connected] = 0
    feather = soft_connected & ~strict_connected
    feather_value = smoothstep((distance - strict_threshold) / FEATHER_DISTANCE)
    alpha[feather] = np.rint(feather_value[feather] * 255.0).astype(np.uint8)

    output_rgb = rgb.copy()
    semi = (alpha > 0) & (alpha < 255)
    if semi.any():
        opacity = alpha[semi].astype(np.float32)[:, None] / 255.0
        background = centers[nearest_center[semi]]
        observed = pixels[semi]
        recovered = (observed - background * (1.0 - opacity)) / np.maximum(opacity, 0.08)
        output_rgb[semi] = np.rint(np.clip(recovered, 0.0, 255.0)).astype(np.uint8)

    main_component = connected_from_center(alpha > 0)
    luminance = pixels.mean(axis=2)
    chroma = pixels.max(axis=2) - pixels.min(axis=2)
    height, width = alpha.shape
    yy, xx = np.indices(alpha.shape)
    outer_band = (xx < width * 0.04) | (xx >= width * 0.96) | (yy < height * 0.04) | (yy >= height * 0.96)
    decorative_protection = dilate(chroma >= 30.0, 31)
    isolated_noise = (alpha > 0) & ~main_component & outer_band & (chroma < 30.0) & ~decorative_protection
    isolated_noise_removed = int(isolated_noise.sum())
    alpha[isolated_noise] = 0

    rgba = np.dstack((output_rgb, alpha))
    ys, xs = np.nonzero(alpha > 0)
    bbox = None if not len(xs) else [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    fully_transparent = int((alpha == 0).sum())
    semi_transparent = int(((alpha > 0) & (alpha < 255)).sum())
    fully_opaque = int((alpha == 255).sum())
    total = int(alpha.size)
    central = alpha[alpha.shape[0] // 4:alpha.shape[0] * 3 // 4, alpha.shape[1] // 4:alpha.shape[1] * 3 // 4]
    transparent_ratio = fully_transparent / total
    warnings = []
    if transparent_ratio > 0.85:
        warnings.append("透明画素率が85%を超えています")
    if bbox and ((bbox[2] - bbox[0]) < rgb.shape[1] * 0.30 or (bbox[3] - bbox[1]) < rgb.shape[0] * 0.30):
        warnings.append("不透明部分の境界ボックスが極端に小さい可能性があります")
    if float((central == 0).mean()) > 0.45:
        warnings.append("画像中央部の透明領域が大きい可能性があります")
    return rgba, {
        "backgroundCentersRgb": [[round(float(value), 3) for value in center] for center in centers],
        "backgroundEstimation": background_stats,
        "fullyTransparentPixels": fully_transparent,
        "semiTransparentPixels": semi_transparent,
        "fullyOpaquePixels": fully_opaque,
        "transparentRatio": round(transparent_ratio, 6),
        "opaqueBoundingBox": bbox,
        "centralTransparentRatio": round(float((central == 0).mean()), 6),
        "opaqueRgbUnchanged": bool(np.array_equal(output_rgb[alpha == 255], rgb[alpha == 255])),
        "isolatedNoisePixelsRemoved": isolated_noise_removed,
        "warnings": warnings,
    }


def checkerboard(size: tuple[int, int], square: int = 16) -> Image.Image:
    width, height = size
    yy, xx = np.indices((height, width))
    values = np.where(((xx // square) + (yy // square)) % 2 == 0, 238, 207).astype(np.uint8)
    return Image.fromarray(np.dstack((values, values, values)), "RGB")


def composite(rgba: Image.Image, background: Image.Image) -> Image.Image:
    result = background.convert("RGBA")
    result.alpha_composite(rgba)
    return result.convert("RGB")


def fit_panel(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    panel = Image.new("RGB", size, "#151b36")
    copy = image.copy()
    copy.thumbnail((size[0] - 12, size[1] - 12), Image.Resampling.LANCZOS)
    panel.paste(copy, ((size[0] - copy.width) // 2, (size[1] - copy.height) // 2))
    return panel


def make_comparison(rows: list[tuple[str, Image.Image, Image.Image]]) -> Image.Image:
    panel_size, label_height, row_label_width, margin = (238, 238), 28, 132, 12
    columns = ("Original", "Checker", "White", "Navy", "Alpha mask")
    width = row_label_width + len(columns) * (panel_size[0] + margin) + margin
    height = label_height + len(rows) * (panel_size[1] + label_height + margin) + margin
    sheet = Image.new("RGB", (width, height), "#0b1024")
    draw, font = ImageDraw.Draw(sheet), ImageFont.load_default()
    for index, title in enumerate(columns):
        draw.text((row_label_width + index * (panel_size[0] + margin) + 4, 8), title, fill="white", font=font)
    for row_index, (name, original, transparent) in enumerate(rows):
        y = label_height + row_index * (panel_size[1] + label_height + margin)
        draw.text((10, y + 10), name, fill="white", font=font)
        alpha = transparent.getchannel("A")
        views = (
            original.convert("RGB"),
            composite(transparent, checkerboard(transparent.size)),
            composite(transparent, Image.new("RGB", transparent.size, "white")),
            composite(transparent, Image.new("RGB", transparent.size, "#071127")),
            Image.merge("RGB", (alpha, alpha, alpha)),
        )
        for column_index, view in enumerate(views):
            x = row_label_width + column_index * (panel_size[0] + margin)
            sheet.paste(fit_panel(view, panel_size), (x, y))
    return sheet


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    hashes_before = {name: sha256(INPUT_DIR / name) for name in INPUT_NAMES}
    report: dict[str, object] = {
        "testVersion": "v09112",
        "method": "adaptive two-color perimeter clustering and border-connected background removal",
        "featherDistance": FEATHER_DISTANCE,
        "images": {},
    }
    comparison_rows = []
    for name in INPUT_NAMES:
        source_path = INPUT_DIR / name
        output_path = OUTPUT_DIR / name.replace(".png", "_transparent.png")
        with Image.open(source_path) as source:
            if source.format != "PNG":
                raise RuntimeError(f"{name} はPNGではありません")
            original = source.convert("RGB")
        rgba_array, metrics = make_transparent(np.asarray(original, dtype=np.uint8))
        transparent = Image.fromarray(rgba_array, "RGBA")
        transparent.save(output_path, format="PNG", optimize=True)
        with Image.open(output_path) as decoded:
            decoded.load()
            decode_ok = decoded.format == "PNG" and decoded.mode == "RGBA"
            output_size = list(decoded.size)
            has_alpha = "A" in decoded.getbands()
        metrics.update({
            "sourcePath": source_path.relative_to(ROOT).as_posix(),
            "outputPath": output_path.relative_to(ROOT).as_posix(),
            "sourceSize": list(original.size),
            "outputSize": output_size,
            "sourceSha256Before": hashes_before[name],
            "outputSha256": sha256(output_path),
            "outputFileBytes": output_path.stat().st_size,
            "pngDecodeOk": decode_ok,
            "hasAlphaChannel": has_alpha,
        })
        report["images"][name] = metrics
        comparison_rows.append((name.removesuffix(".png"), original, transparent))
    comparison_path = OUTPUT_DIR / "comparison_sheet.png"
    make_comparison(comparison_rows).save(comparison_path, format="PNG", optimize=True)
    hashes_after = {name: sha256(INPUT_DIR / name) for name in INPUT_NAMES}
    report["sourceHashesUnchanged"] = hashes_before == hashes_after
    report["sourceSha256After"] = hashes_after
    report["comparisonSheet"] = comparison_path.relative_to(ROOT).as_posix()
    report_path = OUTPUT_DIR / "transparency_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if hashes_before != hashes_after:
        raise RuntimeError("元画像のハッシュが変化しました")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
