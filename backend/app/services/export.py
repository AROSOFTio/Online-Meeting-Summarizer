import io
import os
import re
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any, List, Optional

# Starlight remains the bundled academic case-study logo. Worldwide deployments
# normally override this through Organization Settings.
BUNDLED_LOGO = Path(__file__).resolve().parents[1] / "static" / "starlight-logo.jpg"


def _format_date(value: Any) -> str:
    if value is None:
        return "Not recorded"
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return value
    return value.strftime("%d %B %Y")


def _org(organization: Optional[dict]) -> dict:
    data = organization or {}
    configured_logo = data.get("organization_logo_file") or data.get("logo_path") or ""
    if configured_logo and os.path.isfile(configured_logo) and not configured_logo.lower().endswith(".svg"):
        logo_path = configured_logo
    else:
        logo_path = str(BUNDLED_LOGO) if BUNDLED_LOGO.is_file() else ""

    def value(canonical: str, legacy: str, default: str = "") -> str:
        return str(data.get(canonical) or data.get(legacy) or default)

    return {
        "name": value("organization_name", "name", "Starlight Secondary School"),
        "address": value("organization_address", "address", "Amuria District, Uganda"),
        "phone": value("organization_phone", "phone"),
        "email": value("organization_email", "email"),
        "website": value("organization_website", "website"),
        "motto": value("organization_motto", "motto", "RISE AND SHINE"),
        "registration": value("organization_registration", "registration"),
        "logo_path": logo_path,
        "minutes_document_title": value("minutes_document_title", "minutes_document_title", "Official Meeting Minutes"),
        "agenda_label": value("agenda_label", "agenda_label", "Agenda"),
        "attendance_label": value("attendance_label", "attendance_label", "Attendance Register"),
        "proceedings_label": value("proceedings_label", "proceedings_label", "Minutes / Proceedings"),
        "decisions_label": value("decisions_label", "decisions_label", "Resolutions / Key Decisions"),
        "action_items_label": value("action_items_label", "action_items_label", "Action Items"),
        "transcript_appendix_label": value("transcript_appendix_label", "transcript_appendix_label", "Appendix: Full Transcript"),
    }


def _participant_rows(participants: List[Any]) -> List[dict]:
    rows = []
    for participant in participants:
        if isinstance(participant, dict):
            rows.append({
                "name": participant.get("name", ""),
                "role": participant.get("role", ""),
                "email": participant.get("email", ""),
                "status": participant.get("status", "Present"),
            })
        else:
            rows.append({"name": str(participant), "role": "", "email": "", "status": "Present"})
    return rows


def _agenda_items(description: str) -> List[str]:
    text = (description or "").strip()
    if not text:
        return ["Agenda not recorded"]
    items = [
        re.sub(r"^\s*(?:\d+[\.\)]|[-•])\s*", "", item).strip()
        for item in re.split(r"(?:\r?\n|;)+", text)
        if item.strip()
    ]
    return items or [text]


def export_txt(
    meeting_title: str,
    meeting_date: Any,
    participants: List[Any],
    summary_text: str,
    decisions: List[str],
    action_items: List[dict],
    transcript_text: str,
    organization: Optional[dict] = None,
    meeting_description: str = "",
) -> bytes:
    org = _org(organization)
    contacts = " | ".join(filter(None, [org["address"], org["phone"], org["email"], org["website"]]))
    lines = [
        org["name"].upper(),
        org["motto"],
        contacts,
        "=" * 78,
        org["minutes_document_title"].upper(),
        "=" * 78,
        f"Meeting: {meeting_title}",
        f"Date: {_format_date(meeting_date)}",
        "",
        org["agenda_label"].upper(),
    ]
    lines.extend(f"{i}. {item}" for i, item in enumerate(_agenda_items(meeting_description), 1))
    lines.extend(["", org["attendance_label"].upper()])
    for i, row in enumerate(_participant_rows(participants), 1):
        lines.append(f"{i}. {row['name']} | {row['role'] or 'Member'} | {row['email'] or '—'} | {row['status']}")
    lines.extend(["", org["proceedings_label"].upper(), summary_text or "No minutes generated.", "", org["decisions_label"].upper()])
    lines.extend(f"{i}. {item}" for i, item in enumerate(decisions, 1))
    if not decisions:
        lines.append("No decisions recorded.")
    lines.extend(["", org["action_items_label"].upper()])
    for i, item in enumerate(action_items, 1):
        lines.append(
            f"{i}. {item.get('text', '')} | Responsible: {item.get('assignee_name') or 'Unassigned'} | "
            f"Due: {item.get('deadline') or 'Not specified'} | Status: {str(item.get('status', 'pending')).replace('_', ' ').title()}"
        )
    if not action_items:
        lines.append("No action items recorded.")
    lines.extend(["", f"--- {org['transcript_appendix_label'].upper()} (NEW PAGE IN PDF/DOCX) ---", transcript_text or "No transcript available."])
    return "\n".join(lines).encode("utf-8")


