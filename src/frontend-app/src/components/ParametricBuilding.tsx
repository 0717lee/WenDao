import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store/useStore'
import { useFrame } from '@react-three/fiber'
import { getPBRMaterials } from '../utils/PBRMaterials'
import { ModularSystem, BuildingConfigParameter, InstancedGenerationContext } from './ProceduralEngine/ModularSystem'
import { WoodFrameGenerator, StoneBridgeGenerator } from './ProceduralEngine/Generators'

// 📐 预制高精度原生参数化几何体（遗留微观使用）
const geometries = {
    columnGeom: new THREE.CylinderGeometry(1, 1, 1, 16),
    stoneBaseGeom: new THREE.CylinderGeometry(0.8, 1, 1, 16),
    beamGeom: new THREE.BoxGeometry(1, 1, 1),
}

// ==========================================
// V2 分流一：宏大宇宙层级渲染器 MacroBuildingRenderer
// ==========================================
function MacroBuildingRenderer({ config }: { config: BuildingConfigParameter }) {
    const modularSystem = useMemo(() => new ModularSystem(), []);

    // 调试日志
    useEffect(() => {
        console.log('[MacroBuildingRenderer] 渲染参数化建筑:', config);
    }, [config]);

    // 构造 Instanced 参数上下文
    const context = useMemo<InstancedGenerationContext>(() => {
        let baseGeometry = modularSystem.getGeometry('cylinder_base');
        let baseMaterial = modularSystem.getMaterial('wood_red');

        // 针对石桥的特判降维
        if (config.type === 'bridge') {
            baseGeometry = modularSystem.getGeometry('box_base');
            baseMaterial = modularSystem.getMaterial('stone_grey');
        }

        return {
            caiScaler: modularSystem.getCaiScaler(),
            zhiScaler: modularSystem.getZhiScaler(),
            baseGeometry,
            baseMaterial,
            count: 500 // 降低实例数量以提升性能
        };
    }, [modularSystem, config]);

    // 组件首次挂载即刻触发材质级的平滑高科技登场显现
    useEffect(() => {
        if ('fadeIn' in context.baseMaterial) {
            // 先立即显示，避免闪烁
            (context.baseMaterial as any).updateFadeProgress(1.0);
            // 然后触发淡入动画（可选）
            // (context.baseMaterial as any).fadeIn(1200);
        }
    }, [context.baseMaterial]);

    // 分流调用不同的实例工厂
    if (config.type === 'bridge') {
        return (
            <group>
                <StoneBridgeGenerator config={config} context={context} />
                {/* 桥面地基 */}
                <mesh position={[0, -2, 0]} receiveShadow>
                    <boxGeometry args={[config.bayCount * 20 * context.caiScaler + 4, 0.5, 20]} />
                    <meshStandardMaterial color="#a0a0a0" roughness={0.9} />
                </mesh>
            </group>
        );
    }

    // 否则通用骨架生成（涵盖官府、皇宫、民居等不同等级的面阔进深）
    const buildingWidth = config.bayCount * 10 * context.caiScaler;
    const buildingDepth = config.depthCount * 8 * Number(context.zhiScaler);

    console.log('[MacroBuildingRenderer] 建筑尺寸:', { buildingWidth, buildingDepth, config });

    return (
        <group position={[- buildingWidth / 2, 0, - buildingDepth / 2]}>
            <WoodFrameGenerator config={config} context={context} />

            {/* 简易须弥座石台基补偿展示 */}
            <mesh position={[buildingWidth / 2, -0.5, buildingDepth / 2]} receiveShadow castShadow>
                <boxGeometry args={[buildingWidth + 2, 1, buildingDepth + 2]} />
                <meshStandardMaterial color="#e0e0e0" roughness={0.9} metalness={0.1} />
            </mesh>

            {/* 调试用：添加一个明显的红色立方体确认位置 */}
            <mesh position={[buildingWidth / 2, 5, buildingDepth / 2]}>
                <boxGeometry args={[2, 2, 2]} />
                <meshStandardMaterial color="#ff0000" />
            </mesh>
        </group>
    );
}


