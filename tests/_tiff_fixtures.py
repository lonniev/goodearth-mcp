"""Hand-rolled GeoTIFFs for the raster reader's tests.

Written by hand rather than with tifffile so the fixture never depends on an
encoder we do not ship (zstd and the float predictor both need imagecodecs
on the write side), and so each fixture is exactly the layout the public
file has: single-row deflate strips with the horizontal predictor for the
canopy map, deflate tiles with the float predictor for the terrain model,
zstd tiles for the land cover map, bare strips for the date raster.
"""

from __future__ import annotations

import struct
import zlib

import httpx
import numpy as np
import zstandard

# TIFF tag numbers
_WIDTH, _HEIGHT, _BITS, _COMPRESSION, _PHOTOMETRIC = 256, 257, 258, 259, 262
_STRIP_OFFSETS, _SAMPLES, _ROWS_PER_STRIP, _STRIP_COUNTS = 273, 277, 278, 279
_PREDICTOR, _TILE_W, _TILE_H, _TILE_OFFSETS, _TILE_COUNTS, _FORMAT = 317, 322, 323, 324, 325, 339
_PIXEL_SCALE, _TIEPOINT, _GDAL_NODATA = 33550, 33922, 42113
_SHORT, _LONG, _DOUBLE, _ASCII = 3, 4, 12, 2

DEFLATE, ZSTD, NONE = 8, 50000, 1


def _encode(chunk: np.ndarray, compression: int, predictor: int) -> bytes:
    rows, cols = chunk.shape
    item = chunk.dtype.itemsize
    if predictor == 2:
        diff = np.diff(chunk, axis=1, prepend=chunk[:, :1] * 0).astype(chunk.dtype)
        diff[:, 0] = chunk[:, 0]
        raw = diff.tobytes()
    elif predictor == 3:
        big = np.ascontiguousarray(chunk.astype(chunk.dtype.newbyteorder(">")))
        planes = big.view(np.uint8).reshape(rows, cols, item).transpose(0, 2, 1).reshape(rows, item * cols)
        diff = np.diff(planes, axis=1, prepend=np.zeros((rows, 1), np.uint8)).astype(np.uint8)
        raw = diff.tobytes()
    else:
        raw = chunk.tobytes()
    if compression == DEFLATE:
        return zlib.compress(raw)
    if compression == ZSTD:
        return zstandard.ZstdCompressor().compress(raw)
    return raw


def geotiff(
    data: np.ndarray,
    *,
    x0: float,
    y0: float,
    dx: float,
    dy: float,
    compression: int = DEFLATE,
    predictor: int = 1,
    tile: int | None = None,
    nodata: float | None = None,
) -> bytes:
    """A little-endian classic TIFF holding ``data`` as one band.

    ``tile`` None writes one strip per row; otherwise square tiles of that
    size, padded to the tile grid as a COG writer does.
    """
    h, w = data.shape
    item = data.dtype.itemsize
    chunks: list[bytes] = []
    if tile is None:
        for r in range(h):
            chunks.append(_encode(data[r:r + 1], compression, predictor))
    else:
        for ty in range(-(-h // tile)):
            for tx in range(-(-w // tile)):
                block = np.zeros((tile, tile), dtype=data.dtype)
                part = data[ty * tile:(ty + 1) * tile, tx * tile:(tx + 1) * tile]
                block[: part.shape[0], : part.shape[1]] = part
                chunks.append(_encode(block, compression, predictor))

    fmt = 3 if data.dtype.kind == "f" else (2 if data.dtype.kind == "i" else 1)
    tags: list[tuple[int, int, list]] = [
        (_WIDTH, _LONG, [w]), (_HEIGHT, _LONG, [h]), (_BITS, _SHORT, [item * 8]),
        (_COMPRESSION, _SHORT, [compression]), (_PHOTOMETRIC, _SHORT, [1]),
        (_SAMPLES, _SHORT, [1]), (_PREDICTOR, _SHORT, [predictor]), (_FORMAT, _SHORT, [fmt]),
        (_PIXEL_SCALE, _DOUBLE, [dx, dy, 0.0]),
        (_TIEPOINT, _DOUBLE, [0.0, 0.0, 0.0, x0, y0, 0.0]),
    ]
    if tile is None:
        tags += [(_ROWS_PER_STRIP, _LONG, [1]), (_STRIP_OFFSETS, _LONG, []), (_STRIP_COUNTS, _LONG, [])]
    else:
        tags += [(_TILE_W, _LONG, [tile]), (_TILE_H, _LONG, [tile]), (_TILE_OFFSETS, _LONG, []), (_TILE_COUNTS, _LONG, [])]
    if nodata is not None:
        tags.append((_GDAL_NODATA, _ASCII, [f"{nodata:g}".encode() + b"\0"]))
    tags.sort()

    # Layout: header (8) | IFD | out-of-line tag values | chunk data.
    ifd_size = 2 + 12 * len(tags) + 4
    values_at = 8 + ifd_size
    blobs = bytearray()
    entries = bytearray()
    data_at = None  # filled after we know the values block's size

    def value_bytes(kind: int, values: list) -> bytes:
        if kind == _ASCII:
            return values[0]
        code = {_SHORT: "<H", _LONG: "<I", _DOUBLE: "<d"}[kind]
        return b"".join(struct.pack(code, v) for v in values)

    # First pass: sizes of out-of-line values, so chunk offsets are known.
    offsets_tags = {_STRIP_OFFSETS, _TILE_OFFSETS}
    counts_tags = {_STRIP_COUNTS, _TILE_COUNTS}
    fixed = 0
    for tag, kind, values in tags:
        if tag in offsets_tags or tag in counts_tags:
            fixed += 4 * len(chunks) if len(chunks) > 1 else 0
        else:
            vb = value_bytes(kind, values)
            fixed += len(vb) if len(vb) > 4 else 0
    data_at = values_at + fixed
    chunk_offsets = []
    pos = data_at
    for c in chunks:
        chunk_offsets.append(pos)
        pos += len(c)

    for tag, kind, values in tags:
        if tag in offsets_tags:
            values, kind = chunk_offsets, _LONG
        elif tag in counts_tags:
            values, kind = [len(c) for c in chunks], _LONG
        vb = value_bytes(kind, values)
        count = len(vb) if kind == _ASCII else len(values)
        if len(vb) <= 4:
            entries += struct.pack("<HHI", tag, kind, count) + vb.ljust(4, b"\0")
        else:
            entries += struct.pack("<HHII", tag, kind, count, values_at + len(blobs))
            blobs += vb

    out = bytearray(b"II*\0" + struct.pack("<I", 8))
    out += struct.pack("<H", len(tags)) + entries + struct.pack("<I", 0)
    out += blobs
    assert len(out) == data_at
    for c in chunks:
        out += c
    return bytes(out)


class Served:
    """A fixture served over respx with byte ranges, counting the requests."""

    def __init__(self, blob: bytes) -> None:
        self.blob = blob
        self.requests = 0
        self.ranges: list[tuple[int, int]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests += 1
        header = request.headers.get("range", "")
        if not header.startswith("bytes="):
            return httpx.Response(200, content=self.blob)
        a, b = header[6:].split("-")
        start = int(a)
        end = min(int(b), len(self.blob) - 1) if b else len(self.blob) - 1
        self.ranges.append((start, end))
        return httpx.Response(
            206,
            content=self.blob[start:end + 1],
            headers={"content-range": f"bytes {start}-{end}/{len(self.blob)}"},
        )
