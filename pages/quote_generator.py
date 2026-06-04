import streamlit as st
import os
from datetime import datetime, timedelta
import random
from fpdf import FPDF
import io

from auth import require_role

# ----------------------------------------------------------------------
# Page configuration
# ----------------------------------------------------------------------
st.set_page_config(
    page_title="Quote Generator",
    page_icon="📝",
    layout="centered"
)

# Admin-only page: hiding the nav link isn't enough, so block direct-URL access.
require_role("admin")

st.title("📝 RAVES Construction Quote Generator")
st.caption("Generate professional proposal PDFs matching your company template")

# ----------------------------------------------------------------------
# Quote generation form
# ----------------------------------------------------------------------
with st.form("quote_generator_form"):
    col1, col2 = st.columns(2)

    with col1:
        customer_name = st.text_input("Customer Name", help="Client name")
        quote_person = st.selectbox(
            "Architect / Quote Person",
            ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"],
            help="Select who is responsible for the quote"
        )
        project_location = st.text_input("Project Location", help="Site or project address")
        quote_type = st.selectbox(
            "Quote Type",
            ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"],
            help="Select the type of quote to generate"
        )

    with col2:
        date_received = datetime.now().strftime("%Y-%m-%d")
        bid_due_date = st.date_input("Bid Due Date", value=datetime.now() + timedelta(days=14))
        description = st.text_area(
            "Description of Work",
            value="Generated proposal via Quote Generator",
            height=100,
            help="Scope of work details"
        )
        notes = st.text_area("Notes (Optional)", height=100, help="Additional terms or conditions")

    # Cost inputs
    labor_cost = st.number_input("Labor Cost ($)", min_value=0.0, value=0.0, format="%.2f")
    materials_cost = st.number_input("Materials Cost ($)", min_value=0.0, value=0.0, format="%.2f")
    
    submitted = st.form_submit_button(
        "📄 Generate Proposal PDF",
        type="primary",
        use_container_width=True
    )

# ----------------------------------------------------------------------
# PDF Generation Function (Coordinate-Based)
#
# Each section is its own outlined box stacked with gaps, mirroring the
# RAVES "Rough Draft Quote Form" template:
#   header (logo + address) -> Proposal -> info -> description -> footer.
# Boxes are stroked outlines only (style="D"); we never fill, because
# FPDF's default fill colour is black and "DF" would paint solid boxes.
# ----------------------------------------------------------------------
MARGIN = 10
PAGE_W = 210                      # A4 width in mm
CONTENT_W = PAGE_W - 2 * MARGIN   # 190
X0 = MARGIN                       # left content edge (10)
X1 = MARGIN + CONTENT_W           # right content edge (200)
LOGO_ASPECT = 244 / 74           # logo.png native width / height


def _field(pdf, x, y, label, value, label_w, value_w):
    """Draw a bold label followed by a regular-weight value on one line."""
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(x, y)
    pdf.cell(label_w, 6, label, align="L")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_xy(x + label_w, y)
    pdf.cell(value_w, 6, str(value), align="L")


