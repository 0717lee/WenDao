import { Environment, SoftShadows, ContactShadows, AccumulativeShadows, RandomizedLight } from '@react-three/drei';

/**
 * 沉浸式古建展陈场景环境
 * 使用 PMREM 级 HDR 环境光照 + 物理阴影 + 天空盒
 * 营造接近实景的古建筑观赏氛围
 */
export function WorldTiles() {
    return (
        <group position={[0, 0, 0]}>
            {/* 柔和真实的物理投影 */}
            <SoftShadows size={25} samples={20} focus={0.5} />

            {/* 环境贴图：使用 sunset 预设，暖色调光照营造古建筑黄昏氛围 */}
            <Environment
                preset="sunset"
                background={false}
                environmentIntensity={0.8}
                environmentRotation={[0, Math.PI / 4, 0]}
            />

            {/* 主光源：模拟傍晚暖阳 */}
            <directionalLight
                position={[20, 35, 15]}
                intensity={1.2}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0002}
                shadow-camera-far={80}
                shadow-camera-left={-30}
                shadow-camera-right={30}
                shadow-camera-top={30}
                shadow-camera-bottom={-30}
                color="#fff4e0"
            />
            {/* 补光：冷色天光，填充暗部 */}
            <directionalLight position={[-15, 10, -15]} intensity={0.4} color="#c5d8ef" />
            {/* 环境底光 */}
            <ambientLight intensity={0.25} color="#eae8df" />

            {/* 展台地面：柔和纸白 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <meshStandardMaterial
                    color="#f2f0e6"
                    roughness={0.92}
                    metalness={0.02}
                />
            </mesh>

            {/* 累积式高质量阴影 */}
            <AccumulativeShadows
                temporal
                frames={60}
                alphaTest={0.85}
                scale={40}
                position={[0, -4.99, 0]}
                color="#1a1e23"
                opacity={0.6}
            >
                <RandomizedLight amount={6} radius={15} ambient={0.5} intensity={1} position={[20, 35, 15]} bias={0.001} />
            </AccumulativeShadows>

            {/* 底部接触阴影：增加贴地感 */}
            <ContactShadows
                position={[0, -4.98, 0]}
                resolution={2048}
                scale={40}
                blur={2}
                opacity={0.35}
                far={12}
                color="#2a2e33"
            />
        </group>
    );
}
