import os
import ssl
import razorpay
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter

load_dotenv()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")


def _ssl_context():
    context = ssl.create_default_context()


    if hasattr(ssl, "VERIFY_X509_STRICT"):
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return context


class SystemCertAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        kwargs["ssl_context"] = _ssl_context()
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        kwargs["ssl_context"] = _ssl_context()
        return super().proxy_manager_for(*args, **kwargs)


if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    print("Razorpay Key: NOT SET")
else:
    print("Razorpay Key: SET")

session = requests.Session()
session.mount("https://", SystemCertAdapter())

client = razorpay.Client(
    session=session,
    auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
)

client.cert_path = True
