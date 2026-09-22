from app.services.s3_service import MAX_VIDEO_SIZE

# Multipart overhead on top of the 50 MB video cap.
MAX_UPLOAD_BODY_BYTES = MAX_VIDEO_SIZE + (2 * 1024 * 1024)


def configure_upload_limits() -> None:
    """Raise Starlette multipart part limits so banner videos are not rejected at 1 MB."""
    try:
        from starlette.formparsers import MultiPartParser
    except ImportError:
        return
    for name in ("max_part_size", "max_file_size"):
        if hasattr(MultiPartParser, name):
            setattr(MultiPartParser, name, MAX_UPLOAD_BODY_BYTES)
