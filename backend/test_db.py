#!/usr/bin/env python3
"""Test database persistence"""
import requests
import json

# Test adding a message
msg_data = {
    "author_id": "user-1",
    "content": "Hello from the database!"
}

response = requests.post(
    "http://localhost:8001/v1/conversations/test-db-conv/messages",
    headers={"Content-Type": "application/json"},
    json=msg_data
)

print("Add message response:")
print(json.dumps(response.json(), indent=2))

# Test fetching messages
response = requests.get("http://localhost:8001/v1/conversations/test-db-conv/messages")
print("\nFetch messages response:")
print(json.dumps(response.json(), indent=2))

# Test list conversations
response = requests.get("http://localhost:8001/v1/conversations")
print("\nList conversations:")
print(json.dumps(response.json(), indent=2))