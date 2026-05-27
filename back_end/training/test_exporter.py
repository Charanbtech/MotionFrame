"""
Quick smoke-test for dataset_exporter.export_yolo_version.
Creates a temp directory with fake images and annotations, runs the exporter,
and verifies the output folder structure.
"""
import json, os, sys, shutil, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))  # back_end/
from training.dataset_exporter import export_yolo_version, list_versions, _annotation_to_yolo

# ── test _annotation_to_yolo helpers ─────────────────────────────────────────
def test_helpers():
    # bbox
    r = _annotation_to_yolo(
        {"annotation_type": "bbox", "coordinates": json.dumps({"x": 10, "y": 20, "width": 100, "height": 80})},
        640, 480
    )
    assert r is not None, "bbox failed"
    cx, cy, w, h = r
    assert abs(cx - (10 + 50) / 640) < 1e-6
    assert abs(cy - (20 + 40) / 480) < 1e-6
    print("  bbox helper: OK", r)

    # polygon
    r2 = _annotation_to_yolo(
        {"annotation_type": "polygon", "coordinates": json.dumps({
            "points": [[10, 20], [110, 20], [110, 100], [10, 100]]
        })},
        640, 480
    )
    assert r2 is not None, "polygon failed"
    print("  polygon helper: OK", r2)

    # negative width bbox (drawn right-to-left)
    r3 = _annotation_to_yolo(
        {"annotation_type": "bbox", "coordinates": json.dumps({"x": 110, "y": 20, "width": -100, "height": 80})},
        640, 480
    )
    assert r3 is not None, "negative-width bbox failed"
    print("  neg-width bbox helper: OK", r3)

test_helpers()

# ── test export_yolo_version ──────────────────────────────────────────────────
def test_export():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        upload_dir = tmp / "uploads" / "project_99"
        versions_dir = tmp / "versions"
        upload_dir.mkdir(parents=True)

        # Create 5 fake JPEG files
        annotations = []
        for i in range(5):
            fname = f"img_{i:03d}.jpg"
            fpath = upload_dir / fname
            fpath.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 100)  # minimal JPEG header

            rel = f"project_99/{fname}"
            annotations.append({
                "image_id": i + 1,
                "filename": fname,
                "filepath": rel,
                "width": 640,
                "height": 480,
                "anns": [
                    {
                        "class_name": "dog",
                        "annotation_type": "bbox",
                        "coordinates": json.dumps({"x": 10, "y": 20, "width": 100, "height": 80}),
                    }
                ],
            })

        yaml_path = export_yolo_version(
            project_id=99,
            version_id="test_v1",
            annotations=annotations,
            class_names=["dog", "cat"],
            base_upload_dir=str(tmp / "uploads"),
            base_versions_dir=str(versions_dir),
            split=(0.6, 0.2, 0.2),
        )
        print(f"\n  yaml_path: {yaml_path}")

        vroot = Path(yaml_path).parent
        # Check folder structure
        for subset in ("train", "val", "test"):
            assert (vroot / "images" / subset).is_dir(), f"images/{subset} missing"
            assert (vroot / "labels" / subset).is_dir(), f"labels/{subset} missing"

        # Check data.yaml
        yaml_text = (vroot / "data.yaml").read_text()
        assert "nc: 2" in yaml_text, "nc wrong"
        assert "dog" in yaml_text
        print("  data.yaml: OK")

        # Check version_meta.json
        meta = json.loads((vroot / "version_meta.json").read_text())
        assert meta["total_images"] == 5
        assert meta["train_count"] + meta["val_count"] + meta["test_count"] == 5
        print("  version_meta:", meta)

        # Check label file content
        label_files = list((vroot / "labels").rglob("*.txt"))
        assert label_files, "no label files written"
        sample = label_files[0].read_text().strip()
        parts = sample.split()
        assert len(parts) == 5, f"wrong columns in label: {sample}"
        print(f"  sample label line: {sample}")

        # Test list_versions
        versions = list_versions(99, str(versions_dir))
        assert len(versions) == 1
        assert versions[0]["version_id"] == "test_v1"
        print("  list_versions: OK")

        # Test edge case: < 3 images
        try:
            export_yolo_version(
                project_id=99, version_id="bad",
                annotations=annotations[:2],
                class_names=["dog"],
                base_upload_dir=str(tmp / "uploads"),
                base_versions_dir=str(versions_dir),
            )
            assert False, "Should have raised ValueError"
        except ValueError as e:
            print(f"  <3 images guard: OK ({e})")

test_export()
print("\nAll tests passed OK")
