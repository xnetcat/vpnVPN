#!/bin/bash

# Example usage script demonstrating the local development features

echo "╔══════════════════════════════════════════════════════════╗"
echo "║      vpnVPN Local Development - Quick Example            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

API_URL="http://localhost:8080"

echo "1️⃣  Starting mock API in the background..."
cd mock-api
npm install --silent 2>&1 > /dev/null
PORT=8080 node index.js &
API_PID=$!
cd ..

echo "   Waiting for API to start..."
sleep 3

echo ""
echo "2️⃣  Checking API status..."
curl -s "$API_URL/test/status" | jq '.'

echo ""
echo "3️⃣  Adding a test peer..."
curl -s -X POST "$API_URL/test/add-peer" \
  -H 'Content-Type: application/json' \
  -d '{
    "public_key": "ExampleClientPubKey123456789ABCDEF=",
    "allowed_ips": ["10.8.0.2/32"]
  }' | jq '.'

echo ""
echo "4️⃣  Viewing system info..."
curl -s "$API_URL/test/info" | jq '.vpn_servers, .peers, .connection_info.token'

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                 Example Complete!                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Open dashboard in browser:"
echo "   open http://localhost:8080/dashboard"
echo ""
echo "🛑 To stop the API:"
echo "   kill $API_PID"
echo ""
echo "Or use Ctrl+C to stop this script and:"
echo "   ./stop-local.sh"
echo ""

# Keep running until user interrupts
echo "Press Ctrl+C to stop..."
wait $API_PID

