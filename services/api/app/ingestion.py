from __future__ import annotations

import ast
import re
import struct
from math import cos, pi, sin
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from .models import SceneObject, SourceKind, SourceRecord, SourceReference, Transform


class SourceRejected(ValueError):
    pass


ALLOWED_SUFFIXES = {
    ".pdf": SourceKind.PDF,
    ".py": SourceKind.PYTHON,
    ".obj": SourceKind.OBJ,
    ".glb": SourceKind.GLB,
}


def detect_kind(filename: str, head: bytes) -> SourceKind:
    suffix = Path(filename).suffix.lower()
    kind = ALLOWED_SUFFIXES.get(suffix)
    if kind is None:
        raise SourceRejected("supported formats are PDF, Python, OBJ and binary GLB")
    if kind is SourceKind.PDF and not head.startswith(b"%PDF-"):
        raise SourceRejected("file extension says PDF but content signature does not")
    if kind is SourceKind.GLB and head[:4] != b"glTF":
        raise SourceRejected("only self-contained binary GLB files are accepted")
    if kind in {SourceKind.PYTHON, SourceKind.OBJ}:
        try:
            head.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise SourceRejected("text source must be valid UTF-8") from exc
    return kind


def analyze_source(path: Path, kind: SourceKind) -> dict[str, Any]:
    if kind is SourceKind.PDF:
        return _analyze_pdf(path)
    if kind is SourceKind.PYTHON:
        return _analyze_python(path)
    if kind is SourceKind.OBJ:
        return _analyze_obj(path)
    if kind is SourceKind.GLB:
        return _analyze_glb(path)
    raise SourceRejected("unsupported source kind")


def _analyze_pdf(path: Path) -> dict[str, Any]:
    try:
        reader = PdfReader(str(path), strict=True)
    except Exception as exc:
        raise SourceRejected("PDF parser rejected the document") from exc
    if reader.is_encrypted:
        raise SourceRejected("encrypted PDFs are not accepted")
    if len(reader.pages) > 500:
        raise SourceRejected("PDF exceeds the 500-page limit")

    pages: list[dict[str, Any]] = []
    headings: list[dict[str, Any]] = []
    total_characters = 0
    for page_number, page in enumerate(reader.pages, start=1):
        try:
            text = (page.extract_text() or "").replace("\x00", " ")
        except Exception as exc:
            raise SourceRejected(f"PDF text extraction failed on page {page_number}") from exc
        total_characters += len(text)
        lines = [" ".join(line.split()) for line in text.splitlines() if line.strip()]
        pages.append({"page": page_number, "characters": len(text)})
        for line in lines:
            if len(headings) >= 80:
                break
            if _looks_like_heading(line):
                headings.append({"page": page_number, "text": line[:180]})

    title = ""
    metadata = reader.metadata
    if metadata and metadata.title:
        title = str(metadata.title).strip()[:180]
    return {
        "title": title or path.stem[:180],
        "pages": pages,
        "page_count": len(reader.pages),
        "characters": total_characters,
        "headings": headings,
        "extractor": "pypdf",
    }


def _looks_like_heading(line: str) -> bool:
    if len(line) < 4 or len(line) > 180:
        return False
    numbered = re.match(r"^(?:\d+(?:\.\d+)*[.)]?|[IVX]{1,6}[.)])\s+\S", line)
    sparse = len(line.split()) <= 12 and line[-1] not in ".,;:"
    uppercase = len(line) <= 100 and line.upper() == line and any(char.isalpha() for char in line)
    return bool(numbered or uppercase or sparse)


def _analyze_python(path: Path) -> dict[str, Any]:
    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise SourceRejected("Python source must be valid UTF-8") from exc
    if len(source) > 2_000_000:
        raise SourceRejected("Python source exceeds the parser limit")
    try:
        tree = ast.parse(source, filename=path.name)
    except SyntaxError as exc:
        raise SourceRejected(f"Python syntax error at line {exc.lineno}") from exc

    functions = [
        {"name": node.name, "line": node.lineno, "async": isinstance(node, ast.AsyncFunctionDef)}
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    ][:200]
    classes = [
        {"name": node.name, "line": node.lineno}
        for node in ast.walk(tree)
        if isinstance(node, ast.ClassDef)
    ][:100]
    imports = sorted(
        {
            alias.name.split(".")[0]
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        }
        | {
            (node.module or "").split(".")[0]
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom) and node.module
        }
    )[:100]
    return {
        "title": path.name,
        "lines": source.count("\n") + 1,
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "extractor": "python-ast",
    }


