"""FastAPI server exposing the cartoonify API."""

from __future__ import annotations

import io
import logging

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from cartoon import STYLES, cartoonify

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("cartoonify")

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_MIME_PREFIX = "image/"

app = FastAPI(title="Cartoonify API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/styles")
def list_styles() -> dict:
    return {
        "styles": [
            {"id": sid, "name": meta["name"], "description": meta["description"]}
            for sid, meta in STYLES.items()
        ]
    }


@app.post("/api/cartoonify")
async def cartoonify_endpoint(
    file: UploadFile = File(...),
    style: str = Form("classic"),
    strength: int = Form(5),
) -> Response:
    if not file.content_type or not file.content_type.startswith(ALLOWED_MIME_PREFIX):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB).")

    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image.")

    try:
        out = cartoonify(img, style=style, strength=strength)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        log.exception("cartoonify failed")
        raise HTTPException(status_code=500, detail="Internal processing error.")

    ok, buf = cv2.imencode(".png", out)
    if not ok:
        raise HTTPException(status_code=500, detail="Could not encode result.")

    log.info("cartoonified style=%s strength=%s in_bytes=%d out_bytes=%d",
             style, strength, len(raw), buf.nbytes)
    return Response(content=buf.tobytes(), media_type="image/png")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
