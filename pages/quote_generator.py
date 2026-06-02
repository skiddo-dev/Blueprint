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
# ----------------------------------------------------------------------
def generate_quote_pdf(data):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(False)  # Disable auto-break since we handle layout manually
    pdf.set_margins(10, 10, 10)
    pdf.set_font("Helvetica", size=10)

    # 📐 Constants for Layout (A4: 210x297mm)
    MARGIN = 10
    CONTENT_W = 190  # 210 - 2*MARGIN
    X_START = MARGIN
    
    # Column widths for the 4-column grid (Total: 190)
    col_widths = [45, 45, 45, 55] 

    # 1. 🖼️ FULL PAGE BORDER
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.5)
    pdf.rect(MARGIN, MARGIN, CONTENT_W, 277)

    # 2. 🏢 LOGO & HEADER
    logo_path = "logo.png"
    if os.path.exists(logo_path):
        try:
            # Center logo: (210 - 96) / 2 = 57
            pdf.image(logo_path, x=57, y=15, w=96)
            pdf.ln(12) # Skip logo height
        except Exception:
            pass  # Fallback if image fails
    
    # Address Line
    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 7, "1704 E. Highland Rd. Highland, MI. 48356", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)

    # Proposal Title
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Proposal", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)

    # 3. 📋 INFO GRID (3 Rows: Header, Data1, Data2)
    y_info = pdf.get_y()
    row_h = 8
    
    headers = ["Customer:", "Date Received:", "Bid Due Date:", "Architect:"]
    vals1 = [data["customer"], data["date_received"], data["bid_due_date"], data["architect"]]
    vals2 = ["", "", "", data["project_location"]]

    for row_idx, vals in enumerate([headers, vals1, vals2]):
        y = y_info + (row_idx * row_h)
        is_header = (row_idx == 0)
        style = "DF" if is_header else "D" # Fill for header, outline for data
        
        for i, val in enumerate(vals):
            x = X_START + sum(col_widths[:i])
            # Draw Box
            pdf.rect(x, y, col_widths[i], row_h, style=style)
            # Draw Text
            pdf.set_xy(x + 2, y + 1)
            pdf.set_font("Helvetica", "B" if is_header else "", size=10)
            # Truncate text to prevent overflow
            pdf.cell(col_widths[i] - 4, row_h - 2, str(val)[:25], align="L")
    
    pdf.ln(2 * row_h + 4) # Move down past grid

    # 4. 📝 DESCRIPTION GRID
    desc_y = pdf.get_y()
    
    # Draw Header Row for Description
    pdf.rect(X_START, desc_y, CONTENT_W, 8, style="DF")
    pdf.set_xy(X_START + 2, desc_y + 2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(CONTENT_W - 4, 4, "Description of Work:", align="L")
    
    # Draw Grid Lines for Description Body
    row_height = 7
    for r in range(12):
        y = desc_y + 8 + (r * row_height)
        
        # Horizontal Lines
        pdf.line(X_START, y, X_START + CONTENT_W, y)
        pdf.line(X_START, y + row_height, X_START + CONTENT_W, y + row_height)
        
        # Vertical Dividers (at 45, 90, 135)
        for i in range(1, 4):
            x_v = X_START + sum(col_widths[:i])
            pdf.line(x_v, y, x_v, y + row_height)

    pdf.ln(12 * row_height + 8) # Move down past description

    # 5. 📦 BOTTOM BOXES
    bot_y = pdf.get_y() + 2
    box_w = 90
    box_h = 25

    # Left Box (Sign/Print/Date)
    pdf.rect(X_START, bot_y, box_w, box_h, style="DF")
    left_labels = ["Sign:", "Print:", "Date:"]
    for i, lbl in enumerate(left_labels):
        pdf.set_xy(X_START + 2, bot_y + i * 7 + 2)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(box_w - 4, 6, lbl, align="L")

    # Right Box (Labor/Materials/Total)
    right_x = X_START + box_w + 5
    pdf.rect(right_x, bot_y, box_w, box_h, style="DF")
    right_labels = ["Labor:", "Materials:", "Total:"]
    right_vals = [f"${data['labor']:.2f}", f"${data['materials']:.2f}", f"${data['total']:.2f}"]
    for i, lbl in enumerate(right_labels):
        pdf.set_xy(right_x + 2, bot_y + i * 7 + 2)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(35, 6, lbl, align="L")
        pdf.set_xy(right_x + 40, bot_y + i * 7 + 2)
        pdf.set_font("Helvetica", size=10)
        pdf.cell(45, 6, right_vals[i], align="R")

    # ✅ Guaranteed bytes output for Streamlit
    return bytes(pdf.output(dest="S"))

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