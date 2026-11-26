import io
import pytest
from docx import Document
from app.services.structured_minutes import FormatDefinition, validate_values, missing_required
from app.services.structured_export import render_pdf, render_docx, render_txt


def definition():
    return FormatDefinition.model_validate({"name":"Committee minutes","sector":"Government","fields":[
        {"id":"a","label":"Agreed decisions","kind":"list","required":True},
        {"id":"b","label":"Responsibilities","kind":"table","required":True,"source":"actions"},
        {"id":"c","label":"Next date","kind":"date","required":False}
    ]})


def test_formats_validate_and_render():
    fmt=definition()
    values=validate_values(fmt,{"a":"Approve the report","b":"Review budget\tFinance lead\t2026-12-15\tPending"})
    assert not missing_required(fmt,values)
    pdf=render_pdf(fmt,values,{"name":"Example Committee"})
    assert pdf.startswith(b"%PDF")
    doc=Document(io.BytesIO(render_docx(fmt,values,{"name":"Example Committee"})))
    assert any("Agreed decisions" in p.text for p in doc.paragraphs)
    assert doc.tables[0].cell(1,1).text=="Finance lead"
    assert b"Approve the report" in render_txt(fmt,values,{"name":"Example Committee"})


def test_missing_and_invalid_sections():
    fmt=definition()
    assert missing_required(fmt,validate_values(fmt,{}))==["Agreed decisions","Responsibilities"]
    with pytest.raises(ValueError):
        validate_values(fmt,{"c":"tomorrow"})
    with pytest.raises(ValueError):
        validate_values(fmt,{"b":"invalid row"})
    with pytest.raises(ValueError):
        validate_values(fmt,{"unknown":"x"})


def test_format_library_requires_login(client):
    assert client.get("/api/minute-formats/library").status_code==401
    assert client.post("/api/minute-formats/library",json=definition().model_dump()).status_code==401
