"""
gpu_monitor.py
==============
Pushes GPU telemetry messages to a TrainingJob's log_queue every 2 seconds
while the job is running.

If pynvml is unavailable (no NVIDIA driver, no GPU, ImportError), the monitor
still runs but pushes zeroed-out dummy data so the frontend chart doesn't break.

Message shape:
  { "type": "gpu", "data": {
      "vram_used_mb":  <int>,
      "vram_total_mb": <int>,
      "utilization":   <int 0-100>,
      "temperature":   <int celsius>
  }}
"""

from __future__ import annotations

import logging
import threading
import time

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 2.0   # seconds between GPU reads
_DUMMY_PAYLOAD = {
    "vram_used_mb":  0,
    "vram_total_mb": 0,
    "utilization":   0,
    "temperature":   0,
}


class GPUMonitor:
    """Non-critical GPU telemetry collector."""

    def start(self, job) -> None:
        """Spawn a daemon monitoring thread for *job*."""
        t = threading.Thread(
            target=self._monitor,
            args=(job,),
            name=f"gpu-mon-{job.job_id[:8]}",
            daemon=True,
        )
        t.start()

    # ──────────────────────────────────────────────────────────────────────────

    def _monitor(self, job) -> None:
        handle = None
        nvml_ok = False

        # ── Initialise pynvml ─────────────────────────────────────────────────
        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", FutureWarning)
                import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            nvml_ok = True
            logger.info("GPU monitor: NVML initialised (device 0)")
        except Exception as exc:
            logger.warning(
                "GPU monitor: pynvml unavailable — %s — will send dummy data.", exc
            )

        # ── Poll loop ─────────────────────────────────────────────────────────
        while job.status == "running":
            payload = _DUMMY_PAYLOAD.copy()

            if nvml_ok:
                try:
                    mem  = pynvml.nvmlDeviceGetMemoryInfo(handle)
                    util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                    temp = pynvml.nvmlDeviceGetTemperature(
                        handle, pynvml.NVML_TEMPERATURE_GPU
                    )
                    payload = {
                        "vram_used_mb":  mem.used  // 1_048_576,
                        "vram_total_mb": mem.total // 1_048_576,
                        "utilization":   int(util.gpu),
                        "temperature":   int(temp),
                    }
                except Exception as exc:
                    logger.debug("GPU monitor read error: %s", exc)
                    # Keep last known payload (already zeroed if first read failed)

            job.log_queue.put({"type": "gpu", "data": payload})
            time.sleep(_POLL_INTERVAL)

        # ── Cleanup ───────────────────────────────────────────────────────────
        if nvml_ok:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass
        logger.info("GPU monitor: stopped for job %s", job.job_id)
