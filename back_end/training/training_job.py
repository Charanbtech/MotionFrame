"""
training_job.py
===============
Represents a single YOLO training run.

Each TrainingJob:
  - Is assigned a uuid4 job_id
  - Runs model.train() in a daemon background thread
  - Publishes structured messages to a thread-safe queue
  - Can be stopped cleanly via stop()

Message shapes pushed to log_queue
-----------------------------------
  { "type": "metrics", "data": { epoch, total_epochs, box_loss, cls_loss,
                                  dfl_loss, mAP50, mAP50_95, precision, recall } }
  { "type": "gpu",     "data": { vram_used_mb, vram_total_mb, utilization, temperature } }
  { "type": "done",    "data": { best_weights, final_metrics } }
  { "type": "stopped", "data": {} }
  { "type": "error",   "message": "<traceback>" }
"""

from __future__ import annotations

import logging
import queue
import threading
import uuid
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class TrainingJob:
    """Encapsulates a single YOLO training run."""

    def __init__(self, config: dict):
        self.job_id:    str      = str(uuid.uuid4())
        self.config:    dict     = config
        self.status:    str      = "pending"
        self.log_queue: queue.Queue = queue.Queue()
        self.metrics_history: list  = []
        self.start_time: datetime = datetime.utcnow()
        self.end_time:   datetime | None = None

        self._stop_flag: bool = False
        self._thread:    threading.Thread | None = None

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    def start(self) -> None:
        """Spawn the background training thread."""
        self._thread = threading.Thread(
            target=self._run, name=f"train-{self.job_id[:8]}", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        """
        Request a clean stop.
        The on_train_epoch_end callback checks _stop_flag and sets trainer.stop,
        causing ultralytics to exit after the current epoch finishes.
        """
        self._stop_flag = True

    def to_summary(self) -> dict:
        return {
            "job_id":     self.job_id,
            "status":     self.status,
            "config": {
                "weights":        self.config.get("weights"),
                "epochs":         self.config.get("epochs"),
                "imgsz":          self.config.get("imgsz"),
                "batch":          self.config.get("batch"),
                "task":           self.config.get("task"),
                "data_yaml_path": self.config.get("data_yaml_path"),
            },
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time":   self.end_time.isoformat()   if self.end_time   else None,
            "metrics_history": getattr(self, "metrics_history", []),
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Internal
    # ──────────────────────────────────────────────────────────────────────────

    def _run(self) -> None:
        self.status = "running"
        try:
            self._do_train()
        except KeyboardInterrupt:
            self.status   = "stopped"
            self.end_time = datetime.utcnow()
            self.log_queue.put({"type": "stopped", "data": {}})
        except BaseException as exc:
            import traceback
            self.status   = "error"
            self.end_time = datetime.utcnow()
            logger.exception("Training job %s failed", self.job_id)
            self.log_queue.put({"type": "error", "message": traceback.format_exc()})
            # Flush history so disk state is updated
            from training.training_manager import training_manager
            training_manager._flush_history()

    def _do_train(self) -> None:
        try:
            from ultralytics import YOLO
        except ImportError:
            raise RuntimeError(
                "ultralytics is not installed. "
                "Run: pip install ultralytics"
            )

        weights = self.config.get("weights")

        # ── Load model ────────────────────────────────────────────────────────
        if weights is None:
            # From scratch: create model from YAML architecture (no pretrained weights)
            task = self.config.get("task", "detect")
            yaml_name = "yolov8n-seg.yaml" if task == "segment" else "yolov8n.yaml"
            logger.info("Training from scratch — using architecture: %s", yaml_name)
            model = YOLO(yaml_name)
        else:
            logger.info("Loading pretrained weights: %s", weights)
            model = YOLO(weights)

        job_ref = self  # captured by callbacks

        # ── Callbacks ─────────────────────────────────────────────────────────

        def on_train_epoch_end(trainer) -> None:
            # Honour stop flag → tell ultralytics to stop after this epoch
            if job_ref._stop_flag:
                trainer.stop = True

            epoch = int(trainer.epoch) + 1          # 1-indexed for display
            total = int(trainer.epochs)

            # Loss items are a list/tuple: [box_loss, cls_loss, dfl_loss]
            li = trainer.loss_items if hasattr(trainer, "loss_items") else []
            try:
                li = [float(v) for v in li]
            except Exception:
                li = []

            box_loss = li[0] if len(li) > 0 else 0.0
            cls_loss = li[1] if len(li) > 1 else 0.0
            dfl_loss = li[2] if len(li) > 2 else 0.0

            # Metrics (populated after validation runs on this epoch)
            m: dict = trainer.metrics if hasattr(trainer, "metrics") and trainer.metrics else {}

            metrics_data = {
                "epoch":        epoch,
                "total_epochs": total,
                "box_loss":     round(box_loss, 5),
                "cls_loss":     round(cls_loss, 5),
                "dfl_loss":     round(dfl_loss, 5),
                "mAP50":        round(float(m.get("metrics/mAP50(B)",    0.0)), 5),
                "mAP50_95":     round(float(m.get("metrics/mAP50-95(B)", 0.0)), 5),
                "precision":    round(float(m.get("metrics/precision(B)", 0.0)), 5),
                "recall":       round(float(m.get("metrics/recall(B)",    0.0)), 5),
            }
            if not hasattr(job_ref, "metrics_history"):
                job_ref.metrics_history = []
            job_ref.metrics_history.append(metrics_data)

            job_ref.log_queue.put({
                "type": "metrics",
                "data": metrics_data,
            })

        def on_train_end(trainer) -> None:
            best_pt = (
                Path("runs") / "training" / job_ref.job_id / "weights" / "best.pt"
            )
            m: dict = trainer.metrics if hasattr(trainer, "metrics") and trainer.metrics else {}

            job_ref.log_queue.put({
                "type": "done",
                "data": {
                    "best_weights": str(best_pt.resolve()),
                    "final_metrics": {
                        "mAP50":     round(float(m.get("metrics/mAP50(B)",    0.0)), 5),
                        "mAP50_95":  round(float(m.get("metrics/mAP50-95(B)", 0.0)), 5),
                        "precision": round(float(m.get("metrics/precision(B)", 0.0)), 5),
                        "recall":    round(float(m.get("metrics/recall(B)",    0.0)), 5),
                    },
                },
            })
            job_ref.status   = "done"
            job_ref.end_time = datetime.utcnow()
            
            # Flush history
            from training.training_manager import training_manager
            training_manager._flush_history()

        model.add_callback("on_train_epoch_end", on_train_epoch_end)
        model.add_callback("on_train_end",       on_train_end)

        # ── Kick off training ─────────────────────────────────────────────────
        data_yaml = self.config.get("data_yaml_path") or self.config.get("data_yaml", "")

        train_kwargs: dict = {
            "data":     data_yaml,
            "epochs":   int(self.config.get("epochs",   100)),
            "imgsz":    int(self.config.get("imgsz",    640)),
            "batch":    int(self.config.get("batch",    -1)),
            "patience": int(self.config.get("patience", 50)),
            "project":  str((Path("runs") / "training").resolve()),
            "name":     self.job_id,
            "exist_ok": True,
            "verbose":  True,
        }

        task = self.config.get("task", "detect")
        if task != "detect":
            train_kwargs["task"] = task

        logger.info("Starting model.train() — job %s", self.job_id)
        model.train(**train_kwargs)
