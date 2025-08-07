#!/usr/bin/env python3
"""
Simple WebSocket client to test the backend WebSocket endpoint.
"""
import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8000/v1/conversations/conv-1754564733863/ws"
    
    try:
        print(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            print("✅ Connected successfully!")
            
            # Wait for initial message
            message = await websocket.recv()
            data = json.loads(message)
            print(f"📨 Received: {data}")
            
            # Send a test message
            test_msg = {
                "type": "message",
                "authorId": "user-1", 
                "content": "Test from Python client"
            }
            await websocket.send(json.dumps(test_msg))
            print(f"📤 Sent: {test_msg}")
            
            # Wait for response
            response = await websocket.recv()
            response_data = json.loads(response)
            print(f"📨 Received response: {response_data}")
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())