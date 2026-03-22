import React from 'react';
import * as THREE from 'three';
import { useGLTF, OrbitControls, Center, useAnimations, Bounds, Html } from '@react-three/drei';
import { EffectComposer, SSAO, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useStore } from '../store/useStore';
import { ParametricBuilding } from './ParametricBuilding';
import { WorldTiles } from './WorldTiles';
import { LODManager } from './LODManager';
import { BUILDING_CATALOG } from '../data/buildingCatalog';



export function ArchModel({ url }: { url: string }) {
    const { scene, animations } = useGLTF(url);
    const { actions } = useAnimations(animations, scene);

    const lastCommand = useStore(state => state.lastCommand);
    const setSelectedNode = useStore(state => state.setSelectedNode);
    const highlightedType = useStore(state => state.highlightedType);

    // 存储原本的 PBR 材质与力学热力图 ShaderMaterial
    const originalMaterials = React.useRef<Map<string, THREE.Material>>(new Map());
    const stressMaterials = React.useRef<Map<string, THREE.ShaderMaterial>>(new Map());

    // 内联的应力模拟数据（替代已移除的 JSON 文件导入）
    const stressLookup: Record<string, number> = {
        dou: 0.3, gong: 0.5, ang: 0.7, fang: 0.2, ji: 0.4,
        zhu: 0.15, ding: 0.6, sun: 0.55, mao: 0.45, shuatou: 0.35
    };

    // 解析当前对象名称获取对应的应力值模拟结果
    const getStressValue = (name: string) => {
        const lowerName = name.toLowerCase();
        for (const [key, value] of Object.entries(stressLookup)) {
            if (lowerName.includes(key)) return value;
        }
        return 0.3; // 默认较安全的应力值
    };

    // 根据模式切图热力材质
    React.useLayoutEffect(() => {
        scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
                // 缓存原有材质
                if (!originalMaterials.current.has(mesh.uuid)) {
                    originalMaterials.current.set(mesh.uuid, mesh.material as THREE.Material);
                }

                // 懒加载生成基于顶点着色的 ShaderMaterial
                if (!stressMaterials.current.has(mesh.uuid)) {
                    const stressVal = getStressValue(mesh.name);
                    const mat = new THREE.ShaderMaterial({
                        uniforms: {
                            uStress: { value: stressVal },
                            uLightPos: { value: new THREE.Vector3(15, 30, 15) }
                        },
                        vertexShader: `
                            uniform float uStress;
                            uniform vec3 uLightPos;
                            varying vec3 vColor;

                            void main() {
                                vec3 colorLow = vec3(0.1, 0.4, 0.8);   // 安全：蓝色
                                vec3 colorMid = vec3(0.9, 0.8, 0.1);   // 警戒：黄色
                                vec3 colorHigh = vec3(0.8, 0.1, 0.1);  // 临界：红色

                                // 加入少量按 Y 坐标扰动生成渐变应变感
                                float localStress = clamp(uStress + position.y * 0.1, 0.0, 1.0);

                                vec3 heatColor = mix(
                                    mix(colorLow, colorMid, localStress * 2.0),
                                    mix(colorMid, colorHigh, (localStress - 0.5) * 2.0),
                                    step(0.5, localStress)
                                );

                                // 基础顶点漫反射计算，保留空间立体感
                                vec3 vNormal = normalize(normalMatrix * normal);
                                vec3 vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                                vec3 lightDir = normalize(uLightPos - vPosition);
                                float diff = max(dot(vNormal, lightDir), 0.0);
                                
                                vColor = heatColor * (0.4 + 0.6 * diff);
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                            }
                        `,
                        fragmentShader: `
                            varying vec3 vColor;
                            void main() {
                                gl_FragColor = vec4(vColor, 1.0);
                            }
                        `
                    });
                    stressMaterials.current.set(mesh.uuid, mat);
                }

                // 切换材质逻辑
                if (lastCommand?.action === 'stress') {
                    mesh.material = stressMaterials.current.get(mesh.uuid)!;
                } else {
                    const originalMat = originalMaterials.current.get(mesh.uuid)!;

                    // (互动A) 如果当前有图谱高亮选择，则进行材质变化
                    if (highlightedType) {
                        // 防止修改缓存的原始材质，这里 clone 一份临时材质
                        const HighlightMat = (originalMat as THREE.MeshStandardMaterial).clone();

                        // 基于名称粗略匹配，比如 highlightedType为'dou'，网格名称正好包含'dou'
                        const isMatch = mesh.name.toLowerCase().includes(highlightedType.toLowerCase());

                        if (isMatch) {
                            HighlightMat.emissive = new THREE.Color('#c9a063');
                            HighlightMat.emissiveIntensity = 0.8;
                            HighlightMat.transparent = false;
                            HighlightMat.opacity = 1.0;
                        } else {
                            // 未匹配者变半透明暗淡
                            HighlightMat.emissive = new THREE.Color('#000000');
                            HighlightMat.transparent = true;
                            HighlightMat.opacity = 0.2;
                        }
                        mesh.material = HighlightMat;
                    } else {
                        // 恢复原始
                        mesh.material = originalMat;
                    }
                }
            }
        });
    }, [scene, lastCommand?.action, highlightedType]);

    // 处理全局指令驱动的爆炸动画
    React.useEffect(() => {
        if (!actions) return;
        const dougongAnim = actions['dougong'] || Object.values(actions)[0];

        if (!dougongAnim) return;

        // 设置不循环播放，且播放结束时停留在最后一帧
        dougongAnim.setLoop(THREE.LoopOnce, 1);
        dougongAnim.clampWhenFinished = true;

        if (lastCommand?.action === 'explode') {
            dougongAnim.paused = false;
            dougongAnim.timeScale = 1;
            dougongAnim.play();
        } else if (lastCommand?.action === 'idle') {
            // 倒放还原
            if (dougongAnim.isRunning() || dougongAnim.time > 0) {
                dougongAnim.paused = false;
                dougongAnim.timeScale = -1.5; // 加速还原
                dougongAnim.play();
            }
        }
    }, [lastCommand?.action, actions]);

    // 递归克隆材质以避免全局污染，并注入悬停高亮逻辑
    const handlePointerOver = (e: any) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
        // 简单提亮发光
        if (e.object.material) {
            const mat = e.object.material;
            if (!mat.userData.originalEmissive) {
                mat.userData.originalEmissive = mat.emissive ? mat.emissive.clone() : null;
            }
            mat.emissive && mat.emissive.setHex(0x550000); // 泛出微红的高光
        }
    };

    const handlePointerOut = (e: any) => {
        e.stopPropagation();
        document.body.style.cursor = 'auto';
        if (e.object.material && e.object.material.userData && e.object.material.userData.originalEmissive !== undefined) {
            if (e.object.material.userData.originalEmissive) {
                e.object.material.emissive.copy(e.object.material.userData.originalEmissive);
            } else {
                e.object.material.emissive && e.object.material.emissive.setHex(0x000000);
            }
        }
    };

    const handleClick = (e: any) => {
        e.stopPropagation();
        // 设置选中节点名称
        setSelectedNode(e.object.name || '未知构件');
    };

    return (
        <Center>
            {/* 根据模型ID调整缩放比例 */}
            <primitive
                object={scene}
                scale={
                    url.includes('oriental_building') ? 0.015 :
                    url.includes('siheyuan') ? 0.03 :
                    1.0
                }
                onClick={handleClick}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
            />
        </Center>
    );
}

