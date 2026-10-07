"""Windowed reads of public GeoTIFFs over HTTP range requests — no GDAL.

Sunlight needs four rasters, all free and all on plain object storage:

- the Meta/WRI canopy height map (1 m, EPSG:3857, striped one row per strip —
  a 900 MB file that is NOT a cloud-optimised GeoTIFF, see
  facebookresearch/HighResCanopyHeight#7);
- its acquisition-date raster (0.01°, uncompressed strips);
- the Copernicus GLO-30 terrain model (1°×1° COGs, float predictor);
- the Copernicus Global Land Cover map (one global COG, zstd tiles).

Each reduces to the same primitive: parse the directory once, merge the byte
ranges of the chunks a window needs into ONE request, decode. That primitive
is ~150 lines here; the alternative is rasterio, whose wheel is 72 MB and
whose GDAL import lands on every cold start. Measured 2026-10-07: a 500 m
window of the canopy map is 7.6 MB in one coalesced range, 1.5 s from a
laptop, and it costs the same whether read through GDAL or through this.

The striped canopy tile is the reason the reader exists: each strip is a full
65 536-pixel row, so a window's cost scales with its HEIGHT in rows and not at
all with its width. Reading 585 rows means 585 strips, adjacent in the file,
which is one range.

Everything here is synchronous and blocking. It is meant to be called from a
worker thread (``asyncio.to_thread``), never on the event loop.
"""

from __future__ import annotations

import io
import logging
import math
import threading
import zlib
from dataclasses import dataclass
from typing import Any

import httpx
import numpy as np
import tifffile

logger = logging.getLogger(__name__)

try:  # Python 3.14 ships zstd; older interpreters take the wheel.
    from compression import zstd as _zstd  # type: ignore[import-not-found]

    def _zstd_decompress(raw: bytes) -> bytes:
        return _zstd.decompress(raw)
except ImportError:  # pragma: no cover - depends on the interpreter
    import zstandard as _zstandard

    def _zstd_decompress(raw: bytes) -> bytes:
        return _zstandard.ZstdDecompressor().decompressobj().decompress(raw)


class RasterError(RuntimeError):
    """A raster could not be read — the host refused, or the file is not what we expect."""


# ── HTTP ─────────────────────────────────────────────────────────────────

_TIMEOUT = 30.0
#: Two chunks closer than this in the file are fetched as one range; the gap
#: is cheaper than a second round trip.
COALESCE_GAP = 64 * 1024

_client: httpx.Client | None = None
_client_lock = threading.Lock()


def _http() -> httpx.Client:
    global _client
    with _client_lock:
        if _client is None:
            _client = httpx.Client(
                timeout=_TIMEOUT,
                limits=httpx.Limits(max_connections=8, max_keepalive_connections=8),
                headers={"user-agent": "goodearth-mcp (+https://github.com/lonniev/goodearth-mcp)"},
            )
        return _client


def fetch_range(url: str, start: int, end: int) -> bytes:
    """Bytes ``start..end`` inclusive, as one request. Raises ``RasterError``."""
    if end < start:
        return b""
    try:
        r = _http().get(url, headers={"range": f"bytes={start}-{end}"})
    except httpx.HTTPError as exc:
        raise RasterError(f"{_host(url)} did not answer: {exc.__class__.__name__}") from exc
    if r.status_code != 206:
        raise RasterError(f"{_host(url)} answered {r.status_code} to a range request")
    return r.content


def _host(url: str) -> str:
    return url.split("/", 3)[2] if "://" in url else url


