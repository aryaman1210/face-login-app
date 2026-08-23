import urllib.request
import base64
import json
import requests

url = "https://rhjeghqbqnhjvxjzhbns.supabase.co/storage/v1/object/public/faces/aryaman_038e5bd3.jpg"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as response:
    img_data = response.read()

img_b64 = base64.b64encode(img_data).decode('utf-8')

payload = {
    "username": "aryaman",
    "image_base64": img_b64
}

res = requests.post("http://127.0.0.1:8000/api/login", json=payload)
print(res.status_code)
print(res.json())
