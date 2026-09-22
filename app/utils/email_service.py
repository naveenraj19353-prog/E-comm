import logging
import smtplib
from email.mime.text import MIMEText

from app.config import APP_PASSWORD, EMAIL, IS_PRODUCTION
from app.services.password_reset_service import RESET_TOKEN_MINUTES

logger = logging.getLogger(__name__)

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_TIMEOUT_SECONDS = 20

GMAIL_AUTH_HELP = (
    "Gmail rejected EMAIL/APP_PASSWORD. Turn on 2-Step Verification, "
    "create a 16-character App Password (Google Account → Security → "
    "App passwords), put it in APP_PASSWORD, and restart the API."
)


class SmtpAuthError(RuntimeError):
    """Gmail SMTP username/password were rejected."""


def _require_smtp_credentials() -> tuple[str, str]:
    email = (EMAIL or "").strip()
    password = (APP_PASSWORD or "").replace(" ", "").strip()
    if email and password:
        return email, password
    if IS_PRODUCTION:
        raise RuntimeError("Email is not configured. Set EMAIL and APP_PASSWORD.")
    return "", ""


def _send_html_email(*, to_email: str, subject: str, html: str) -> bool:
    """Send via Gmail SMTP. Returns False when skipped in non-production."""
    from_email, password = _require_smtp_credentials()
    if not from_email or not password:
        return False

    msg = MIMEText(html, "html")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email

    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS)
    try:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(from_email, password)
        server.send_message(msg)
    except smtplib.SMTPAuthenticationError as error:
        raise SmtpAuthError(GMAIL_AUTH_HELP) from error
    finally:
        try:
            server.quit()
        except Exception:
            pass
    return True


def send_reset_email(user_email: str, reset_link: str) -> None:
    html = f"""
    <h2>Password Reset</h2>
    <p>Click below to reset your password:</p>
    <a href="{reset_link}">Reset Password</a>
    <p>This link expires in {RESET_TOKEN_MINUTES} minutes.</p>
    """
    sent = _send_html_email(
        to_email=user_email,
        subject="Reset Password",
        html=html,
    )
    if not sent:
        logger.warning(
            "Password reset email not sent (EMAIL/APP_PASSWORD missing). "
            "Reset link: %s",
            reset_link,
        )


def send_store_otp_email(user_email: str, code: str) -> None:
    html = f"""
    <h2>Verify your Retail Cosmos store</h2>
    <p>Your verification code is:</p>
    <p style="font-size:1.5rem;font-weight:700;letter-spacing:0.2em">{code}</p>
    <p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>
    """
    sent = _send_html_email(
        to_email=user_email,
        subject="Your Retail Cosmos store verification code",
        html=html,
    )
    if not sent:
        logger.warning(
            "Store signup OTP not emailed (EMAIL/APP_PASSWORD missing). "
            "Code for %s: %s",
            user_email,
            code,
        )
