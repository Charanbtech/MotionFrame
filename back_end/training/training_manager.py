"""
training_manager.py
===================
Module-level singleton that owns all TrainingJob instances.

Rules:
  • Only ONE job may be in status "running" at a time.
  • Job summaries are persisted to training_history.json so they survive
    server restarts (though the running thread itself is lost on restart).

Usage:
    from training.training_manager import training_manager

    job_id = training_manager.create_and_start(config_dict)
    job    = training_manager.get(job_id)
    all    = training_manager.list_all()
"""

from __future__ import annotations

import json
import logging
import queue
from datetime import datetime
from pathlib import Path
from typing import Optional

from training.training_job import TrainingJob
from training.gpu_monitor   import GPUMonitor

logger = logging.getLogger(__name__)

_HISTORY_PATH = Path(__file__).parent / "training_history.json"


class TrainingManager:
    """Manages the lifecycle of all training jobs."""

    def __init__(self):
        self._jobs: dict[str, TrainingJob] = {}
        self.load_history()

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    def create_and_start(self, config: dict) -> str:
        """
        Create a new TrainingJob and start it immediately.

        Raises:
            RuntimeError if any job is currently running.
        """
        active = self.get_active()
        if active is not None:
            raise RuntimeError(
                f"Training job '{active.job_id}' is already running. "
                "Stop it before starting a new one."
            )

        job = TrainingJob(config)
        self._jobs[job.job_id] = job

        # Persist metadata before starting (so we don't lose it on crash)
        self._append_history(job)

        # Start training and GPU monitoring
        job.start()
        GPUMonitor().start(job)

        logger.info("Training job started: %s", job.job_id)
        return job.job_id

    def get(self, job_id: str) -> Optional[TrainingJob]:
        return self._jobs.get(job_id)

    def get_active(self) -> Optional[TrainingJob]:
        for job in self._jobs.values():
            if job.status == "running":
                return job
        return None

    def list_all(self) -> list:
        """Return summaries for all known jobs, newest first."""
        jobs = sorted(
            self._jobs.values(),
            key=lambda j: j.start_time or datetime.min,
            reverse=True,
        )
        return [j.to_summary() for j in jobs]

    # ──────────────────────────────────────────────────────────────────────────
    # History persistence
    # ──────────────────────────────────────────────────────────────────────────

    def load_history(self) -> None:
        """
        Load job summaries from disk on startup.
        Jobs that were in "running" or "pending" state when the server last
        stopped are marked "error" (their threads are gone).
        """
        if not _HISTORY_PATH.exists():
            return

        try:
            records: list = json.loads(_HISTORY_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Could not read training history: %s", exc)
            return

        for entry in records:
            job_id = entry.get("job_id")
            if not job_id or job_id in self._jobs:
                continue

            # Rebuild a lightweight stub (no live thread / queue needed)
            stub = TrainingJob.__new__(TrainingJob)
            stub.job_id     = job_id
            stub.config     = entry.get("config", {})
            stub.log_queue  = queue.Queue()
            stub._stop_flag = False
            stub._thread    = None

            raw_status = entry.get("status", "done")
            # A "running"/"pending" job from a previous server run is dead
            stub.status = "error" if raw_status in ("running", "pending") else raw_status

            stub.start_time = (
                datetime.fromisoformat(entry["start_time"])
                if entry.get("start_time") else None
            )
            stub.end_time = (
                datetime.fromisoformat(entry["end_time"])
                if entry.get("end_time") else None
            )

            self._jobs[job_id] = stub

        logger.info("Training history loaded: %d records", len(records))

    def _append_history(self, job: TrainingJob) -> None:
        """Append a job's initial summary to the history file."""
        history: list = []
        if _HISTORY_PATH.exists():
            try:
                history = json.loads(_HISTORY_PATH.read_text(encoding="utf-8"))
            except Exception:
                pass

        # Remove stale entry if this job_id already appears (shouldn't happen)
        history = [h for h in history if h.get("job_id") != job.job_id]
        history.append(job.to_summary())

        try:
            _HISTORY_PATH.write_text(json.dumps(history, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not write training history: %s", exc)

    def _flush_history(self) -> None:
        """Rewrite the entire history file from current in-memory state."""
        try:
            records = [j.to_summary() for j in self._jobs.values()]
            _HISTORY_PATH.write_text(json.dumps(records, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not flush training history: %s", exc)


# ── Module-level singleton ─────────────────────────────────────────────────────
training_manager = TrainingManager()
