"""Build blank public PDF/Word templates and first-page WebP previews from the canonical presets."""
import json,sys,re
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,KeepTogether
from docx import Document
from docx.shared import Inches,Pt,RGBColor,Mm
import pypdfium2 as pdfium

data=json.loads(Path(sys.argv[1]).read_text())
out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
blue=colors.HexColor("#103a91")
line=colors.HexColor("#b9c5d5")
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name="MS_Title",fontName="Helvetica-Bold",fontSize=20,leading=24,textColor=blue,spaceAfter=12))
styles.add(ParagraphStyle(name="MS_Label",fontName="Helvetica-Bold",fontSize=10,leading=14,textColor=colors.HexColor("#172033"),spaceBefore=8,spaceAfter=4))
styles.add(ParagraphStyle(name="MS_Small",fontName="Helvetica",fontSize=9,leading=13,textColor=colors.HexColor("#475569")))
columns={"attendance":["Name","Role","Status"],"actions":["Action","Responsible person","Due date","Status"],"motions":["Motion","Proposer","Seconder","Outcome"],"risks":["Risk","Mitigation","Responsible person"]}
def para(text,style="MS_Small"):return Paragraph(escape(text),styles[style])
def header(canvas,doc):
    canvas.saveState()
    canvas.setFillColor(blue);canvas.setFont("Helvetica-Bold",10);canvas.drawString(44,809,"MinuteSeal | Meeting minutes")
    canvas.setStrokeColor(line);canvas.line(44,800,551,800)
    canvas.setFont("Helvetica",8);canvas.setFillColor(colors.HexColor("#475569"));canvas.drawString(44,27,"Blank template");canvas.drawRightString(551,27,str(doc.page))
    canvas.restoreState()
def build(f):
    assert re.fullmatch(r"[a-z0-9-]+",f["id"])
    pdf=out/(f["id"]+".pdf");word=out/(f["id"]+".docx");preview=out/(f["id"]+".webp")
    doc=Document();sec=doc.sections[0];sec.page_width=Mm(210);sec.page_height=Mm(297);sec.top_margin=Mm(16);sec.bottom_margin=Mm(16);sec.left_margin=Mm(16);sec.right_margin=Mm(16)
    normal=doc.styles["Normal"];normal.font.name="Arial";normal.font.size=Pt(10);normal.paragraph_format.space_after=Pt(4)
    for name in ["Title","Heading 1"]:
        sty=doc.styles[name];sty.font.name="Arial";sty.font.color.rgb=RGBColor.from_string("103A91");sty.font.size=Pt(20 if name=="Title" else 11)
        sty.paragraph_format.space_before=Pt(8);sty.paragraph_format.space_after=Pt(4)
    sec.header.paragraphs[0].text="MinuteSeal | Meeting minutes";sec.footer.paragraphs[0].text="Blank template"
    doc.core_properties.author="MinuteSeal";doc.core_properties.title=f["name"]+" - blank minutes"
    doc.add_heading(f["name"],0);doc.add_paragraph("Organization: __________________________________________")
    story=[para(f["name"],"MS_Title"),para("Organization: __________________________________________"),Spacer(1,6)]
    for field in f["fields"]:
        label=field["label"];kind=field["kind"];key=field["id"]
        doc.add_heading(label,1);elements=[para(label,"MS_Label")]
        if kind=="table":
            cols=field.get("columns") or columns.get(key,["Item","Details"])
            rows=[[para(c) for c in cols]]+[[""]*len(cols) for _ in range(2)]
            table=Table(rows,colWidths=[507/len(cols)]*len(cols),rowHeights=[21,24,24])
            table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#eef3fa")),("GRID",(0,0),(-1,-1),.5,line),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),6)]))
            elements.append(table)
            t=doc.add_table(rows=3,cols=len(cols));t.style="Table Grid"
            for i,c in enumerate(cols):t.cell(0,i).text=c
        elif kind=="signature":
            for label2 in ["Chairperson: _____________________   Date: __________","Secretary: _______________________   Date: __________"]:
                doc.add_paragraph(label2);elements.append(para(label2))
        else:
            n=2 if kind in ("paragraph","list") else 1
            for _ in range(n):
                doc.add_paragraph("____________________________________________________________")
                elements.append(para("________________________________________________________________________________"))
        story.append(KeepTogether(elements))
    SimpleDocTemplate(str(pdf),pagesize=A4,leftMargin=44,rightMargin=44,topMargin=58,bottomMargin=44,title=f["name"]+" - blank minutes",author="MinuteSeal").build(story,onFirstPage=header,onLaterPages=header)
    doc.save(word)
    pdfdoc=pdfium.PdfDocument(str(pdf))
    page=pdfdoc[0];bitmap=page.render(scale=1.15);image=bitmap.to_pil();image.save(preview,"WEBP",quality=82)
    image.close();bitmap.close();page.close();pdfdoc.close()
    # Verify package can be opened, all three assets have real content.
    assert len(Document(word).paragraphs)>3
    assert all(p.stat().st_size>100 for p in (pdf,word,preview))
for f in data:build(f)
print("Generated",len(data),"PDF, DOCX and rendered first-page previews")
