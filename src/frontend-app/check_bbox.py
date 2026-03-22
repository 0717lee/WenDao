import json
import struct

def get_glb_bbox(path):
    with open(path, 'rb') as f:
        magic = f.read(4)
        version = struct.unpack('<I', f.read(4))[0]
        length = struct.unpack('<I', f.read(4))[0]
        chunk_len = struct.unpack('<I', f.read(4))[0]
        chunk_type = f.read(4)
        if chunk_type == b'JSON':
            json_data = f.read(chunk_len).decode('utf-8')
            gltf = json.loads(json_data)
            accessors = gltf.get('accessors', [])
            
            for i, acc in enumerate(accessors):
                if acc.get('type') == 'VEC3' and acc.get('min') and acc.get('max'):
                    print(f"Accessor {i} min: {acc['min']}, max: {acc['max']}")
        else:
            print("Not a valid GLB JSON chunk.")

if __name__ == "__main__":
    get_glb_bbox('c:/Users/谦友Lee/Desktop/Project/ArchTwin/src/frontend-app/public/assets/dougong_with_animation.glb')
