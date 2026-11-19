"""Image uploads. Every file is decoded and re-encoded to WebP: that removes EXIF/GPS data and
anything smuggled inside the file, and the stored name is random, never the client's."""

import io
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from app.config import get_settings
from app.errors import AppError
from app.modules.audit.models import record_user
from app.modules.auth.permissions import CurrentUser, Permission, require
from app.deps import SessionDep

router = APIRouter(prefix="/admin/media", tags=["admin: media"])

MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 40_000_000  # decompression-bomb guard (a 6000×6000 photo is 36 MP)
MAX_EDGE = 2400  # larger images are scaled down; plenty for full-width hero photos
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}  # no SVG (can carry scripts), no GIF/TIFF
MEDIA_URL = "/api/v1/media"

Image.MAX_IMAGE_PIXELS = MAX_PIXELS  # Pillow refuses (DecompressionBombError) beyond 2× this


def media_dir() -> Path:
    path = Path(get_settings().media_root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def process_image(data: bytes) -> tuple[bytes, int, int]:
    """Validate and re-encode; returns (webp_bytes, width, height)."""
    if len(data) > MAX_BYTES:
        raise AppError(413, "FILE_TOO_LARGE", "Up to 10 MB")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            if probe.width * probe.height > MAX_PIXELS:
                raise AppError(413, "IMAGE_TOO_LARGE", "Up to 40 megapixels")
            probe.verify()
        if fmt not in ALLOWED_FORMATS:
            raise AppError(415, "UNSUPPORTED_IMAGE", "JPEG, PNG or WebP only")
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source)  # keep the phone's rotation, then drop EXIF
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            image.thumbnail((MAX_EDGE, MAX_EDGE))
            out = io.BytesIO()
            image.save(out, "WEBP", quality=82, method=6)  # no exif= argument: metadata is gone
            return out.getvalue(), image.width, image.height
    except AppError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as error:
        raise AppError(415, "UNSUPPORTED_IMAGE", "Not a valid image") from error


class UploadOut(BaseModel):
    url: str
    width: int
    height: int


@router.post("", status_code=201)
def upload(
    file: UploadFile,
    user: Annotated[CurrentUser, Depends(require(Permission.MEDIA_WRITE))],
    session: SessionDep,
) -> UploadOut:
    data = file.file.read(MAX_BYTES + 1)  # never read more than the limit into memory
    webp, width, height = process_image(data)
    name = f"{uuid.uuid4().hex}.webp"
    (media_dir() / name).write_bytes(webp)
    record_user(session, user, "media.uploaded", "media", name, after={"width": width, "height": height})
    session.commit()
    return UploadOut(url=f"{MEDIA_URL}/{name}", width=width, height=height)
