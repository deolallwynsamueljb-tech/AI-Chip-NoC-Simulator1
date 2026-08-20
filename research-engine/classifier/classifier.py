"""HybridClassifier: a trained RandomForest with a nearest-centroid fallback.

The fallback exists so the controller still functions (degraded, without a
calibrated confidence) if classifier/train.py has never been run and no
model file is on disk -- it is not a substitute for training, just a safety
net so the rest of the system doesn't hard-fail on a missing file.
"""

import os

from .features import features_to_vector

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "workload_classifier.joblib")
DEFAULT_CENTROIDS_PATH = os.path.join(os.path.dirname(__file__), "model", "centroids.joblib")


class NearestCentroidFallback:
    def __init__(self, centroids):
        self.centroids = centroids  # dict: label -> feature vector (list of float)

    def predict(self, vec):
        best_label, best_dist = None, float("inf")
        for label, c in self.centroids.items():
            dist = sum((a - b) ** 2 for a, b in zip(vec, c))
            if dist < best_dist:
                best_dist, best_label = dist, label
        return best_label


class HybridClassifier:
    def __init__(self, model_path=DEFAULT_MODEL_PATH, centroids_path=DEFAULT_CENTROIDS_PATH):
        self.model = None
        self.fallback = None
        if model_path and os.path.exists(model_path):
            import joblib

            self.model = joblib.load(model_path)
        if centroids_path and os.path.exists(centroids_path):
            import joblib

            self.fallback = NearestCentroidFallback(joblib.load(centroids_path))
        if self.model is None and self.fallback is None:
            raise RuntimeError(
                "no trained model and no centroids found -- run `python classifier/train.py` first"
            )

    def predict(self, feat_dict):
        """Returns (label: str, confidence: float or None). confidence is
        None when only the nearest-centroid fallback is available, since it
        has no calibrated probability."""
        vec = features_to_vector(feat_dict)
        if self.model is not None:
            proba = self.model.predict_proba([vec])[0]
            classes = list(self.model.classes_)
            best_idx = max(range(len(proba)), key=lambda i: proba[i])
            return classes[best_idx], float(proba[best_idx])
        return self.fallback.predict(vec), None