def _analyze_obj(path: Path) -> dict[str, Any]:
    vertices = 0
    faces = 0
    minimum = [float("inf")] * 3
    maximum = [float("-inf")] * 3
    try:
        with path.open(encoding="utf-8", errors="strict") as stream:
            for line_number, line in enumerate(stream, start=1):
                if line_number > 2_000_000:
                    raise SourceRejected("OBJ exceeds the two-million-line limit")
                if line.startswith("v "):
                    parts = line.split()
                    if len(parts) < 4:
                        raise SourceRejected(f"invalid OBJ vertex at line {line_number}")
                    try:
                        values = [float(parts[index]) for index in range(1, 4)]
                    except ValueError as exc:
                        raise SourceRejected(
                            f"invalid OBJ coordinate at line {line_number}"
                        ) from exc
                    if any(abs(value) > 1e9 for value in values):
                        raise SourceRejected("OBJ coordinates exceed the supported bounds")
                    for axis, value in enumerate(values):
                        minimum[axis] = min(minimum[axis], value)
                        maximum[axis] = max(maximum[axis], value)
                    vertices += 1
                elif line.startswith("f "):
                    faces += 1
    except UnicodeDecodeError as exc:
        raise SourceRejected("OBJ source must be valid UTF-8") from exc
    if vertices == 0 or faces == 0:
        raise SourceRejected("OBJ must contain vertices and faces")
    return {
        "title": path.name,
        "vertices": vertices,
        "faces": faces,
        "bounds": {"min": minimum, "max": maximum},
        "extractor": "obj-safe-parser",
    }


def _analyze_glb(path: Path) -> dict[str, Any]:
    with path.open("rb") as stream:
        header = stream.read(12)
    if len(header) != 12:
        raise SourceRejected("truncated GLB header")
    magic, version, declared_length = struct.unpack("<4sII", header)
    if magic != b"glTF" or version != 2:
        raise SourceRejected("only GLB version 2 is supported")
    if declared_length != path.stat().st_size:
        raise SourceRejected("GLB declared length does not match file size")
    return {
        "title": path.name,
        "glb_version": version,
        "bytes": declared_length,
        "extractor": "glb-header-v2",
    }


def spatialize_source(source: SourceRecord) -> list[SceneObject]:
    reference = SourceReference(
        source_sha256=source.sha256,
        locator="file",
        method=str(source.analysis.get("extractor", "deterministic-parser")),
        confidence=1.0,
    )
    root_id = f"source:{source.id.hex[:12]}"
    root = SceneObject(
        id=root_id,
        kind="mesh" if source.kind in {SourceKind.OBJ, SourceKind.GLB} else "document",
        label=str(source.analysis.get("title") or source.filename),
        properties={
            "source_id": str(source.id),
            "source_kind": source.kind.value,
            "asset_url": f"/v1/projects/{source.project_id}/sources/{source.id}/content",
            **_public_summary(source.analysis),
        },
        source_refs=[reference],
        inferred=False,
    )
    objects = [root]
    if source.kind is SourceKind.PDF:
        objects.extend(_pdf_objects(source, root_id))
    elif source.kind is SourceKind.PYTHON:
        objects.extend(_python_objects(source, root_id))
    return objects


def _pdf_objects(source: SourceRecord, root_id: str) -> list[SceneObject]:
    headings = list(source.analysis.get("headings", []))[:40]
    count = max(1, len(headings))
    objects: list[SceneObject] = []
    for index, heading in enumerate(headings):
        angle = 2 * pi * index / count
        radius = 2.4 + 0.08 * index
        page = int(heading.get("page", 1))
        objects.append(
            SceneObject(
                id=f"{root_id}:section:{index + 1}",
                kind="section",
                label=str(heading.get("text", f"Section {index + 1}"))[:160],
                transform=Transform(
                    position=(radius * cos(angle), (index % 5) * 0.28 - 0.5, radius * sin(angle))
                ),
                properties={"page": page, "parent_id": root_id},
                source_refs=[
                    SourceReference(
                        source_sha256=source.sha256,
                        locator=f"page:{page}",
                        method="heading-heuristic",
                        confidence=0.72,
                    )
                ],
                inferred=True,
            )
        )
    return objects


def _python_objects(source: SourceRecord, root_id: str) -> list[SceneObject]:
    entries = [("class", item) for item in source.analysis.get("classes", [])] + [
        ("function", item) for item in source.analysis.get("functions", [])
    ]
    objects: list[SceneObject] = []
    for index, (entry_kind, item) in enumerate(entries[:80]):
        row, column = divmod(index, 10)
        line = int(item.get("line", 1))
        objects.append(
            SceneObject(
                id=f"{root_id}:algorithm:{index + 1}",
                kind="algorithm",
                label=str(item.get("name", entry_kind))[:160],
                transform=Transform(position=(column * 0.75 - 3.4, row * 0.55, 0.0)),
                properties={"symbol_kind": entry_kind, "line": line, "parent_id": root_id},
                source_refs=[
                    SourceReference(
                        source_sha256=source.sha256,
                        locator=f"line:{line}",
                        method="python-ast",
                        confidence=1.0,
                    )
                ],
                inferred=False,
            )
        )
    return objects


def _public_summary(analysis: dict[str, Any]) -> dict[str, Any]:
    excluded = {"headings", "functions", "classes"}
    return {key: value for key, value in analysis.items() if key not in excluded}
