import http.server
import socketserver
import os

PORT = 8080

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        
        # Add basic cache control for assets to mimic production server
        self.send_header('Cache-Control', 'public, max-age=31536000')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

# Register glTF and glb MIME types
if not '.gltf' in CORSHTTPRequestHandler.extensions_map:
    CORSHTTPRequestHandler.extensions_map['.gltf'] = 'model/gltf+json'
if not '.glb' in CORSHTTPRequestHandler.extensions_map:
    CORSHTTPRequestHandler.extensions_map['.glb'] = 'model/gltf-binary'

def run():
    # Ensure we serve from the directory where the script is located to expose 'assets' folder
    web_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(web_dir)
    
    with socketserver.TCPServer(("", PORT), CORSHTTPRequestHandler) as httpd:
        print(f"Serving at http://localhost:{PORT} with CORS enabled")
        print(f"Test asset URL: http://localhost:{PORT}/assets/dougong.glb")
        httpd.serve_forever()

if __name__ == '__main__':
    run()
