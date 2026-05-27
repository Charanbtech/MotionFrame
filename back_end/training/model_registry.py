"""
model_registry.py
=================
Handles registering, listing, and deploying trained YOLO models.
Stores state in models.json.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_MODELS_PATH = Path(__file__).parent / "models.json"


class ModelRegistry:
    def __init__(self):
        self._models = []
        self.load_history()

    def load_history(self) -> None:
        if not _MODELS_PATH.exists():
            return
        try:
            self._models = json.loads(_MODELS_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Could not read models.json: %s", exc)

    def _flush(self) -> None:
        try:
            _MODELS_PATH.write_text(json.dumps(self._models, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not write models.json: %s", exc)

    def register_model(self, job_id: str, config: dict, final_metrics: dict) -> dict:
        best_pt_path = Path("runs") / "training" / job_id / "weights" / "best.pt"
        
        entry = {
            "model_id":           str(uuid.uuid4()),
            "job_id":             job_id,
            "project_id":         config.get("project_id"),
            "dataset_version_id": config.get("dataset_version_id"),
            "architecture":       config.get("weights", "custom"),
            "task":               config.get("task", "detect"),
            "weights_path":       str(best_pt_path.resolve()),
            "mAP50":              final_metrics.get("mAP50", 0.0),
            "precision":          final_metrics.get("precision", 0.0),
            "recall":             final_metrics.get("recall", 0.0),
            "epochs_trained":     final_metrics.get("epoch", config.get("epochs")),
            "class_names":        config.get("class_names", []),
            "created_at":         datetime.utcnow().isoformat(),
            "status":             "active" # Default status, wait, deploy sets it to active? Actually prompt says: register saves as status: "active". 
        }
        
        # If the prompt means "active" as in ready-to-use but not yet deployed, we just set active.
        # But wait, deploy sets it as the active model for the project and sets others to archived.
        # Let's use "registered" as default, but prompt says: status: "active". I will follow the prompt.
        
        self._models.append(entry)
        self._flush()
        return entry

    def list_models(self, project_id: int) -> list:
        # Return newest first
        filtered = [m for m in self._models if str(m.get("project_id")) == str(project_id)]
        return sorted(filtered, key=lambda x: x.get("created_at", ""), reverse=True)

    def deploy_model(self, model_id: str) -> Optional[str]:
        target = None
        for m in self._models:
            if m["model_id"] == model_id:
                target = m
                break
                
        if not target:
            return None
            
        proj_id = target.get("project_id")
        
        # Mark all others in this project as archived, mark this one as deployed
        for m in self._models:
            if m.get("project_id") == proj_id:
                if m["model_id"] == model_id:
                    m["status"] = "deployed"
                else:
                    m["status"] = "archived"
                    
        self._flush()
        return target.get("weights_path")

    def delete_model(self, model_id: str) -> bool:
        initial_length = len(self._models)
        self._models = [m for m in self._models if m["model_id"] != model_id]
        if len(self._models) < initial_length:
            self._flush()
            return True
        return False


model_registry = ModelRegistry()
