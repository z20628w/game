"""Cartoonify algorithms built on OpenCV.

Each function takes a BGR ``numpy.ndarray`` and a ``strength`` (1-10) and
returns a BGR ``numpy.ndarray`` of the same shape.
"""

from __future__ import annotations

import cv2
import numpy as np


def _clamp_strength(strength: int) -> int:
    return max(1, min(10, int(strength)))


def _resize_for_processing(img: np.ndarray, max_side: int = 1280) -> np.ndarray:
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest <= max_side:
        return img
    scale = max_side / longest
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def classic_cartoon(img: np.ndarray, strength: int = 5) -> np.ndarray:
    """Bilateral-filter smoothing + adaptive-threshold edge overlay."""
    s = _clamp_strength(strength)
    img = _resize_for_processing(img)

    # Color smoothing: repeated bilateral filter preserves edges while flattening color regions.
    color = img.copy()
    iterations = 2 + s // 3
    d = 9
    sigma_color = 50 + s * 15
    sigma_space = 50 + s * 15
    for _ in range(iterations):
        color = cv2.bilateralFilter(color, d=d, sigmaColor=sigma_color, sigmaSpace=sigma_space)

    # Edge mask via adaptive threshold on a median-blurred grayscale.
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.medianBlur(gray, 5)
    block_size = 7 + 2 * (s // 2)  # must be odd
    if block_size % 2 == 0:
        block_size += 1
    edges = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY,
        blockSize=block_size,
        C=2 + s // 2,
    )
    edges_bgr = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
    return cv2.bitwise_and(color, edges_bgr)


def pencil_sketch(img: np.ndarray, strength: int = 5) -> np.ndarray:
    """Color pencil-sketch effect using OpenCV's pencilSketch."""
    s = _clamp_strength(strength)
    img = _resize_for_processing(img)
    sigma_s = 30 + s * 6
    sigma_r = 0.05 + s * 0.02
    shade_factor = 0.02 + s * 0.005
    _, color_sketch = cv2.pencilSketch(
        img,
        sigma_s=float(sigma_s),
        sigma_r=float(sigma_r),
        shade_factor=float(shade_factor),
    )
    return color_sketch


def color_quantization(img: np.ndarray, strength: int = 5) -> np.ndarray:
    """K-means color quantization + edge overlay for a posterized cartoon."""
    s = _clamp_strength(strength)
    img = _resize_for_processing(img)

    # Higher strength -> fewer colors, more poster-like.
    k = max(4, 16 - s)
    data = img.reshape((-1, 3)).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    _, labels, centers = cv2.kmeans(
        data, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS
    )
    quantized = centers[labels.flatten()].reshape(img.shape).astype(np.uint8)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.medianBlur(gray, 7)
    edges = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY,
        blockSize=9,
        C=2,
    )
    edges_bgr = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
    return cv2.bitwise_and(quantized, edges_bgr)


def stylization(img: np.ndarray, strength: int = 5) -> np.ndarray:
    """OpenCV's built-in non-photorealistic stylization filter."""
    s = _clamp_strength(strength)
    img = _resize_for_processing(img)
    sigma_s = 30 + s * 12
    sigma_r = 0.1 + s * 0.04
    return cv2.stylization(img, sigma_s=float(sigma_s), sigma_r=float(sigma_r))


STYLES = {
    "classic": {
        "name": "Classic Cartoon",
        "description": "Bilateral smoothing + ink-like edges. The default cartoon look.",
        "fn": classic_cartoon,
    },
    "sketch": {
        "name": "Pencil Sketch",
        "description": "Soft color pencil drawing.",
        "fn": pencil_sketch,
    },
    "quantize": {
        "name": "Color Quantization",
        "description": "Posterized flat-color comic-book look via K-means.",
        "fn": color_quantization,
    },
    "stylize": {
        "name": "Stylization",
        "description": "Painterly stylization (OpenCV NPR filter).",
        "fn": stylization,
    },
}


def cartoonify(img: np.ndarray, style: str = "classic", strength: int = 5) -> np.ndarray:
    if style not in STYLES:
        raise ValueError(f"Unknown style: {style!r}. Available: {list(STYLES)}")
    return STYLES[style]["fn"](img, strength)
