import os
import openai
from typing import Dict, Any

openai.api_key = os.getenv("OPENAI_API_KEY")

async def parse_email_with_llm(email: Dict[str, Any]) -> Dict[str, Any]:
    body = email.get("body", {}).get("content", "") or email.get("bodyPreview", "")
    sender = email.get("from", {}).get("emailAddress", {})
    sender_name = sender.get("name", "")
    sender_email = sender.get("address", "")
    
    prompt = f"""
    Extract structured data from this grocery construction email. Return JSON:
    - "date": ISO 8601 (e.g., "2025-01-15"). Infer if not explicit.
    - "assigned_to": Person/team. Null if unclear.
    - "quote": Monetary figure (e.g., "$12,300"). Null if none.
    - "summary": Concise AI summary (max 200 chars).

    Subject: {email.get('subject', '')}
    From: {sender_name} <{sender_email}>
    Date: {email.get('receivedDateTime', '')}
    Body: {body[:1500]}
    """
    try:
        resp = await openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=200
        )
        import json
        data = json.loads(resp.choices[0].message.content.strip())
        return {
            "date": data.get("date"),
            "assigned_to": data.get("assigned_to"),
            "quote": data.get("quote"),
            "summary": (data.get("summary") or "")[:200]
        }
    except Exception as e:
        print(f"LLM fallback: {e}")
        return {"date": None, "assigned_to": None, "quote": None, "summary": body[:200]}