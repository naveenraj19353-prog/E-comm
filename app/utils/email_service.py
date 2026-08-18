import smtplib
from email.mime.text import MIMEText
import os
from dotenv import load_dotenv

load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587


EMAIL = os.getenv("EMAIL")
APP_PASSWORD = os.getenv("APP_PASSWORD")


def send_reset_email(user_email: str, reset_link: str):
    html = f"""
    <h2>Password Reset</h2>
    <p>Click below to reset your password:</p>
    <a href="{reset_link}">
        Reset Password
    </a>
    <p>This link expires in 30 minutes.</p>
    """
    msg = MIMEText(html, "html")

    msg["Subject"] = "Reset Password"
    msg["From"] = EMAIL
    msg["To"] = user_email

    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)

    server.starttls()
    server.login(EMAIL, APP_PASSWORD)

    server.send_message(msg)

    server.quit()