class RangeFile(io.RawIOBase):
    """A seekable file over HTTP ranges, for tifffile to parse the directory.

    Reads are served from 256 KiB blocks. A read that spans several missing
    blocks fetches them together, so tifffile's 1 MB strip-offset table costs
    one request rather than four.
    """

    BLOCK = 256 * 1024

    def __init__(self, url: str) -> None:
        super().__init__()
        self.url = url
        self.pos = 0
        self._size: int | None = None
        self._blocks: dict[int, bytes] = {}
        self.requests = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            self.pos = offset
        elif whence == io.SEEK_CUR:
            self.pos += offset
        else:
            self.pos = self.size() + offset
        return self.pos

    def size(self) -> int:
        if self._size is None:
            # A one-byte range costs the same round trip as HEAD and also
            # proves the host honours ranges at all.
            try:
                r = _http().get(self.url, headers={"range": "bytes=0-0"})
            except httpx.HTTPError as exc:
                raise RasterError(f"{_host(self.url)} did not answer: {exc.__class__.__name__}") from exc
            self.requests += 1
            if r.status_code != 206 or "content-range" not in r.headers:
                raise RasterError(f"{_host(self.url)} does not serve byte ranges ({r.status_code})")
            self._size = int(r.headers["content-range"].rsplit("/", 1)[-1])
        return self._size

    def _ensure(self, first: int, last: int) -> None:
        """Fetch every missing block in ``first..last`` as one range."""
        missing = [b for b in range(first, last + 1) if b not in self._blocks]
        if not missing:
            return
        lo, hi = missing[0], missing[-1]
        start = lo * self.BLOCK
        end = min((hi + 1) * self.BLOCK, self.size()) - 1
        data = fetch_range(self.url, start, end)
        self.requests += 1
        for b in range(lo, hi + 1):
            off = (b - lo) * self.BLOCK
            self._blocks[b] = data[off:off + self.BLOCK]

    def readinto(self, buffer: Any) -> int:
        n = len(buffer)
        if n == 0:
            return 0
        end = min(self.pos + n, self.size())
        if end <= self.pos:
            return 0
        first, last = self.pos // self.BLOCK, (end - 1) // self.BLOCK
        self._ensure(first, last)
        out = bytearray()
        for b in range(first, last + 1):
            out += self._blocks[b]
        off = self.pos - first * self.BLOCK
        chunk = bytes(out[off:off + (end - self.pos)])
        buffer[: len(chunk)] = chunk
        self.pos += len(chunk)
        return len(chunk)


# ── Directory ────────────────────────────────────────────────────────────

#: TIFF compression codes this reader decodes.
_NONE, _DEFLATE, _ADOBE_DEFLATE, _ZSTD = 1, 8, 32946, 50000
#: Predictor codes: none, horizontal differencing, floating-point.
_PRED_NONE, _PRED_HORIZONTAL, _PRED_FLOAT = 1, 2, 3


