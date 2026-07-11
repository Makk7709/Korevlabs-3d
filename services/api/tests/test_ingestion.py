import struct
from pathlib import Path

import pytest
from pypdf import PdfWriter

from app.ingestion import SourceRejected, analyze_source, detect_kind, spatialize_source
from app.models import SourceKind, SourceRecord


def test_detect_kind_checks_content_signatures() -> None:
    assert detect_kind("paper.pdf", b"%PDF-1.7") is SourceKind.PDF
    assert detect_kind("model.glb", b"glTF") is SourceKind.GLB
    assert detect_kind("algo.py", b"def run():\n    pass\n") is SourceKind.PYTHON
    with pytest.raises(SourceRejected, match="signature"):
        detect_kind("paper.pdf", b"not a pdf")
    with pytest.raises(SourceRejected, match="supported formats"):
        detect_kind("archive.zip", b"PK")
    with pytest.raises(SourceRejected, match="UTF-8"):
        detect_kind("algo.py", b"\xff\xfe")


def test_python_analysis_and_spatialization(tmp_path: Path) -> None:
    path = tmp_path / "system.py"
    path.write_text(
        "import math\nclass Engine:\n    pass\n\nasync def sense():\n    return math.pi\n",
        encoding="utf-8",
    )
    analysis = analyze_source(path, SourceKind.PYTHON)
    assert analysis["imports"] == ["math"]
    assert analysis["classes"][0]["name"] == "Engine"
    assert analysis["functions"][0]["name"] == "sense"

    record = SourceRecord(
        project_id="00000000-0000-0000-0000-000000000001",
        filename=path.name,
        kind=SourceKind.PYTHON,
        media_type="text/x-python",
        sha256="a" * 64,
        size_bytes=path.stat().st_size,
        analysis=analysis,
    )
    objects = spatialize_source(record)
    assert [item.kind for item in objects] == ["document", "algorithm", "algorithm"]
    assert objects[1].source_refs[0].confidence == 1


def test_python_syntax_error_is_explicit(tmp_path: Path) -> None:
    path = tmp_path / "broken.py"
    path.write_text("def broken(:\n", encoding="utf-8")
    with pytest.raises(SourceRejected, match="syntax error"):
        analyze_source(path, SourceKind.PYTHON)


def test_obj_analysis_computes_bounds_and_rejects_invalid_geometry(tmp_path: Path) -> None:
    path = tmp_path / "triangle.obj"
    path.write_text("v 0 0 0\nv 2 0 0\nv 0 3 0\nf 1 2 3\n", encoding="utf-8")
    analysis = analyze_source(path, SourceKind.OBJ)
    assert analysis["vertices"] == 3
    assert analysis["faces"] == 1
    assert analysis["bounds"] == {"min": [0.0, 0.0, 0.0], "max": [2.0, 3.0, 0.0]}

    empty = tmp_path / "empty.obj"
    empty.write_text("# no geometry\n", encoding="utf-8")
    with pytest.raises(SourceRejected, match="vertices and faces"):
        analyze_source(empty, SourceKind.OBJ)

    invalid = tmp_path / "invalid.obj"
    invalid.write_text("v x 0 0\nf 1 1 1\n", encoding="utf-8")
    with pytest.raises(SourceRejected, match="coordinate"):
        analyze_source(invalid, SourceKind.OBJ)


def test_glb_header_validation(tmp_path: Path) -> None:
    valid = tmp_path / "model.glb"
    valid.write_bytes(struct.pack("<4sII", b"glTF", 2, 12))
    assert analyze_source(valid, SourceKind.GLB)["glb_version"] == 2

    wrong_version = tmp_path / "old.glb"
    wrong_version.write_bytes(struct.pack("<4sII", b"glTF", 1, 12))
    with pytest.raises(SourceRejected, match="version 2"):
        analyze_source(wrong_version, SourceKind.GLB)

    wrong_length = tmp_path / "length.glb"
    wrong_length.write_bytes(struct.pack("<4sII", b"glTF", 2, 99))
    with pytest.raises(SourceRejected, match="length"):
        analyze_source(wrong_length, SourceKind.GLB)


def test_pdf_analysis_is_bounded_and_traceable(tmp_path: Path) -> None:
    path = tmp_path / "paper.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=200)
    writer.add_metadata({"/Title": "Research paper"})
    with path.open("wb") as stream:
        writer.write(stream)

    analysis = analyze_source(path, SourceKind.PDF)
    assert analysis["title"] == "Research paper"
    assert analysis["page_count"] == 1
    assert analysis["extractor"] == "pypdf"

    record = SourceRecord(
        project_id="00000000-0000-0000-0000-000000000001",
        filename=path.name,
        kind=SourceKind.PDF,
        media_type="application/pdf",
        sha256="b" * 64,
        size_bytes=path.stat().st_size,
        analysis={**analysis, "headings": [{"page": 1, "text": "1. Architecture"}]},
    )
    objects = spatialize_source(record)
    assert objects[0].kind == "document"
    assert objects[1].properties["page"] == 1
    assert objects[1].source_refs[0].method == "heading-heuristic"
