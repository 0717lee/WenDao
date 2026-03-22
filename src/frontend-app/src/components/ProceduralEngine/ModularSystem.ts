import * as THREE from 'three';
import { TransitionMaterial } from '../../utils/TransitionMaterial';

// 渲染参数骨架预制类型 (来源于 frontend-app.md 数据模型)
export interface BuildingConfigParameter {
    type: 'residential' | 'official' | 'imperial' | 'bridge'; 
    bayCount: number; // 面阔间数
    depthCount: number; // 进深架数
    roofType: 'wudian' | 'xieshan' | 'yingshan' | 'stone_arch'; 
}

// 用于传递给渲染矩阵构建函数的上下文
export interface InstancedGenerationContext {
    baseMaterial: THREE.Material;
    baseGeometry: THREE.BufferGeometry;
    count: number;
    // 材分模数转换系数： 1 材 = X 单位世界坐标长
    caiScaler: number; 
    zhiScaler: number;
}

/**
 * 宏微观双态引擎：基于宋代《营造法式》材分制的基础换算系统
 * 将木构与砖石的体量计算转划为基于相对比例（材/栔/分）的 ThreeJS 空间座标
 */
export class ModularSystem {
    private caiScaler: number;
    private zhiScaler: number;
    
    // WebGL Buffer 缓存池以防由于实例化引发严重 OOM
    private materialCache: Record<string, THREE.Material | TransitionMaterial> = {};
    private geometryCache: Record<string, THREE.BufferGeometry> = {};

    /**
     * @param caiScaler 1材在三维空间的长度定义，默认为 0.5 基础单位
     * @param zhiScaler 1栔在三维空间的长度定义，默认为 0.3 基础单位
     */
    constructor(caiScaler: number = 0.5, zhiScaler: number = 0.3) {
        this.caiScaler = caiScaler;
        this.zhiScaler = zhiScaler;
        this._initCache();
    }

    private _initCache() {
        // == 基础木构材质 ==
        const woodMat = new TransitionMaterial({
            color: 0x8b0000,
            roughness: 0.8,
            metalness: 0.1
        });
        woodMat.updateFadeProgress(1.0); // 立即设置为完全可见
        this.materialCache['wood_red'] = woodMat;

        // == 基础石构材质 ==
        const stoneMat = new TransitionMaterial({
            color: 0x888888,
            roughness: 0.9,
            metalness: 0.0
        });
        stoneMat.updateFadeProgress(1.0); // 立即设置为完全可见
        this.materialCache['stone_grey'] = stoneMat;

        // 基础几何替身
        // InstanceMesh 会复用这一个 Geometry 借由 Matrix 伸缩重置形态，节省数十倍 Draw Call
        this.geometryCache['box_base'] = new THREE.BoxGeometry(1, 1, 1);
        this.geometryCache['cylinder_base'] = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    }
    
    public getMaterial(key: string): THREE.Material | TransitionMaterial {
        return this.materialCache[key] || this.materialCache['wood_red'];
    }
    
    public getGeometry(key: string): THREE.BufferGeometry {
        return this.geometryCache[key] || this.geometryCache['box_base'];
    }

    public getCaiScaler(): number {
        return this.caiScaler;
    }

    public getZhiScaler(): number {
        return this.zhiScaler;
    }
    
    /**
     * 基于输入材份数量计算世界坐标三维相对基准高/宽
     * @param caiCount 多少个材
     * @return 该材份数在 Three.js 世界引擎中的实际拉伸单位 (Units)
     */
    public calculateLengthFromCai(caiCount: number): number {
        return caiCount * this.caiScaler;
    }

    /**
     * 柱高估算函数：依古籍，多取平柱高位 15 到 18 材
     */
    public calculateColumnHeight(cai: number = 15): number {
        return cai * this.caiScaler;
    }
}
