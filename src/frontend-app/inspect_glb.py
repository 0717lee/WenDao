import json
import struct

def inspect_glb(path):
    with open(path, 'rb') as f:
        magic = f.read(4)
        version = struct.unpack('<I', f.read(4))[0]
        length = struct.unpack('<I', f.read(4))[0]
        chunk_len = struct.unpack('<I', f.read(4))[0]
        chunk_type = f.read(4)
        if chunk_type == b'JSON':
            json_data = f.read(chunk_len).decode('utf-8')
            gltf = json.loads(json_data)
            
            print(f"=== GLB Inspector: {path} ===")
            print(f"glTF version: {gltf.get('asset', {}).get('version')}")
            print(f"Generator: {gltf.get('asset', {}).get('generator')}")
            
            # Extensions
            ext_used = gltf.get('extensionsUsed', [])
            ext_req = gltf.get('extensionsRequired', [])
            print(f"\nExtensions Used: {ext_used}")
            print(f"Extensions Required: {ext_req}")
            
            # Materials
            materials = gltf.get('materials', [])
            print(f"\nMaterials ({len(materials)}):")
            for i, mat in enumerate(materials):
                name = mat.get('name', f'Unnamed_{i}')
                print(f"  [{i}] {name}")
                pbr = mat.get('pbrMetallicRoughness', {})
                if pbr:
                    print(f"       baseColorFactor: {pbr.get('baseColorFactor')}")
                    print(f"       metallicFactor: {pbr.get('metallicFactor')}")
                    print(f"       roughnessFactor: {pbr.get('roughnessFactor')}")
                ext = mat.get('extensions', {})
                if ext:
                    print(f"       extensions: {list(ext.keys())}")
            
            # Meshes
            meshes = gltf.get('meshes', [])
            print(f"\nMeshes ({len(meshes)}):")
            for i, m in enumerate(meshes):
                name = m.get('name', f'Unnamed_{i}')
                prims = len(m.get('primitives', []))
                print(f"  [{i}] {name} ({prims} primitives)")
            
            # Nodes
            nodes = gltf.get('nodes', [])
            print(f"\nNodes ({len(nodes)}):")
            for i, n in enumerate(nodes):
                name = n.get('name', f'Unnamed_{i}')
                mesh_ref = n.get('mesh')
                children = n.get('children', [])
                translation = n.get('translation')
                scale = n.get('scale')
                print(f"  [{i}] {name} mesh={mesh_ref} children={children}")
                if translation:
                    print(f"       translation: {translation}")
                if scale:
                    print(f"       scale: {scale}")

if __name__ == "__main__":
    inspect_glb('c:/Users/谦友Lee/Desktop/Project/ArchTwin/src/frontend-app/public/assets/dougong_with_animation.glb')
