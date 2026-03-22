import json
import struct

def get_glb_animations(path):
    with open(path, 'rb') as f:
        magic = f.read(4)
        version = struct.unpack('<I', f.read(4))[0]
        length = struct.unpack('<I', f.read(4))[0]
        chunk_len = struct.unpack('<I', f.read(4))[0]
        chunk_type = f.read(4)
        if chunk_type == b'JSON':
            json_data = f.read(chunk_len).decode('utf-8')
            gltf = json.loads(json_data)
            animations = gltf.get('animations', [])
            if not animations:
                print("No animations found.")
            for i, a in enumerate(animations):
                name = a.get('name', f'Unnamed_{i}')
                print(f"Animation {i}: {name}")
        else:
            print("Not a valid GLB JSON chunk.")

if __name__ == "__main__":
    get_glb_animations('c:/Users/谦友Lee/Desktop/Project/ArchTwin/src/frontend-app/public/assets/dougong_with_animation.glb')