def generate_quote_pdf(data):
    pdf = FPDF(format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(False)  # Manual layout: we place every box ourselves
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    pdf.set_draw_color(0, 0, 0)
    pdf.set_text_color(0, 0, 0)
    pdf.set_line_width(0.5)         # "medium" weight, matching the template

    # 1. HEADER BOX -- logo on top, company address along the bottom.
    hdr_y, hdr_h = MARGIN, 38
    pdf.rect(X0, hdr_y, CONTENT_W, hdr_h, style="D")
    logo_path = "logo.png"
    if os.path.exists(logo_path):
        try:
            logo_w = 78
            pdf.image(logo_path, x=(PAGE_W - logo_w) / 2, y=hdr_y + 3, w=logo_w)
        except Exception:
            pass  # Fall back to text-only header if the image can't be read
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(X0, hdr_y + hdr_h - 9)
    pdf.cell(CONTENT_W, 6, "1704 E. Highland Rd. Highland, MI. 48356", align="C")

    # 2. PROPOSAL TITLE BOX
    title_y, title_h = hdr_y + hdr_h + 4, 14
    pdf.rect(X0, title_y, CONTENT_W, title_h, style="D")
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_xy(X0, title_y + 2)
    pdf.cell(CONTENT_W, title_h - 4, "Proposal", align="C")

    # 3. INFO BOX -- customer details left, architect/location right.
    info_y, info_h = title_y + title_h + 4, 28
    pdf.rect(X0, info_y, CONTENT_W, info_h, style="D")
    LX, RX = X0 + 4, X0 + 100        # left / right column x positions
    r1, r2, r3 = info_y + 5, info_y + 13, info_y + 21
    _field(pdf, LX, r1, "Customer:", data["customer"], 30, 66)
    _field(pdf, RX, r1, "Architect:", data["architect"], 26, 64)
    _field(pdf, LX, r2, "Date Received:", data["date_received"], 30, 66)
    _field(pdf, RX, r2, "Project Location:", data["project_location"], 33, 57)
    _field(pdf, LX, r3, "Bid Due Date:", data["bid_due_date"], 30, 66)

    # 4. DESCRIPTION OF WORK BOX -- label on top, wrapped body text below.
    desc_y, desc_h = info_y + info_h + 4, 151
    pdf.rect(X0, desc_y, CONTENT_W, desc_h, style="D")
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(X0 + 4, desc_y + 3)
    pdf.cell(CONTENT_W - 8, 6, "Description of Work:", align="L")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_xy(X0 + 4, desc_y + 12)
    if data.get("description"):
        pdf.multi_cell(CONTENT_W - 8, 6, str(data["description"]), align="L")
    if data.get("notes"):
        pdf.ln(2)
        pdf.set_x(X0 + 4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(18, 6, "Notes:", align="L")
        pdf.set_font("Helvetica", "", 11)
        pdf.multi_cell(CONTENT_W - 26, 6, str(data["notes"]), align="L")

    # 5. FOOTER BOXES -- signature block (left) and cost summary (right).
    bot_y, bot_h = desc_y + desc_h + 4, 28
    left_w = 95
    pdf.rect(X0, bot_y, left_w, bot_h, style="D")
    for i, lbl in enumerate(("Sign:", "Print:", "Date:")):
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_xy(X0 + 4, bot_y + 4 + i * 8)
        pdf.cell(left_w - 8, 6, lbl, align="L")

    right_x, right_w = 129, 71
    pdf.rect(right_x, bot_y, right_w, bot_h, style="D")
    cost_rows = (
        ("Labor:", f"${data['labor']:,.2f}", False),
        ("Materials:", f"${data['materials']:,.2f}", False),
        ("Total:", f"${data['total']:,.2f}", True),  # Total emphasised
    )
    for i, (lbl, val, bold) in enumerate(cost_rows):
        yy = bot_y + 4 + i * 8
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_xy(right_x + 4, yy)
        pdf.cell(30, 6, lbl, align="L")
        pdf.set_font("Helvetica", "B" if bold else "", 11)
        pdf.set_xy(right_x + 4, yy)
        pdf.cell(right_w - 8, 6, val, align="R")

    # Return bytes for Streamlit's download_button.
    return bytes(pdf.output())

# ----------------------------------------------------------------------
# Handle form submission
# ----------------------------------------------------------------------
if submitted:
    # 1️⃣ Determine quote amount based on type (fallback if labor/materials are 0)
    amount_ranges = {
        "assign Quote": (5000, 50000),
        "T&M": (2000, 20000),
        "Service Call": (500, 5000),
        "Maintenance Request": (1000, 10000),
        "Emergency Repair": (3000, 30000)
    }
    low, high = amount_ranges[quote_type]
    suggested_total = random.randint(low, high)

    # Auto-calculate total if labor/materials provided, else use suggested
    if labor_cost > 0 or materials_cost > 0:
        total_cost = labor_cost + materials_cost
    else:
        total_cost = suggested_total

    # 2️⃣ Prepare data dict
    quote_data = {
        "customer": customer_name or "TBD",
        "date_received": date_received,
        "bid_due_date": bid_due_date.strftime("%Y-%m-%d"),
        "architect": quote_person,
        "project_location": project_location or "TBD",
        "description": description,
        "notes": notes,
        "labor": labor_cost,
        "materials": materials_cost,
        "total": total_cost,
        "quote_type": quote_type
    }

    # 3️⃣ Generate PDF
    try:
        pdf_bytes = generate_quote_pdf(quote_data)
        st.success("✅ Proposal PDF generated successfully!")
        st.balloons()
        
        st.download_button(
            label="📥 Download Proposal PDF",
            data=pdf_bytes,
            file_name=f"Proposal_{customer_name.replace(' ', '_') or 'Client'}_{date_received}.pdf",
            mime="application/pdf",
            use_container_width=True
        )
        
    except Exception as e:
        st.error(f"❌ Failed to generate PDF: {e}")

# ----------------------------------------------------------------------
# Helpful information expander
# ----------------------------------------------------------------------
with st.expander("ℹ️ How Proposal Generation Works"):
    st.markdown("""
    - **Template Match**: The PDF layout uses absolute coordinates to match your RAVES CONSTRUCTION form exactly.  
    - **Grid System**: Uses manual line drawing to ensure borders never overlap or fall off-page.  
    - **Auto-Calculation**: If you enter Labor & Materials costs, the Total updates automatically.  
    """)