import logging
import smtplib
from email.mime.text import MIMEText

from app.config import APP_PASSWORD, EMAIL, IS_PRODUCTION
from app.services.password_reset_service import RESET_TOKEN_MINUTES

logger = logging.getLogger(__name__)

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587


def send_reset_email(user_email: str, reset_link: str) -> None:
    html = f"""
    <h2>Password Reset</h2>
    <p>Click below to reset your password:</p>
    <a href="{reset_link}">Reset Password</a>
    <p>This link expires in {RESET_TOKEN_MINUTES} minutes.</p>
    """
    msg = MIMEText(html, "html")
    msg["Subject"] = "Reset Password"
    msg["From"] = EMAIL or "noreply@omnistore.local"
    msg["To"] = user_email

    if not EMAIL or not APP_PASSWORD:
        if IS_PRODUCTION:
            raise RuntimeError(
                "Email is not configured. Set EMAIL and APP_PASSWORD."
            )
        logger.warning(
            "Password reset email not sent (EMAIL/APP_PASSWORD missing). "
            "Reset link: %s",
            reset_link,
        )
        return

    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    try:
        server.starttls()
        server.login(EMAIL, APP_PASSWORD)
        server.send_message(msg)
    finally:
        server.quit()