def _pdf_logo(path: str, width: float, height: float):
    from reportlab.platypus import Image
    if not path or not os.path.isfile(path):
        return None
    return Image(path, width=width, height=height, kind="proportional")


def export_pdf(
    meeting_title: str,
    meeting_date: Any,
    participants: List[Any],
    summary_text: str,
    decisions: List[str],
    action_items: List[dict],
    transcript_text: str,
    organization: Optional[dict] = None,
    meeting_description: str = "",
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Table, TableStyle

    org = _org(organization)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.4 * cm,
        bottomMargin=1.6 * cm,
        title=f"{org['minutes_document_title']} - {meeting_title}",
        author=org["name"],
    )
    styles = getSampleStyleSheet()
    royal = colors.HexColor("#173EA5")
    dark = colors.HexColor("#111827")
    body = ParagraphStyle("MinutesBody", parent=styles["BodyText"], fontSize=10, leading=14, textColor=dark, spaceAfter=6)
    small = ParagraphStyle("MinutesSmall", parent=body, fontSize=8, leading=10, textColor=colors.HexColor("#4b5563"))
    heading = ParagraphStyle("MinutesHeading", parent=styles["Heading2"], fontSize=12, leading=15, textColor=royal, spaceBefore=12, spaceAfter=6)
    title_style = ParagraphStyle("OrgTitle", parent=styles["Title"], fontSize=16, leading=19, textColor=royal, alignment=1, spaceAfter=2)
    centered = ParagraphStyle("Centered", parent=small, alignment=1)
    story = []

    logo = _pdf_logo(org["logo_path"], 2.3 * cm, 2.3 * cm)
    org_text = [
        Paragraph(f"<b>{escape(org['name'].upper())}</b>", title_style),
        Paragraph(escape(" | ".join(filter(None, [org["address"], org["phone"], org["email"], org["website"]]))), centered),
        Paragraph(f"<i>{escape(org['motto'])}</i>", centered),
    ]
    if logo:
        header = Table([[logo, org_text]], colWidths=[2.7 * cm, 14.0 * cm])
        header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(header)
    else:
        story.extend(org_text)
    if org["registration"]:
        story.append(Paragraph(f"Registration / Reference No: {escape(org['registration'])}", centered))
    story.append(HRFlowable(width="100%", thickness=1.2, color=royal, spaceBefore=5, spaceAfter=8))
    story.append(Paragraph(escape(org["minutes_document_title"].upper()), title_style))

    details = Table(
        [["Meeting", Paragraph(escape(meeting_title), body)], ["Date", _format_date(meeting_date)]],
        colWidths=[3.0 * cm, 13.7 * cm],
    )
    details.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EEF3FF")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(details)

    story.append(Paragraph(f"1. {escape(org['agenda_label'])}", heading))
    for i, item in enumerate(_agenda_items(meeting_description), 1):
        story.append(Paragraph(f"<b>{i}.</b> {escape(item)}", body))

    story.append(Paragraph(f"2. {escape(org['attendance_label'])}", heading))
    attendees = _participant_rows(participants)
    if attendees:
        rows = [["#", "Name", "Title / Position", "Email", "Status"]]
        for i, row in enumerate(attendees, 1):
            rows.append([
                str(i), Paragraph(escape(row["name"]), small), Paragraph(escape(row["role"] or "Member"), small),
                Paragraph(escape(row["email"] or "—"), small), row["status"],
            ])
        table = Table(rows, colWidths=[0.6 * cm, 4.0 * cm, 4.0 * cm, 5.3 * cm, 2.5 * cm], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), royal), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(table)
    else:
        story.append(Paragraph("No attendance recorded.", body))

    story.append(Paragraph(f"3. {escape(org['proceedings_label'])}", heading))
    for paragraph in (summary_text or "No minutes have been generated.").splitlines():
        if paragraph.strip():
            story.append(Paragraph(escape(paragraph.strip()), body))

    story.append(Paragraph(f"4. {escape(org['decisions_label'])}", heading))
    if decisions:
        for i, decision in enumerate(decisions, 1):
            story.append(Paragraph(f"<b>{i}.</b> {escape(decision)}", body))
    else:
        story.append(Paragraph("No decisions recorded.", body))

    story.append(Paragraph(f"5. {escape(org['action_items_label'])}", heading))
    if action_items:
        rows = [["#", "Action", "Responsible", "Due date", "Status"]]
        for i, item in enumerate(action_items, 1):
            rows.append([
                str(i), Paragraph(escape(item.get("text", "")), small),
                Paragraph(escape(item.get("assignee_name") or "Unassigned"), small),
                str(item.get("deadline") or "Not specified"),
                str(item.get("status", "pending")).replace("_", " ").title(),
            ])
        table = Table(rows, colWidths=[0.6 * cm, 7.0 * cm, 3.3 * cm, 3.1 * cm, 2.4 * cm], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), royal), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(table)
    else:
        story.append(Paragraph("No action items recorded.", body))

    story.append(PageBreak())
    story.append(Paragraph(escape(org["transcript_appendix_label"]), heading))
    for paragraph in (transcript_text or "No transcript available.").splitlines():
        if paragraph.strip():
            story.append(Paragraph(escape(paragraph.strip()), small))

    def branded_page(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        footer_bits = [org["name"], org["motto"], org["minutes_document_title"], f"Page {document.page}"]
        canvas.drawCentredString(A4[0] / 2, 0.75 * cm, " · ".join(bit for bit in footer_bits if bit))
        canvas.restoreState()

    doc.build(story, onFirstPage=branded_page, onLaterPages=branded_page)
    return buffer.getvalue()


def export_docx(
    meeting_title: str,
    meeting_date: Any,
    participants: List[Any],
    summary_text: str,
    decisions: List[str],
    action_items: List[dict],
    transcript_text: str,
    organization: Optional[dict] = None,
    meeting_description: str = "",
) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Inches, Pt, RGBColor

    org = _org(organization)
    doc = Document()
    royal = RGBColor(0x17, 0x3E, 0xA5)
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.7)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)
        header = section.header
        header_p = header.paragraphs[0]
        header_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if org["logo_path"] and os.path.isfile(org["logo_path"]):
            try:
                header_p.add_run().add_picture(org["logo_path"], width=Inches(0.7))
                header_p.add_run("\n")
            except Exception:
                pass
        name_run = header_p.add_run(org["name"].upper())
        name_run.bold = True
        name_run.font.size = Pt(13)
        name_run.font.color.rgb = royal
        if org["motto"]:
            motto_run = header_p.add_run(f"\n{org['motto']}")
            motto_run.italic = True
            motto_run.font.size = Pt(8)
        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer.add_run(f"{org['name']} · {org['minutes_document_title']}").font.size = Pt(8)

    title = doc.add_heading(org["minutes_document_title"].upper(), 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in title.runs:
        run.font.color.rgb = royal

    details = doc.add_table(rows=0, cols=2)
    details.style = "Table Grid"
    for label, value in [("Meeting", meeting_title), ("Date", _format_date(meeting_date))]:
        cells = details.add_row().cells
        cells[0].text, cells[1].text = label, value
        cells[0].paragraphs[0].runs[0].bold = True

    def section_heading(text: str):
        heading = doc.add_heading(text, level=1)
        for run in heading.runs:
            run.font.color.rgb = royal

    section_heading(f"1. {org['agenda_label']}")
    for item in _agenda_items(meeting_description):
        doc.add_paragraph(item, style="List Number")

    section_heading(f"2. {org['attendance_label']}")
    attendees = _participant_rows(participants)
    if attendees:
        table = doc.add_table(rows=1, cols=5)
        table.style = "Table Grid"
        for cell, label in zip(table.rows[0].cells, ["No.", "Name", "Title / Position", "Email", "Status"]):
            cell.text = label
            cell.paragraphs[0].runs[0].bold = True
        for i, row in enumerate(attendees, 1):
            cells = table.add_row().cells
            for cell, value in zip(cells, [str(i), row["name"], row["role"] or "Member", row["email"] or "—", row["status"]]):
                cell.text = value
    else:
        doc.add_paragraph("No attendance recorded.")

    section_heading(f"3. {org['proceedings_label']}")
    for paragraph in (summary_text or "No minutes have been generated.").splitlines():
        if paragraph.strip():
            doc.add_paragraph(paragraph.strip())

    section_heading(f"4. {org['decisions_label']}")
    if decisions:
        for item in decisions:
            doc.add_paragraph(item, style="List Number")
    else:
        doc.add_paragraph("No decisions recorded.")

    section_heading(f"5. {org['action_items_label']}")
    if action_items:
        table = doc.add_table(rows=1, cols=5)
        table.style = "Table Grid"
        for cell, label in zip(table.rows[0].cells, ["#", "Action", "Responsible", "Due date", "Status"]):
            cell.text = label
            cell.paragraphs[0].runs[0].bold = True
        for i, item in enumerate(action_items, 1):
            cells = table.add_row().cells
            values = [
                str(i), item.get("text", ""), item.get("assignee_name") or "Unassigned",
                str(item.get("deadline") or "Not specified"),
                str(item.get("status", "pending")).replace("_", " ").title(),
            ]
            for cell, value in zip(cells, values):
                cell.text = value
    else:
        doc.add_paragraph("No action items recorded.")

    doc.add_page_break()
    section_heading(org["transcript_appendix_label"])
    doc.add_paragraph(transcript_text or "No transcript available.")
    generated = doc.add_paragraph(f"Prepared electronically on {datetime.now().strftime('%d %B %Y at %H:%M')}.")
    generated.alignment = WD_ALIGN_PARAGRAPH.CENTER
    generated.runs[0].font.size = Pt(8)

    output = io.BytesIO()
    doc.save(output)
    return output.getvalue()
