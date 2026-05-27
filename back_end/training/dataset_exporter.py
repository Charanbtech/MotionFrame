"""
dataset_exporter.py
===================
Exports annotated project images into a versioned YOLO dataset on disk.

Folder layout produced:
    back_end/versions/{project_id}/{version_id}/
        images/train/   images/val/   images/test/
        labels/train/   labels/val/   labels/test/
        data.yaml
        version_meta.json

YOLO label format (detection):
    <class_id>  <cx>  <cy>  <w>  <h>    (all values normalised 0.0–1.0)

Polygon / brush annotations are converted to their axis-aligned bounding box
so the exported dataset is always detection-compatible.
"""

from __future__ import annotations

import json
import random
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

# ─── public API ──────────────────────────────────────────────────────────────

def export_yolo_version(
    project_id: int,
    version_id: str,
    annotations: List[dict],
    class_names: List[str],
    base_upload_dir: str,
    base_versions_dir: str,
    split: Tuple[float, float, float] = (0.8, 0.1, 0.1),
) -> str:
    """
    Export a YOLO training version for *project_id*.

    Parameters
    ----------
    project_id       : database id of the project
    version_id       : caller-supplied string label (e.g. "v1", "v1-2024-05-08")
    annotations      : list of image-dicts produced by _collect_annotations()
                       Each dict:
                           { image_id, filename, filepath, width, height,
                             anns: [ {class_name, annotation_type, coordinates} ] }
    class_names      : ordered list of class name strings
    base_upload_dir  : absolute path to back_end/uploads/
    base_versions_dir: absolute path to back_end/versions/
    split            : (train_ratio, val_ratio, test_ratio) – must sum ≤ 1.0

    Returns
    -------
    Absolute path to data.yaml as a string.

    Raises
    ------
    ValueError  if fewer than 3 annotated images are available (need at least
                1 per split bucket).
    """

    upload_root = Path(base_upload_dir)
    version_root = Path(base_versions_dir) / str(project_id) / version_id
    version_root.mkdir(parents=True, exist_ok=True)

    # ── validate split ────────────────────────────────────────────────────────
    train_r, val_r, test_r = split
    if abs(train_r + val_r + test_r - 1.0) > 1e-6:
        raise ValueError(
            f"Split ratios must sum to 1.0, got {train_r + val_r + test_r:.4f}"
        )

    # ── filter images that have at least one convertible annotation ───────────
    exportable = [img for img in annotations if _has_valid_annotation(img)]

    if len(exportable) < 3:
        raise ValueError(
            f"Need at least 3 annotated images to generate a version "
            f"(found {len(exportable)}). Add more annotations and try again."
        )

    # ── shuffle & split ───────────────────────────────────────────────────────
    random.shuffle(exportable)
    n = len(exportable)
    
    if n < 10:
        # For toy datasets, reuse all images across train/val/test 
        # to prevent YOLO Batch Normalization crashes (needs >1 image per batch)
        train_imgs = exportable.copy()
        val_imgs   = exportable.copy()
        test_imgs  = exportable.copy()
    else:
        n_train = max(2, round(n * train_r)) # at least 2 for batchnorm
        n_val   = max(1, round(n * val_r))
        n_test  = max(1, n - n_train - n_val)

        # Adjust n_train downward if we over-allocated, but keep at least 2
        if n_train + n_val + n_test > n:
            n_val = max(1, (n - 2) // 2)
            n_test = max(1, n - 2 - n_val)
            n_train = n - n_val - n_test

        train_imgs = exportable[:n_train]
        val_imgs   = exportable[n_train:n_train + n_val]
        test_imgs  = exportable[n_train + n_val: n_train + n_val + n_test]

    splits = {"train": train_imgs, "val": val_imgs, "test": test_imgs}

    # ── create directory skeleton ─────────────────────────────────────────────
    for subset in ("train", "val", "test"):
        (version_root / "images" / subset).mkdir(parents=True, exist_ok=True)
        (version_root / "labels" / subset).mkdir(parents=True, exist_ok=True)

    # ── copy images + write label files ──────────────────────────────────────
    class_index = {name: idx for idx, name in enumerate(class_names)}
    skipped = 0

    for subset, img_list in splits.items():
        img_out_dir   = version_root / "images" / subset
        label_out_dir = version_root / "labels" / subset

        for img_info in img_list:
            src_path = upload_root / img_info["filepath"]
            if not src_path.exists():
                skipped += 1
                continue

            # Copy image
            dst_img = img_out_dir / img_info["filename"]
            shutil.copy2(src_path, dst_img)

            # Build label file
            label_lines = _build_label_lines(img_info, class_index)
            if label_lines:
                label_filename = Path(img_info["filename"]).stem + ".txt"
                (label_out_dir / label_filename).write_text(
                    "\n".join(label_lines) + "\n", encoding="utf-8"
                )
            # Images without any convertible annotation are copied but get no .txt
            # (YOLO handles missing label files gracefully)

    # ── data.yaml ─────────────────────────────────────────────────────────────
    yaml_path = version_root / "data.yaml"
    yaml_content = (
        f"path: {version_root.as_posix()}\n"
        f"train: images/train\n"
        f"val:   images/val\n"
        f"test:  images/test\n"
        f"\n"
        f"nc: {len(class_names)}\n"
        f"names: {json.dumps(class_names)}\n"
    )
    yaml_path.write_text(yaml_content, encoding="utf-8")

    # ── version_meta.json ─────────────────────────────────────────────────────
    meta = {
        "version_id":   version_id,
        "project_id":   project_id,
        "created_at":   datetime.utcnow().isoformat() + "Z",
        "total_images": len(exportable),
        "train_count":  len(train_imgs),
        "val_count":    len(val_imgs),
        "test_count":   len(test_imgs),
        "skipped":      skipped,
        "class_names":  class_names,
        "split_ratios": {"train": train_r, "val": val_r, "test": test_r},
        "data_yaml_path": str(yaml_path),
    }
    (version_root / "version_meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    return str(yaml_path)


def list_versions(project_id: int, base_versions_dir: str) -> List[dict]:
    """
    Return a list of version_meta dicts for *project_id*, newest first.
    Returns [] if no versions exist yet.
    """
    versions_root = Path(base_versions_dir) / str(project_id)
    if not versions_root.exists():
        return []

    metas = []
    for meta_file in versions_root.glob("*/version_meta.json"):
        try:
            metas.append(json.loads(meta_file.read_text(encoding="utf-8")))
        except Exception:
            pass  # corrupt file – skip silently

    metas.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return metas


# ─── internal helpers ─────────────────────────────────────────────────────────

def _has_valid_annotation(img_info: dict) -> bool:
    """Return True if the image has at least one annotation we can convert."""
    for ann in img_info.get("anns", []):
        if _annotation_to_yolo(ann, img_info["width"], img_info["height"]) is not None:
            return True
    return False


def _build_label_lines(img_info: dict, class_index: dict) -> List[str]:
    """Return list of YOLO label strings for one image."""
    lines = []
    w_img = img_info["width"]
    h_img = img_info["height"]

    if w_img <= 0 or h_img <= 0:
        return lines

    for ann in img_info.get("anns", []):
        cls_name = ann.get("class_name", "")
        if cls_name not in class_index:
            continue  # unknown class – skip

        yolo = _annotation_to_yolo(ann, w_img, h_img)
        if yolo is None:
            continue

        cx, cy, bw, bh = yolo
        # Clamp to [0, 1]
        cx = max(0.0, min(1.0, cx))
        cy = max(0.0, min(1.0, cy))
        bw = max(0.0, min(1.0, bw))
        bh = max(0.0, min(1.0, bh))

        if bw <= 0 or bh <= 0:
            continue

        cid = class_index[cls_name]
        lines.append(f"{cid} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

    return lines


def _annotation_to_yolo(
    ann: dict, img_w: int, img_h: int
) -> Optional[Tuple[float, float, float, float]]:
    """
    Convert one annotation dict to normalised (cx, cy, w, h).
    Returns None if the annotation cannot be converted (invalid / unsupported).

    Supported annotation_type values:
      - 'bbox'    : {x, y, width, height}  (pixel, top-left origin)
      - 'polygon' : {points: [[x,y],...] or [{x,y},...]}
      - 'brush'   : {points: [...], brushSize: N}
                    → converted via axis-aligned bounding box of the stroke
    """
    if img_w <= 0 or img_h <= 0:
        return None

    ann_type = ann.get("annotation_type", "")
    try:
        coords = ann.get("coordinates")
        if isinstance(coords, str):
            coords = json.loads(coords)
        if not coords:
            return None
    except Exception:
        return None

    # ── bbox ──────────────────────────────────────────────────────────────────
    if ann_type == "bbox":
        x  = float(coords.get("x", 0))
        y  = float(coords.get("y", 0))
        bw = float(coords.get("width", 0))
        bh = float(coords.get("height", 0))

        # Handle negative width/height (drawn right-to-left / bottom-to-top)
        if bw < 0:
            x += bw
            bw = abs(bw)
        if bh < 0:
            y += bh
            bh = abs(bh)

        if bw < 1 or bh < 1:
            return None

        cx = (x + bw / 2) / img_w
        cy = (y + bh / 2) / img_h
        return cx, cy, bw / img_w, bh / img_h

    # ── polygon / brush → bounding box ───────────────────────────────────────
    if ann_type in ("polygon", "brush"):
        raw_pts = coords.get("points", [])
        if not raw_pts or len(raw_pts) < 2:
            return None

        xs, ys = [], []
        for pt in raw_pts:
            if isinstance(pt, dict):
                xs.append(float(pt.get("x", 0)))
                ys.append(float(pt.get("y", 0)))
            elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                xs.append(float(pt[0]))
                ys.append(float(pt[1]))

        if not xs:
            return None

        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        bw = x_max - x_min
        bh = y_max - y_min

        if bw < 1 or bh < 1:
            return None

        cx = (x_min + bw / 2) / img_w
        cy = (y_min + bh / 2) / img_h
        return cx, cy, bw / img_w, bh / img_h

    return None  # unsupported type
