import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/useStore';

export function LODManager() {
    const scaleLevel = useStore(state => state.scaleLevel);
    const setScaleLevel = useStore(state => state.setScaleLevel);
    const activeCatalog = useStore(state => state.activeCatalog);

    // 控制切换阈值，加上 hysteresis (迟滞) 避免临界点频繁穿梭引致闪烁抖动
    const THRESHOLD = 60;
    const HYSTERESIS = 5;

    const lastCheck = useRef(0);

    useFrame(({ camera, clock }) => {
        // 仅在有活动建筑时进行距离判断以调度系统性能
        if (!activeCatalog) return;

        // 每 0.25 秒检测一次，降低每帧演算压力，释放主频给 WebGL 动画
        if (clock.elapsedTime - lastCheck.current < 0.25) return;
        lastCheck.current = clock.elapsedTime;

        // 获取相机到原点 (0,0,0) 的距离来估算整体退远程度 (简单曼哈顿近似/标量长)
        const distance = camera.position.length();

        // 核心动态剔除与降级控制 (LOD) 逻辑
        if (scaleLevel === 'MICRO' && distance > THRESHOLD + HYSTERESIS) {
            console.log(`[LODManager] 相机视距 ${distance.toFixed(1)}m 即将超过阈值。由于拉得太远，强制接管并切换宏观模型 (MACRO)`);
            setScaleLevel('MACRO');
        } else if (scaleLevel === 'MACRO' && distance < THRESHOLD - HYSTERESIS) {
            console.log(`[LODManager] 相机视距 ${distance.toFixed(1)}m 已迫近构件。隐藏宏观外架，解构出原生底层木作精模 (MICRO)`);
            setScaleLevel('MICRO');
        }
    });

    return null; // 作为幽灵逻辑组件不占据任何真实的 DOM/Canvas 节点
}
