"""
Authentication & authorization for Blueprint.

Auth: Microsoft Entra SSO via Streamlit's native st.login/st.user (configured in
.streamlit/secrets.toml [auth]). Authorization: a per-user role ("admin"/"viewer")
resolved from the ADMIN_EMAILS env bootstrap and the MongoDB `users` collection.
"""
import os
import streamlit as st
from dotenv import load_dotenv

from db import get_user_role

load_dotenv()

# Bootstrap admins so you're never locked out before provisioning anyone in Mongo.
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}


def _user_email() -> str:
    """Email claim from the signed-in user (Microsoft may use preferred_username)."""
    u = st.user
    email = u.get("email") or u.get("preferred_username") or ""
    return email.lower()


def resolve_role(email: str):
    """admin / viewer / None (None = authenticated but not provisioned)."""
    if not email:
        return None
    if email in ADMIN_EMAILS:
        return "admin"
    return get_user_role(email)


def require_login() -> None:
    """Render a sign-in screen and stop the script if the user isn't logged in.
    Degrades to a clear message when auth isn't configured (no [auth] in secrets):
    st.user.is_logged_in only exists once secrets.toml has an [auth] block."""
    logged_in = getattr(st.user, "is_logged_in", None)
    if logged_in is None:
        st.title("🏗️ Blueprint")
        st.error("Authentication isn't configured yet. Create `.streamlit/secrets.toml` with an "
                 "`[auth]` block — see `.streamlit/secrets.toml.example`.")
        st.stop()
    if not logged_in:
        st.title("🏗️ Blueprint")
        st.info("Please sign in with your Microsoft account to continue.")
        st.button("🔐 Sign in with Microsoft", type="primary", on_click=st.login)
        st.stop()


def current_role() -> str:
    """Require login, then return the user's role. Stops with a 'request access'
    screen if the user is signed in but not provisioned."""
    require_login()
    role = resolve_role(_user_email())
    if role is None:
        st.title("🏗️ Blueprint")
        st.warning(f"You're signed in as **{_user_email()}**, but you don't have access yet. "
                   "Please contact an administrator to be added.")
        st.button("Log out", on_click=st.logout)
        st.stop()
    return role


def require_role(required: str) -> str:
    """Require login + (for admin) the admin role; otherwise stop. Returns the role.
    Use to URL-guard pages, since hiding a nav link doesn't block direct access."""
    role = current_role()
    if required == "admin" and role != "admin":
        st.error("🔒 Admin access required.")
        st.page_link("main.py", label="← Back to the board")
        st.stop()
    return role
