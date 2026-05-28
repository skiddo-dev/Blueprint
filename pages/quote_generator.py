import streamlit as st
import os
from datetime import datetime, timedelta
import random
from fpdf import FPDF
import io

# ----------------------------------------------------------------------
# Page configuration
# ----------------------------------------------------------------------
st.set_page_config(
    page_title="Quote Generator",
    page_icon="📝",
    layout="centered"
)

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
# PDF Generation Function
# ----------------------------------------------------------------------
def generate_quote_pdf(data):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_font("Helvetica", size=10)
    
    # 🖼️ FULL PAGE BORDER
    pdf.set_draw_color(0, 0, 0)
    pdf.set_line_width(0.5)
    pdf.rect(10, 10, 190, 277)

    # 🏢 LOGO PLACEMENT
    logo_path = "logo.png"
    if os.path.exists(logo_path):
        pdf.image(logo_path, x=57, y=12, w=95)
        pdf.ln(12)
    else:
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 10, "RAVES CONSTRUCTION", new_x="LMARGIN", new_y="NEXT", align="C")
        pdf.ln(5)

    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 7, "1704 E. Highland Rd. Highland, MI. 48356", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Proposal", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)

    col_widths = [45, 45, 45, 55]

    info_headers = ["Customer:", "Date Received:", "Bid Due Date:", "Architect:"]
    info_rows = [
        [data["customer"], data["date_received"], data["bid_due_date"], data["architect"]],
        ["", "", "", data["project_location"]]
    ]
    pdf.table(
        headers=info_headers, data=info_rows, col_widths=col_widths,
        padding=2, line_height=7, align="L", fill=True, border=1,
        line_options={"stroke_style": "S"}
    )
    pdf.ln(3)

    desc_headers = ["Description of Work:"]
    desc_rows = [[""] * 4 for _ in range(12)]
    pdf.table(
        headers=desc_headers, data=desc_rows, col_widths=col_widths,
        padding=2, line_height=7, align="L", border=1,
        line_options={"stroke_style": "S"}
    )
    pdf.ln(3)

    left_headers = ["Sign:", "Print:", "Date:"]
    left_rows = [[""], [""], [""]]
    pdf.table(
        headers=left_headers, data=left_rows, col_widths=[80],
        padding=2, line_height=7, align="L", fill=True, border=1,
        line_options={"stroke_style": "S"}
    )
    pdf.ln(2)

    right_headers = ["Labor:", "Materials:", "Total:"]
    right_rows = [[f"${data['labor']:.2f}"], [f"${data['materials']:.2f}"], [f"${data['total']:.2f}"]]
    pdf.table(
        headers=right_headers, data=right_rows, col_widths=[80],
        padding=2, line_height=7, align="L", fill=True, border=1,
        line_options={"stroke_style": "S"}
    )
    pdf.ln(10)
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
        
        st.info("💡 Tip: Edit the `generate_quote_pdf()` function to add your company logo image or adjust grid spacing.")
        
    except Exception as e:
        st.error(f"❌ Failed to generate PDF: {e}")

# ----------------------------------------------------------------------
# Helpful information expander
# ----------------------------------------------------------------------
with st.expander("ℹ️ How Proposal Generation Works"):
    st.markdown("""
    - **Template Match**: The PDF layout exactly matches your RAVES CONSTRUCTION proposal form.  
    - **Auto-Calculation**: If you enter Labor & Materials costs, the Total updates automatically. Otherwise, it uses the quote type's suggested range.  
    - **Grid Structure**: Uses `fpdf2`'s table renderer for precise borders and alignment.  
    - **Customization**: 
      - Add a logo: Replace the header text with `pdf.image("your_logo.png", x=10, y=10, w=30)` in `generate_quote_pdf()`.  
      - Adjust grid rows: Modify `desc_rows = [[""] * 4 for _ in range(12)]` to add/remove description lines.  
      - Change fonts: Use `pdf.add_font("CustomFont", fname="font.ttf")` and `pdf.set_font("CustomFont", size=10)`.  
    """)