/** 模型画廊配置 — 可展示的古建筑 3D 资产目录 */
const MODEL_GALLERY = [
    { id: 'dougong', url: '/assets/dougong_with_animation.glb', label: '斗拱构件', hasAnimation: true },
    { id: 'oriental', url: '/assets/oriental_building.glb', label: '东方楼阁', hasAnimation: false },
    { id: 'siheyuan', url: '/assets/traditional_chinese_siheyuan_courtyard.glb', label: '四合院', hasAnimation: false },
];

/** 3D 场景内的加载占位提示 */
function LoadingFallback() {
    return (
        <Html center>
            <div style={{ fontFamily: '"Noto Serif SC", serif', color: 'rgba(26,30,35,0.5)', fontSize: 14, letterSpacing: '0.2em', whiteSpace: 'nowrap' }}>
                载入中...
            </div>
        </Html>
    );
}

export function SceneCanvas() {
    const lastCommand = useStore(state => state.lastCommand);
    const activeModelId = useStore(state => state.activeModelId);
    const activeBuilding = useStore(state => state.activeBuilding);
    const isInstantiating = lastCommand?.action === 'instantiate' || lastCommand?.action === 'generate_building';

    // 路由逻辑：优先使用 activeBuilding，回退到 MODEL_GALLERY
    const isParametric = activeBuilding?.renderType === 'parametric';
    const glbUrl = activeBuilding?.renderType === 'glb' && activeBuilding.glbUrl
        ? activeBuilding.glbUrl
        : (MODEL_GALLERY.find(m => m.id === activeModelId) || MODEL_GALLERY[0]).url;
    const glbKey = activeBuilding?.id || activeModelId;

    return (
        <>
            {/* 异步挂载当前选中的模型资产 (非参数化模式才显示) */}
            {!isInstantiating && !isParametric && (
                <React.Suspense fallback={<LoadingFallback />}>
                    <Bounds fit clip observe margin={2.0} damping={6}>
                        <ArchModel key={glbKey} url={glbUrl} />
                    </Bounds>
                </React.Suspense>
            )}

            {/* 核心：大模型意图激活的参数化矩阵拼装建筑 */}
            <ParametricBuilding />

            {/* 隐藏式智能监控：处理远近视距自动隐藏宏巨构并切回基础微观层 (LOD) */}
            <LODManager />

            {/* 沉浸式古建展陈场景环境 (HDR光照 + 阴影 + 地面) */}
            <WorldTiles />

            {/* 后期处理管线：SSAO + Bloom + 色调映射 (降低采样以提升性能) */}
            <EffectComposer multisampling={2}>
                <SSAO
                    samples={11}
                    radius={0.12}
                    intensity={12}
                    luminanceInfluence={0.6}
                    color={new THREE.Color('#1a1e23')}
                />
                <Bloom
                    luminanceThreshold={0.9}
                    luminanceSmoothing={0.3}
                    intensity={0.3}
                    mipmapBlur
                />
                <ToneMapping mode={ToneMappingMode.AGX} />
            </EffectComposer>

            {/* 相机环绕控件 */}
            <OrbitControls
                makeDefault
                autoRotate={false}
                maxDistance={80}
                minDistance={0.5}
                maxPolarAngle={Math.PI * 0.85}
                enableDamping
                dampingFactor={0.15}
            />
        </>
    );
}

export { MODEL_GALLERY };

// 预加载所有 GLB 模型资产（延迟加载以优化首屏）
if (typeof window !== 'undefined') {
    setTimeout(() => {
        MODEL_GALLERY.forEach(m => useGLTF.preload(m.url));
        BUILDING_CATALOG
            .filter(b => b.renderType === 'glb' && b.glbUrl)
            .forEach(b => useGLTF.preload(b.glbUrl!));
    }, 1000);
}
