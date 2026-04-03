from http.server import BaseHTTPRequestHandler
import json
import random


class handler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_headers(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/" or self.path == "/api/health":
            self._send_json({"message": "Basis84 Quantum Simulator is online."})
            return

        self._send_json({"error": "Not found"}, status=404)

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON payload"}, status=400)
            return

        alice_bits = payload.get("bits", [])
        alice_bases = payload.get("bases", [])
        eavesdropper_active = payload.get("eavesdropperActive", False)

        if len(alice_bits) != len(alice_bases):
            self._send_json({"error": "Bits and bases arrays must be the same length."}, status=400)
            return

        received_states = []
        for i, bit in enumerate(alice_bits):
            current_bit = bit
            current_basis = alice_bases[i]
            if eavesdropper_active:
                eve_basis = random.choice(["+", "X"])
                if eve_basis != current_basis:
                    current_bit = random.choice([0, 1])
            received_states.append(current_bit)

        response = {
            "status": "success",
            "received_states": received_states,
        }
        self._send_json(response, status=200)

    def do_OPTIONS(self):
        self._send_headers()