// ==========================================
// V2 分流二：微观透视层级渲染器 MicroBuildingRenderer (保持旧有逻辑向下兼容)
// ==========================================
function MicroBuildingRenderer({ lastCommand, activeCatalog }: { lastCommand: any, activeCatalog: BuildingConfigParameter | null }) {
    const materials = useMemo(() => getPBRMaterials(), [])

    const isInstantiating = lastCommand?.action === 'instantiate' || lastCommand?.action === 'dissect' || lastCommand?.action === 'generate_building';
    const isDissecting = lastCommand?.action === 'dissect'

    const dougongGeom = useMemo(() => new THREE.BoxGeometry(1.2, 0.4, 1.2), [])

    // 在宏观命令被下钻查看时，能无缝借取目录的面阔长宽 (而不是用默认的 5 x 3)
    const widthBays = isInstantiating ? (activeCatalog?.bayCount ?? lastCommand?.width_bays ?? 5) : 0
    const depthBays = isInstantiating ? (activeCatalog?.depthCount ?? lastCommand?.depth_bays ?? 3) : 0

    const maxColumns = 10 * 10
    const maxBeams = 10 * 10 * 2

    const columnsRef = useRef<THREE.InstancedMesh>(null!)
    const stoneBasesRef = useRef<THREE.InstancedMesh>(null!)
    const beamsRef = useRef<THREE.InstancedMesh>(null!)
    const dougongsRef = useRef<THREE.InstancedMesh>(null!)

    const roofGroupRef = useRef<THREE.Group>(null!)
    const progressRef = useRef(0)
    const dummy = useMemo(() => new THREE.Object3D(), [])

    useEffect(() => {
        if (!isInstantiating) {
            progressRef.current = 0
            return
        }

        const bayWidth = 4 
        const bayDepth = 4 
        const columnHeight = 5 
        const baseHeight = 0.4 

        let colIndex = 0
        let beamIndex = 0

        const offsetX = (widthBays * bayWidth) / 2
        const offsetZ = (depthBays * bayDepth) / 2

        for (let i = 0; i <= widthBays; i++) {
            for (let j = 0; j <= depthBays; j++) {
                const x = i * bayWidth - offsetX
                const z = j * bayDepth - offsetZ

                dummy.position.set(x, baseHeight / 2, z)
                dummy.scale.set(0.45, baseHeight, 0.45) 
                dummy.updateMatrix()
                stoneBasesRef.current?.setMatrixAt(colIndex, dummy.matrix)

                dummy.position.set(x, baseHeight + columnHeight / 2, z)
                dummy.scale.set(0.35, columnHeight, 0.35) 
                dummy.updateMatrix()
                columnsRef.current?.setMatrixAt(colIndex, dummy.matrix)

                dummy.position.set(x, baseHeight + columnHeight + 0.3, z)
                dummy.scale.set(1.5, 1.5, 1.5) 
                dummy.updateMatrix()
                dougongsRef.current?.setMatrixAt(colIndex, dummy.matrix)

                colIndex++

                if (i < widthBays) {
                    dummy.position.set(x + bayWidth / 2, baseHeight + columnHeight - 0.2, z)
                    dummy.scale.set(bayWidth, 0.6, 0.4) 
                    dummy.updateMatrix()
                    beamsRef.current?.setMatrixAt(beamIndex, dummy.matrix)
                    beamIndex++
                }

                if (j < depthBays) {
                    dummy.position.set(x, baseHeight + columnHeight - 0.5, z + bayDepth / 2)
                    dummy.scale.set(0.4, 0.6, bayDepth) 
                    dummy.updateMatrix()
                    beamsRef.current?.setMatrixAt(beamIndex, dummy.matrix)
                    beamIndex++
                }
            }
        }

        if (columnsRef.current) {
            columnsRef.current.count = colIndex
            columnsRef.current.instanceMatrix.needsUpdate = true
        }
        if (stoneBasesRef.current) {
            stoneBasesRef.current.count = colIndex
            stoneBasesRef.current.instanceMatrix.needsUpdate = true
        }
        if (dougongsRef.current) {
            dougongsRef.current.count = colIndex
            dougongsRef.current.instanceMatrix.needsUpdate = true
        }
        if (beamsRef.current) {
            beamsRef.current.count = beamIndex
            beamsRef.current.instanceMatrix.needsUpdate = true
        }

        if (roofGroupRef.current) {
            roofGroupRef.current.position.set(0, baseHeight + columnHeight + 1.2, 0)
        }

        progressRef.current = 0
    }, [widthBays, depthBays, isInstantiating, dummy])

    const targetOffset = useRef({ roof: 0, dougong: 0, beam: 0, column: 0 });

    useEffect(() => {
        if (isDissecting) {
            targetOffset.current = { roof: 15, dougong: 10, beam: 5, column: 0 };
        } else {
            targetOffset.current = { roof: 0, dougong: 0, beam: 0, column: 0 };
        }
    }, [isDissecting]);

    useFrame((_state, delta) => {
        if (!isInstantiating) return

        if (progressRef.current < 1.0) {
            progressRef.current += delta * 1.2; 
            const t = Math.min(progressRef.current, 1.0);
            const c4 = (2 * Math.PI) / 3;
            const scale = t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;

            if (roofGroupRef.current && !isDissecting) {
                roofGroupRef.current.scale.set(scale, scale, scale);
            }
        }

        if (roofGroupRef.current) {
            const basePosY = 6.6;
            roofGroupRef.current.position.y = THREE.MathUtils.lerp(roofGroupRef.current.position.y, basePosY + targetOffset.current.roof, 0.05);
        }

        if (dougongsRef.current) {
            dougongsRef.current.position.y = THREE.MathUtils.lerp(dougongsRef.current.position.y, targetOffset.current.dougong, 0.05);
        }

        if (beamsRef.current) {
            beamsRef.current.position.y = THREE.MathUtils.lerp(beamsRef.current.position.y, targetOffset.current.beam, 0.05);
        }
    })

    if (!isInstantiating) return null

    const roofWidth = widthBays * 4 + 6
    const roofDepth = depthBays * 4 + 6
    const upperRoofWidth = widthBays * 4 + 2
    const upperRoofDepth = depthBays * 4 + 2

    return (
        <group position={[0, 0, 0]}>
            <instancedMesh ref={stoneBasesRef} args={[geometries.stoneBaseGeom, materials.stoneBase, maxColumns]} castShadow receiveShadow />
            <instancedMesh ref={columnsRef} args={[geometries.columnGeom, materials.columnWood, maxColumns]} castShadow receiveShadow />
            <instancedMesh ref={dougongsRef} args={[dougongGeom, materials.columnWood, maxColumns]} castShadow receiveShadow />
            <instancedMesh ref={beamsRef} args={[geometries.beamGeom, materials.beamPainted, maxBeams]} castShadow receiveShadow />

            <group ref={roofGroupRef}>
                <mesh position={[0, 0, 0]} castShadow receiveShadow material={materials.roofTile}>
                    <boxGeometry args={[roofWidth, 1.2, roofDepth]} />
                </mesh>
                <mesh position={[0, 1.8, 0]} rotation={[0, Math.PI / 4, 0]} scale={[upperRoofWidth / 1.414, 2.5, upperRoofDepth / 1.414]} castShadow receiveShadow material={materials.roofTile}>
                    <cylinderGeometry args={[0.01, 1, 1, 4]} />
                </mesh>
            </group>

            <mesh position={[0, -0.6, 0]} receiveShadow>
                <boxGeometry args={[widthBays * 4 + 8, 1.2, depthBays * 4 + 8]} />
                <meshStandardMaterial color="#e0e0e0" roughness={0.9} />
            </mesh>
        </group>
    )
}

// ==========================================
// 入口枢纽：根据 Zustand scaleLevel 自动路由渲染目标
// ==========================================
export function ParametricBuilding() {
    const scaleLevel = useStore(state => state.scaleLevel)
    const activeCatalog = useStore(state => state.activeCatalog)
    const lastCommand = useStore((state) => state.lastCommand)

    // 调试日志
    useEffect(() => {
        console.log('[ParametricBuilding] 状态更新:', {
            scaleLevel,
            activeCatalog,
            lastCommand: lastCommand?.action,
            hasActiveCatalog: !!activeCatalog
        });
    }, [scaleLevel, activeCatalog, lastCommand]);

    // 修复：MACRO 模式下必须有 activeCatalog 才渲染
    if (scaleLevel === 'MACRO' && activeCatalog) {
        console.log('[ParametricBuilding] 渲染 MACRO 模式，配置:', activeCatalog);
        return <MacroBuildingRenderer config={activeCatalog} />;
    }

    // MICRO 模式或无 activeCatalog 时，使用微观渲染器
    console.log('[ParametricBuilding] 渲染 MICRO 模式');
    return <MicroBuildingRenderer lastCommand={lastCommand} activeCatalog={activeCatalog} />
}
