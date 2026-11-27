import io
import os
from html import escape
from app.services.structured_minutes import columns


def render_pdf(definition, values, organization, final=False):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle, Image
    from reportlab.lib.enums import TA_CENTER
    buffer=io.BytesIO()
    doc=SimpleDocTemplate(buffer,pagesize=A4,leftMargin=42,rightMargin=42,topMargin=44,bottomMargin=48,title=definition.name)
    styles=getSampleStyleSheet()
    body=ParagraphStyle("MinuteBody",parent=styles["BodyText"],fontSize=10,leading=15,spaceAfter=5)
    heading=ParagraphStyle("MinuteHeading",parent=styles["Heading2"],textColor=colors.HexColor("#173ea5"),keepWithNext=True,spaceBefore=13)
    center=ParagraphStyle("MinuteTitle",parent=styles["Title"],alignment=TA_CENTER,fontSize=17,leading=22)
    def para(text,style=body):
        return Paragraph(escape(str(text)).replace("\n","<br/>"),style)
    story=[]
    logo=organization.get("logo_path")
    if logo and os.path.isfile(logo):
        try:
            image=Image(logo,width=54,height=54,kind="proportional")
            image.hAlign="CENTER"
            story.append(image)
        except Exception:
            pass
    story.extend([para(organization.get("name") or "MinuteSeal",center),para(definition.name,center),para("FINAL MEETING MINUTES" if final else "DRAFT • FOR REVIEW",center),Spacer(1,8)])
    for i,f in enumerate(definition.fields,1):
        value=values.get(f.id,"")
        story.append(para(f"{i}. {f.label}",heading))
        if f.kind=="table" and value:
            cols=columns(f)
            data=[[para(c) for c in cols]]+[[para(c) for c in line.split("\t")] for line in value.splitlines() if line.strip()]
            table=LongTable(data,colWidths=[doc.width/len(cols)]*len(cols),repeatRows=1,splitByRow=1,splitInRow=1)
            table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#e6edf8")),("GRID",(0,0),(-1,-1),0.35,colors.HexColor("#cbd5e1")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6)]))
            story.append(table)
        elif f.kind=="list" and value:
            story.extend(para(f"{n}. {line}") for n,line in enumerate(value.splitlines(),1) if line.strip())
        else:
            story.append(para(value or ("________________________" if f.kind=="signature" else ("Not recorded in the available meeting record" if f.required else "Not recorded"))))
    def footer(canvas,document):
        canvas.saveState()
        canvas.setFont("Helvetica",9)
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.drawString(42,28,"MinuteSeal | "+("Final" if final else "Draft"))
        canvas.drawRightString(A4[0]-42,28,f"Page {document.page}")
        canvas.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return buffer.getvalue()


def render_docx(definition,values,organization,final=False):
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    doc=Document()
    section=doc.sections[0]
    section.page_width=Inches(8.27)
    section.page_height=Inches(11.69)
    section.left_margin=section.right_margin=Inches(.7)
    section.top_margin=section.bottom_margin=Inches(.7)
    normal=doc.styles["Normal"]
    normal.font.name="Calibri"
    normal.font.size=Pt(11)
    normal.paragraph_format.space_after=Pt(6)
    doc.styles["Heading 1"].font.color.rgb=RGBColor.from_string("173EA5")
    logo=organization.get("logo_path")
    if logo and os.path.isfile(logo):
        try:
            doc.add_picture(logo,width=Inches(.7))
            doc.paragraphs[-1].alignment=WD_ALIGN_PARAGRAPH.CENTER
        except Exception:
            pass
    for value in (organization.get("name") or "MinuteSeal",definition.name,"FINAL MEETING MINUTES" if final else "DRAFT • FOR REVIEW"):
        p=doc.add_heading(value,0)
        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    for i,f in enumerate(definition.fields,1):
        value=values.get(f.id,"")
        if not value and not f.required and f.kind!="signature":
            continue
        doc.add_heading(f"{i}. {f.label}",1)
        if f.kind=="table" and value:
            cols=columns(f)
            table=doc.add_table(rows=1,cols=len(cols))
            table.style="Table Grid"
            for cell,label in zip(table.rows[0].cells,cols):
                cell.text=label
                for run in cell.paragraphs[0].runs:run.bold=True
            table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
            for line in value.splitlines():
                if line.strip():
                    for cell,text in zip(table.add_row().cells,line.split("\t")):cell.text=text
        elif f.kind=="list" and value:
            for line in value.splitlines():
                if line.strip():doc.add_paragraph(line,style="List Number")
        else:
            doc.add_paragraph(value or ("________________________" if f.kind=="signature" else "Not recorded in the available meeting record"))
    footer=section.footer.paragraphs[0]
    footer.text="MinuteSeal | "+("Final" if final else "Draft")+"  •  Page "
    field=OxmlElement("w:fldSimple")
    field.set(qn("w:instr"),"PAGE")
    footer._p.append(field)
    buffer=io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def render_txt(definition,values,organization,final=False):
    return ("\n".join([organization.get("name") or "MinuteSeal",definition.name,"FINAL" if final else "DRAFT",*["\n"+str(i)+". "+f.label+"\n"+(values.get(f.id) or "Not recorded") for i,f in enumerate(definition.fields,1)]])).encode("utf-8")
