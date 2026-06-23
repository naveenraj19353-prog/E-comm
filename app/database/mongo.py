from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv('MONGO_URI')
DATABASE_NAME = os.getenv('DATABASE_NAME')

print(DATABASE_NAME, MONGO_URI)

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

print(client)

users = db["users"]
products = db["products"]
categories = db["categories"]
carts = db["carts"]
wishlists = db["wishlists"]
addresses = db["addresses"]
orders = db["orders"]
reviews = db["reviews"]