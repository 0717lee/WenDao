import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { BuildingConfigParameter, InstancedGenerationContext } from './ModularSystem';

/**
 * 宏观木结构骨架实例化生成器 (WoodFrameGenerator)
 * 将依据配置文件自动在一帧内分配万余元素的几何缓存区
 */
export function WoodFrameGenerator({ config, context }: { config: BuildingConfigParameter, context: InstancedGenerationContext }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    console.log('[WoodFrameGenerator] 开始生成建筑:', config);

    // 创建虚拟替身操作对象
    const dummy = new THREE.Object3D();

    // 假定：n开间有 n+1 根柱，m进深有 m+1 根柱
    const countX = config.bayCount + 1;
    const countZ = config.depthCount + 1;

    let instanceId = 0;
    
    // ==========================================
    // 1. 生成檐柱与金柱群 (沿XZ阵列)
    // ==========================================
    for (let x = 0; x < countX; x++) {
      for (let z = 0; z < countZ; z++) {
         // 计算宋式材分坐标比例
         const xPos = x * context.caiScaler * 10; // 面阔一间近似 10 材宽
         const zPos = z * Number(context.zhiScaler) * 8;  // 进深近似 8 栔深
         const columnHeight = context.caiScaler * 15; // 柱高约15材

         // Setup position & Scale via Dummy Object
         dummy.position.set(xPos, columnHeight / 2, zPos);
         dummy.scale.set(context.caiScaler * 0.8, columnHeight, context.caiScaler * 0.8);
         dummy.updateMatrix();

         // 注入缓存数组实例
         if (instanceId < context.count) {
             mesh.setMatrixAt(instanceId++, dummy.matrix);
         }
      }
    }
    
    // ==========================================
    // 2. 生成横向额枋/梁 (连结柱子)
    // ==========================================
    for (let x = 0; x < config.bayCount; x++) {
        for (let z = 0; z < countZ; z++) {
            const xPos = (x + 0.5) * context.caiScaler * 10;
            const zPos = z * Number(context.zhiScaler) * 8;
            const columnHeight = context.caiScaler * 15;

            dummy.position.set(xPos, columnHeight, zPos);
            // 横向拉伸成梁 (宽度为10材宽，截面为1材×0.6材)
            dummy.scale.set(context.caiScaler * 10, context.caiScaler * 0.6, context.caiScaler * 0.6);
            dummy.updateMatrix();
            if (instanceId < context.count) {
                mesh.setMatrixAt(instanceId++, dummy.matrix);
            }
        }
    }

    // ==========================================
    // 3. 生成纵向额枋/梁 (连结柱子)
    // ==========================================
    for (let x = 0; x < countX; x++) {
        for (let z = 0; z < config.depthCount; z++) {
            const xPos = x * context.caiScaler * 10;
            const zPos = (z + 0.5) * Number(context.zhiScaler) * 8;
            const columnHeight = context.caiScaler * 15;

            dummy.position.set(xPos, columnHeight, zPos);
            // 纵向拉伸成梁
            dummy.scale.set(context.caiScaler * 0.6, context.caiScaler * 0.6, Number(context.zhiScaler) * 8);
            dummy.updateMatrix();
            if (instanceId < context.count) {
                mesh.setMatrixAt(instanceId++, dummy.matrix);
            }
        }
    }
    
    // 隐藏多余的 Instance
    for (let i = instanceId; i < context.count; i++) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.count = instanceId;
    mesh.instanceMatrix.needsUpdate = true; // 提交给 GPU

    console.log('[WoodFrameGenerator] 生成完成，实例数:', instanceId);

  }, [config, context]);

  // instancedMesh 是 R3F 提供的原生组件语法
  return (
    <instancedMesh
       ref={meshRef}
       args={[context.baseGeometry, context.baseMaterial, context.count]}
       castShadow
       receiveShadow
    />
  );
}

/**
 * 宏观石桥生成器 (StoneBridgeGenerator)
 * 用于生成单孔拱桥的粗模 Instantiate 券石
 */
export function StoneBridgeGenerator({ config, context }: { config: BuildingConfigParameter, context: InstancedGenerationContext }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    useEffect(() => {
        if (!meshRef.current) return;
        const mesh = meshRef.current;
        const dummy = new THREE.Object3D();
        
        // 拱宽设定：设一间为 20 材
        const archSpan = config.bayCount * 20 * context.caiScaler; 
        const stoneBlocks = 30; // 拱圈使用的石块数
        const radius = archSpan / 2;

        let instanceId = 0;

        for (let i = 0; i < stoneBlocks; i++) {
            // 在半圆 180 度内分布
            const angle = Math.PI * (i / (stoneBlocks - 1));
            const xPos = Math.cos(angle) * radius;
            const yPos = Math.sin(angle) * radius; // 此时y向上
            
            dummy.position.set(xPos, yPos, 0);
            
            // 将长条石材转向切线方向，构成拱环
            dummy.rotation.z = angle + Math.PI / 2;
            
            // 拉长作为桥面宽度，假设桥进深等于桥宽
            dummy.scale.set(context.caiScaler, context.caiScaler, context.caiScaler * 15);
            dummy.updateMatrix();

            if (instanceId < context.count) {
                mesh.setMatrixAt(instanceId++, dummy.matrix);
            }
        }

        // 隐藏多余的 Instance
        for (let i = instanceId; i < context.count; i++) {
            dummy.scale.set(0, 0, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.count = instanceId;
        mesh.instanceMatrix.needsUpdate = true;
    }, [config, context]);

    return (
        <instancedMesh
           ref={meshRef}
           args={[context.baseGeometry, context.baseMaterial, context.count]}
           castShadow
           receiveShadow
        />
    );
}

export default {
    WoodFrameGenerator,
    StoneBridgeGenerator
};
