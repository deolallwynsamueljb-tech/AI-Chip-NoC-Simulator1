"""Build a labeled dataset of sliding-window traffic features from the four
real workload generators, train a RandomForest on it, and save both the
model and per-class nearest centroids (for HybridClassifier's fallback path).

Run as: python classifier/train.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

from classifier.features import extract_features, features_to_vector
from workloads.resnet18 import generate_resnet18_trace
from workloads.bert import generate_bert_trace
from workloads.gemm import generate_gemm_trace
from workloads.sparse_gemm import generate_sparse_gemm_trace

WINDOW_CYCLES = 100
STRIDE_CYCLES = 40
MIN_EVENTS_PER_WINDOW = 3

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")

GENERATORS = {
    "resnet18": generate_resnet18_trace,
    "bert": generate_bert_trace,
    "gemm": generate_gemm_trace,
    "sparse_gemm": generate_sparse_gemm_trace,
}


def sliding_windows(events, window, stride, min_events):
    if not events:
        return []
    max_cycle = max(e.inject_cycle for e in events)
    windows = []
    start = 0
    while start <= max_cycle:
        w = [e for e in events if start <= e.inject_cycle < start + window]
        if len(w) >= min_events:
            windows.append(w)
        start += stride
    return windows


def build_dataset(dim=4):
    X, y = [], []
    class_counts = {}
    for label, gen in GENERATORS.items():
        events = gen(dim=dim)
        windows = sliding_windows(events, WINDOW_CYCLES, STRIDE_CYCLES, MIN_EVENTS_PER_WINDOW)
        class_counts[label] = len(windows)
        for w in windows:
            feat = extract_features(w, dim=dim)
            if feat is None:
                continue
            X.append(features_to_vector(feat))
            y.append(label)
    return np.array(X), np.array(y), class_counts


def main(dim=4, seed=0):
    X, y, class_counts = build_dataset(dim=dim)
    print("window samples per class:", class_counts)
    print("total samples:", len(y))

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=seed, stratify=y
    )
    clf = RandomForestClassifier(n_estimators=150, random_state=seed)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    labels_sorted = sorted(set(y))
    cm = confusion_matrix(y_test, y_pred, labels=labels_sorted)
    report = classification_report(y_test, y_pred, labels=labels_sorted, zero_division=0)

    print(f"test accuracy: {acc:.4f}")
    print("labels:", labels_sorted)
    print("confusion matrix:\n", cm)
    print(report)

    importances = dict(zip(sorted(X.dtype.names or []) or [], []))  # placeholder, replaced below
    from classifier.features import FEATURE_NAMES

    importances = dict(zip(FEATURE_NAMES, clf.feature_importances_.tolist()))
    print("feature importances:", importances)

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(clf, os.path.join(MODEL_DIR, "workload_classifier.joblib"))

    centroids = {}
    for label in labels_sorted:
        rows = X[y == label]
        centroids[label] = rows.mean(axis=0).tolist()
    joblib.dump(centroids, os.path.join(MODEL_DIR, "centroids.joblib"))

    return {
        "accuracy": acc,
        "labels": labels_sorted,
        "confusion_matrix": cm.tolist(),
        "class_counts": class_counts,
        "feature_importances": importances,
    }


if __name__ == "__main__":
    main()