@dataclass(frozen=True)
class Page:
    """One image directory, with the geo-referencing that places it.

    ``x0, y0`` are the top-left corner of the top-left pixel in CRS units;
    ``dx, dy`` are the pixel size (both positive; rows run southward).
    """

    url: str
    level: int
    width: int
    height: int
    dtype: np.dtype
    compression: int
    predictor: int
    tiled: bool
    chunk_w: int
    chunk_h: int
    offsets: np.ndarray
    bytecounts: np.ndarray
    nodata: float | None
    crs: str
    x0: float
    y0: float
    dx: float
    dy: float

    @property
    def chunks_across(self) -> int:
        return -(-self.width // self.chunk_w)


_PAGES: dict[tuple[str, int], Page] = {}
_pages_lock = threading.Lock()


def open_page(url: str, level: int = 0, *, crs: str = "EPSG:4326") -> Page:
    """Parse one directory of a GeoTIFF, once per process.

    ``level`` 0 is full resolution; higher levels are the file's overviews.
    Overviews carry no geo tags of their own, so theirs is derived from the
    full-resolution page by the width ratio — the convention every COG writer
    follows.
    """
    key = (url, level)
    with _pages_lock:
        found = _PAGES.get(key)
    if found is not None:
        return found

    f = RangeFile(url)
    try:
        tf = tifffile.TiffFile(io.BufferedReader(f, buffer_size=RangeFile.BLOCK))  # type: ignore[arg-type]
    except (tifffile.TiffFileError, ValueError, OSError) as exc:
        raise RasterError(f"{_host(url)}: not a TIFF we can read ({exc})") from exc
    try:
        series = tf.series[0]
        try:
            page = series.levels[level].pages[0]
            base = series.levels[0].pages[0]
        except IndexError as exc:
            raise RasterError(f"{_host(url)}: no overview level {level}") from exc
        if page.samplesperpixel != 1:
            raise RasterError(f"{_host(url)}: expected one band, found {page.samplesperpixel}")
        if page.compression not in (_NONE, _DEFLATE, _ADOBE_DEFLATE, _ZSTD):
            raise RasterError(f"{_host(url)}: compression {page.compression} is not supported")

        scale = base.tags.get("ModelPixelScaleTag")
        tie = base.tags.get("ModelTiepointTag")
        if scale is None or tie is None:
            raise RasterError(f"{_host(url)}: no geo-referencing tags")
        ratio = base.imagewidth / page.imagewidth
        dx, dy = float(scale.value[0]) * ratio, float(scale.value[1]) * ratio
        # A tiepoint pins raster (i, j) to model (x, y); COGs pin (0, 0).
        i, j, _, x, y = (float(v) for v in tie.value[:5])
        x0, y0 = x - i * dx, y + j * dy
        nodata_tag = page.tags.get("GDAL_NODATA")
        nodata = float(nodata_tag.value) if nodata_tag is not None else None

        parsed = Page(
            url=url, level=level,
            width=page.imagewidth, height=page.imagelength,
            dtype=np.dtype(page.dtype),
            compression=page.compression, predictor=int(page.predictor),
            tiled=page.is_tiled,
            chunk_w=page.tilewidth if page.is_tiled else page.imagewidth,
            chunk_h=page.tilelength if page.is_tiled else page.rowsperstrip,
            offsets=np.asarray(page.dataoffsets, dtype=np.uint64),
            bytecounts=np.asarray(page.databytecounts, dtype=np.uint64),
            nodata=nodata, crs=crs, x0=x0, y0=y0, dx=dx, dy=dy,
        )
    finally:
        tf.close()
    logger.info("raster directory %s level %d: %dx%d in %d requests", _host(url), level,
                parsed.width, parsed.height, f.requests)
    with _pages_lock:
        _PAGES[key] = parsed
    return parsed


# ── Decoding ─────────────────────────────────────────────────────────────


def decode_chunk(raw: bytes, page: Page, rows: int, cols: int) -> np.ndarray:
    """One strip or tile → a ``(rows, cols)`` array in the page's dtype."""
    if page.compression in (_DEFLATE, _ADOBE_DEFLATE):
        raw = zlib.decompress(raw)
    elif page.compression == _ZSTD:
        raw = _zstd_decompress(raw)
    item = page.dtype.itemsize
    want = rows * cols * item
    if len(raw) < want:
        raise RasterError("a chunk decoded short")
    buf = np.frombuffer(raw, dtype=np.uint8, count=want)

    if page.predictor == _PRED_HORIZONTAL:
        # Each row stores differences from the pixel to its left.
        arr = buf.view(page.dtype).reshape(rows, cols)
        return np.cumsum(arr, axis=1, dtype=page.dtype)
    if page.predictor == _PRED_FLOAT:
        # Floating-point predictor: each row holds its pixels' bytes split
        # into planes (most significant plane first), horizontally differenced
        # byte-wise. Undo the differencing, re-interleave, read big-endian.
        planes = np.cumsum(buf.reshape(rows, item * cols), axis=1, dtype=np.uint8)
        interleaved = planes.reshape(rows, item, cols).transpose(0, 2, 1)
        big = np.ascontiguousarray(interleaved).view(page.dtype.newbyteorder(">"))
        return big.reshape(rows, cols).astype(page.dtype)
    return buf.view(page.dtype).reshape(rows, cols)


def _coalesced(page: Page, chunk_ids: list[int]) -> dict[int, bytes]:
    """Fetch these chunks' bytes, merging neighbours into as few ranges as the file allows."""
    ids = sorted(set(chunk_ids))
    spans: list[tuple[int, int]] = []  # (first id, last id) runs that read as one range
    for cid in ids:
        if page.bytecounts[cid] == 0:
            continue
        start = int(page.offsets[cid])
        if spans:
            prev_first, prev_last = spans[-1]
            prev_end = int(page.offsets[prev_last] + page.bytecounts[prev_last])
            if prev_end <= start <= prev_end + COALESCE_GAP:
                spans[-1] = (prev_first, cid)
                continue
        spans.append((cid, cid))

    out: dict[int, bytes] = {}
    for first, last in spans:
        start = int(page.offsets[first])
        end = int(page.offsets[last] + page.bytecounts[last]) - 1
        blob = fetch_range(page.url, start, end)
        for cid in ids:
            if first <= cid <= last and page.bytecounts[cid]:
                off = int(page.offsets[cid]) - start
                out[cid] = blob[off:off + int(page.bytecounts[cid])]
    return out


def read_window(page: Page, r0: int, r1: int, c0: int, c1: int) -> np.ndarray:
    """Pixels ``[r0:r1, c0:c1]`` of the page, clamped to it.

    Pixels the file does not hold (an empty tile, a region off the edge) come
    back as the page's nodata value, or 0 when it declares none.
    """
    r0, r1 = max(0, r0), min(page.height, r1)
    c0, c1 = max(0, c0), min(page.width, c1)
    fill = page.nodata if page.nodata is not None else 0
    out = np.full((max(0, r1 - r0), max(0, c1 - c0)), fill, dtype=page.dtype)
    if out.size == 0:
        return out

    if not page.tiled and page.compression == _NONE and page.chunk_h == 1:
        # Uncompressed single-row strips: take only the bytes of the columns
        # asked for. The date raster's rows are 144 KB each; a point is 4 bytes.
        return _read_uncompressed_rows(page, r0, r1, c0, c1, out)

    ch, cw = page.chunk_h, page.chunk_w
    across = page.chunks_across
    ids = [
        ty * across + tx
        for ty in range(r0 // ch, (r1 - 1) // ch + 1)
        for tx in range(c0 // cw, (c1 - 1) // cw + 1)
    ]
    blobs = _coalesced(page, ids)
    for cid in ids:
        raw = blobs.get(cid)
        if raw is None:
            continue
        ty, tx = divmod(cid, across)
        rows = ch if page.tiled else min(ch, page.height - ty * ch)
        chunk = decode_chunk(raw, page, rows, cw)
        rr0, rr1 = max(r0, ty * ch), min(r1, ty * ch + rows)
        cc0, cc1 = max(c0, tx * cw), min(c1, min(tx * cw + cw, page.width))
        out[rr0 - r0:rr1 - r0, cc0 - c0:cc1 - c0] = chunk[rr0 - ty * ch:rr1 - ty * ch, cc0 - tx * cw:cc1 - tx * cw]
    return out


def _read_uncompressed_rows(page: Page, r0: int, r1: int, c0: int, c1: int, out: np.ndarray) -> np.ndarray:
    item = page.dtype.itemsize
    starts = page.offsets[r0:r1].astype(np.int64) + c0 * item
    length = (c1 - c0) * item
    span = int(starts[-1]) + length - int(starts[0])
    if span <= length * len(starts) + COALESCE_GAP * len(starts):
        blob = fetch_range(page.url, int(starts[0]), int(starts[-1]) + length - 1)
        for i, s in enumerate(starts):
            off = int(s - starts[0])
            out[i] = np.frombuffer(blob[off:off + length], dtype=page.dtype)
    else:
        for i, s in enumerate(starts):
            out[i] = np.frombuffer(fetch_range(page.url, int(s), int(s) + length - 1), dtype=page.dtype)
    return out


# ── Placing a window on the ground ───────────────────────────────────────

_R = 6_378_137.0  # WGS84 semi-major axis, the Web-Mercator sphere


def mercator(lats: np.ndarray, lons: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """EPSG:4326 → EPSG:3857 metres."""
    x = np.radians(lons) * _R
    y = np.log(np.tan(np.pi / 4 + np.radians(np.clip(lats, -85.05, 85.05)) / 2)) * _R
    return x, y


@dataclass(frozen=True)
class Window:
    """A rectangle of pixels and the affine that puts them on the ground.

    ``row0, col0`` are the window's origin in the page's pixel grid, so
    ``sample`` can turn lat/lon into fractional pixel coordinates without the
    page itself. Points outside the window sample as NaN.
    """

    data: np.ndarray
    page: Page
    row0: int
    col0: int

    def pixel(self, lats: np.ndarray, lons: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Fractional (row, col) within this window; pixel centres at .5."""
        if self.page.crs == "EPSG:3857":
            x, y = mercator(lats, lons)
        else:
            x, y = np.asarray(lons, dtype=np.float64), np.asarray(lats, dtype=np.float64)
        col = (x - self.page.x0) / self.page.dx - self.col0
        row = (self.page.y0 - y) / self.page.dy - self.row0
        return row, col

    def sample(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        """Nearest-pixel values, NaN outside the window or on nodata."""
        row, col = self.pixel(lats, lons)
        r, c = np.floor(row).astype(np.int64), np.floor(col).astype(np.int64)
        h, w = self.data.shape
        inside = (r >= 0) & (r < h) & (c >= 0) & (c < w)
        out = np.full(r.shape, np.nan, dtype=np.float32)
        vals = self.data[np.clip(r, 0, h - 1), np.clip(c, 0, w - 1)].astype(np.float32)
        if self.page.nodata is not None:
            inside &= vals != self.page.nodata
        out[inside] = vals[inside]
        return out

    def sample_bilinear(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        """Bilinear values, NaN outside the window. For continuous fields (terrain)."""
        row, col = self.pixel(lats, lons)
        row, col = row - 0.5, col - 0.5
        h, w = self.data.shape
        r0 = np.floor(row).astype(np.int64)
        c0 = np.floor(col).astype(np.int64)
        fr, fc = (row - r0).astype(np.float32), (col - c0).astype(np.float32)
        inside = (r0 >= -1) & (r0 < h) & (c0 >= -1) & (c0 < w)
        r0c, c0c = np.clip(r0, 0, h - 1), np.clip(c0, 0, w - 1)
        r1c, c1c = np.clip(r0 + 1, 0, h - 1), np.clip(c0 + 1, 0, w - 1)
        d = self.data.astype(np.float32)
        top = d[r0c, c0c] * (1 - fc) + d[r0c, c1c] * fc
        bot = d[r1c, c0c] * (1 - fc) + d[r1c, c1c] * fc
        out = top * (1 - fr) + bot * fr
        out[~inside] = np.nan
        return out


class Mosaic:
    """Several windows that together cover a bounding box; the first with a value answers."""

    def __init__(self, windows: list[Window]) -> None:
        if not windows:
            raise RasterError("no raster covers this ground")
        self.windows = windows

    def sample(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        return self._fill(lats, lons, "sample")

    def sample_bilinear(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        return self._fill(lats, lons, "sample_bilinear")

    def _fill(self, lats: np.ndarray, lons: np.ndarray, how: str) -> np.ndarray:
        out = np.full(np.shape(lats), np.nan, dtype=np.float32)
        for w in self.windows:
            need = np.isnan(out)
            if not need.any():
                break
            got = getattr(w, how)(lats, lons)
            out = np.where(need, got, out)
        return out


def window_for(page: Page, min_lat: float, min_lon: float, max_lat: float, max_lon: float, pad_px: int = 1) -> Window | None:
    """Read the page's pixels under a lat/lon box, or None if it holds none of it."""
    lats = np.array([min_lat, min_lat, max_lat, max_lat])
    lons = np.array([min_lon, max_lon, min_lon, max_lon])
    probe = Window(np.empty((0, 0), dtype=page.dtype), page, 0, 0)
    row, col = probe.pixel(lats, lons)
    r0, r1 = int(np.floor(row.min())) - pad_px, int(np.ceil(row.max())) + pad_px
    c0, c1 = int(np.floor(col.min())) - pad_px, int(np.ceil(col.max())) + pad_px
    r0, r1 = max(0, r0), min(page.height, r1)
    c0, c1 = max(0, c0), min(page.width, c1)
    if r1 <= r0 or c1 <= c0:
        return None
    return Window(read_window(page, r0, r1, c0, c1), page, r0, c0)


# ── The datasets ─────────────────────────────────────────────────────────

CHM_BASE = "https://dataforgood-fb-data.s3.us-east-1.amazonaws.com/forests/v1/alsgedi_global_v6_float"
CHM_VERSION = "meta-wri-chm-v6"
CHM_RESOLUTION_M = 1
#: Meta's published mean absolute error for the canopy height map.
CHM_ERROR_M = 2.8
DEM_BASE = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com"
DEM_VERSION = "copernicus-glo-30"
DEM_RESOLUTION_M = 30
LANDCOVER_URL = "https://s3-west.nrp-nautilus.io/public-land-cover/cgls-lc100-2019-cog.tif"
LANDCOVER_VERSION = "cgls-lc100-2019"
LANDCOVER_RESOLUTION_M = 100

_QUADKEY_ZOOM = 9


def quadkey(lat: float, lon: float, zoom: int = _QUADKEY_ZOOM) -> str:
    """The Bing-style quadkey of the zoom-``zoom`` tile under a point."""
    return _quadkey_of(*_tile_xy(lat, lon, zoom), zoom)


def _tile_xy(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    n = 1 << zoom
    lat_r = math.radians(max(-85.05, min(85.05, lat)))
    tx = int((lon + 180.0) / 360.0 * n)
    ty = int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)
    return min(max(tx, 0), n - 1), min(max(ty, 0), n - 1)


def _quadkey_of(tx: int, ty: int, zoom: int) -> str:
    key = []
    for i in range(zoom, 0, -1):
        digit, mask = 0, 1 << (i - 1)
        if tx & mask:
            digit += 1
        if ty & mask:
            digit += 2
        key.append(str(digit))
    return "".join(key)


def _quadkeys_under(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> list[str]:
    x0, y0 = _tile_xy(max_lat, min_lon, _QUADKEY_ZOOM)
    x1, y1 = _tile_xy(min_lat, max_lon, _QUADKEY_ZOOM)
    return [_quadkey_of(tx, ty, _QUADKEY_ZOOM) for ty in range(y0, y1 + 1) for tx in range(x0, x1 + 1)]


def canopy_height(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> Mosaic:
    """Canopy height in metres under a box, from the Meta/WRI 1 m map.

    Raises ``RasterError`` when nothing can be read: without trees there is
    no honest horizon to report, so the caller does not degrade past this.
    """
    windows: list[Window] = []
    missing: list[str] = []
    for qk in _quadkeys_under(min_lat, min_lon, max_lat, max_lon):
        url = f"{CHM_BASE}/chm/{qk}.tif"
        try:
            page = open_page(url, crs="EPSG:3857")
            w = window_for(page, min_lat, min_lon, max_lat, max_lon)
        except RasterError as exc:
            # A tile that does not exist is open water or ice, which the map
            # simply does not publish; a tile that will not answer is an outage.
            missing.append(f"{qk}: {exc}")
            continue
        if w is not None:
            windows.append(w)
    if not windows:
        raise RasterError("the canopy map has no tile for this ground" + (f" ({'; '.join(missing)})" if missing else ""))
    return Mosaic(windows)


def canopy_observed(lat: float, lon: float) -> str | None:
    """The month the canopy imagery under a point was taken, as ``YYYY-MM``.

    Meta publishes the date as a 0.01° raster whose value is years since 2000
    with the month as a fraction. None when the pixel is empty or unreadable:
    a missing date is a missing label, never an invented one.
    """
    try:
        page = open_page(f"{CHM_BASE}/CHM_acquisition_date.tif")
        probe = Window(np.empty((0, 0), dtype=page.dtype), page, 0, 0)
        row, col = probe.pixel(np.array([lat]), np.array([lon]))
        r, c = int(row[0]), int(col[0])
        value = float(read_window(page, r, r + 1, c, c + 1)[0, 0])
    except (RasterError, IndexError, ValueError) as exc:
        logger.info("canopy date unavailable: %s", exc)
        return None
    if not value or not math.isfinite(value):
        return None
    year = 2000 + int(value)
    month = round((value - int(value)) * 12)
    if month == 0:
        month = 12
        year -= 1
    return f"{year:04d}-{month:02d}"


def _dem_name(lat: float, lon: float) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(math.floor(lat)):02d}_00_{ew}{abs(math.floor(lon)):03d}_00_DEM"


def terrain(min_lat: float, min_lon: float, max_lat: float, max_lon: float, *, level: int = 0) -> Mosaic:
    """Copernicus GLO-30 heights under a box; ``level`` 2 is the ~120 m overview.

    GLO-30 is a surface model: radar partly sees the forest top, so near the
    block the caller smooths it and takes the trees from the canopy map.
    """
    windows: list[Window] = []
    errors: list[str] = []
    for lat in range(math.floor(min_lat), math.floor(max_lat) + 1):
        for lon in range(math.floor(min_lon), math.floor(max_lon) + 1):
            name = _dem_name(lat, lon)
            try:
                page = open_page(f"{DEM_BASE}/{name}/{name}.tif", level)
                w = window_for(page, min_lat, min_lon, max_lat, max_lon)
            except RasterError as exc:
                errors.append(str(exc))
                continue
            if w is not None:
                windows.append(w)
    if not windows:
        raise RasterError("terrain could not be read" + (f" ({errors[0]})" if errors else ""))
    return Mosaic(windows)


def land_cover(min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> Window:
    """CGLS-LC100 classes under a box. Raises ``RasterError``; the caller degrades."""
    page = open_page(LANDCOVER_URL)
    w = window_for(page, min_lat, min_lon, max_lat, max_lon)
    if w is None:
        raise RasterError("the land cover map does not cover this ground")
    return w


__all__ = [
    "CHM_ERROR_M", "CHM_RESOLUTION_M", "CHM_VERSION", "DEM_RESOLUTION_M", "DEM_VERSION",
    "LANDCOVER_RESOLUTION_M", "LANDCOVER_VERSION",
    "Mosaic", "Page", "RangeFile", "RasterError", "Window",
    "canopy_height", "canopy_observed", "decode_chunk", "land_cover", "mercator",
    "open_page", "quadkey", "read_window", "terrain", "window_for",
]
