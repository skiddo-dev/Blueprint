import re
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
import os

logger = logging.getLogger(__name__)

class TaskPayload(BaseModel):
    title: str = Field(..., max_length=150)
    from_name: str
    from_email: str
    summary: str = Field(..., max_length=500)
    status: str = Field(..., pattern="^(new|in_progress|review|done|cancelled)$")
    quote_amount: Optional[str] = None
    date: Optional[str] = None
    notes: str = ""
    assign_to: str = "Unassigned"
    priority: str = Field(..., pattern="^(low|medium|high|urgent)$")

# Use os.environ to avoid Pydantic Settings conflicts
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", None)

class LLMParser:
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=OPENAI_API_KEY,
            base_url=OPENAI_BASE_URL or None,
        )
        self.model = OPENAI_MODEL

    async def parse(self, email: Dict[str, Any]) -> Dict[str, Any]:
        subject = email.get("subject", "No Subject")
        from_addr = email.get("from", {})
        body = self._clean_html(email.get("body", ""))[:3000]

        prompt = f"""Subject: {subject}
From: {from_addr.get('name', 'Unknown')} <{from_addr.get('email', 'unknown@example.com')}>
Body: {body}

Return ONLY valid JSON matching this schema:
{TaskPayload.model_json_schema()}"""

        try:
            resp = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1000,
            )
            content = resp.choices[0].message.content
            parsed = TaskPayload.model_validate_json(content).model_dump()
            logger.info(f"LLM parsed email: '{parsed['title']}' → status: {parsed['status']}")
            return parsed
        except Exception as e:
            logger.error(f"LLM parsing failed: {e}. Using fallback.")
            return self._fallback_parse(email)

    def _clean_html(self, html: str) -> str:
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"&nbsp;", " ", text)
        text = re.sub(r"&amp;", "&", text)
        text = re.sub(r"&lt;", "<", text)
        text = re.sub(r"&gt;", ">", text)
        text = re.sub(r"\n+", "\n", text)
        return text.strip()

    def _fallback_parse(self, email: Dict[str, Any]) -> Dict[str, Any]:
        body = email.get("body", "")
        price_match = re.search(r'\$[\d,]+\.?\d*', body)
        return {
            "title": email.get("subject", "Email Task"),
            "from_name": email.get("from", {}).get("name", "Unknown"),
            "from_email": email.get("from", {}).get("email", ""),
            "summary": body[:200],
            "status": "new",
            "quote_amount": price_match.group(0) if price_match else None,
            "date": None,
            "notes": body[:500],
            "assign_to": "Unassigned",
            "priority": "medium"
        }