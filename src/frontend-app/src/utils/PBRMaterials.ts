import * as THREE from 'three';

/**
 * 🎨 PBR 材质增强工厂
 * 提供高质量、带法线凹凸细节的 WebGL 原生物理材质
 */

// 缓存 Canvas 避免重复创建
let cachedCanvas: HTMLCanvasElement | null = null;
let cachedCtx: CanvasRenderingContext2D | null = null;

function getCanvas(): { canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D } {
    if (!cachedCanvas) {
        cachedCanvas = document.createElement('canvas');
        cachedCanvas.width = 512;
        cachedCanvas.height = 512;
        cachedCtx = cachedCanvas.getContext('2d', { willReadFrequently: true });
    }
    return { canvas: cachedCanvas, ctx: cachedCtx! };
}

/**
 * 🌲 程序化生成木纹法线贴图 (Normal Map)
 * 利用柏林噪声或简单的正弦波形变形，生成带流线型凹凸的法线贴图
 */
function createWoodNormalMap(): THREE.CanvasTexture {
    const { canvas, ctx } = getCanvas();
    const w = canvas.width;
    const h = canvas.height;

    // 清空背景为中性法线蓝 (128, 128, 255)
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, w, h);

    // 绘制一些竖向的木缝和纹理结构
    for (let x = 0; x < w; x += 4) {
        // 使用正弦波制造木纹的扭曲和结节感
        // const wave = Math.sin(x * 0.05) * 20;
        const colorDiff = (Math.random() < 0.2) ? 60 : 128; // 随机的法线"坑" (R/G 控制 XY 凹凸)

        ctx.beginPath();
        // ctx.moveTo(x + wave, 0);
        // ctx.lineTo(x - wave, h);

        ctx.lineWidth = Math.random() * 2 + 1;
        ctx.strokeStyle = `rgb(${colorDiff}, 128, 255)`; // R变化代表X轴法线变化

        // 绘制弯曲的线条
        ctx.moveTo(x + Math.sin(0) * 10, 0);
        for (let y = 0; y <= h; y += 20) {
            const xOff = Math.sin(y * 0.02 + x * 0.1) * 15 * Math.sin(y * 0.005);
            ctx.lineTo(x + xOff, y);
        }
        ctx.stroke();
    }

    // 添加一些噪点作为木材的毛孔粗糙度
    const imgData = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
        if (Math.random() > 0.8) {
            imgData.data[i] = Math.max(0, imgData.data[i] - 10);     // dx
            imgData.data[i + 1] = Math.max(0, imgData.data[i + 1] - 10); // dy
        }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 4); // 柱子是纵向拉长的，所以贴图纵向重复多一点
    return texture;
}

/**
 * 🪨 程序化生成石材法线贴图 (粗糙颗粒感)
 */
function createStoneNormalMap(): THREE.CanvasTexture {
    const { canvas, ctx } = getCanvas();
    const w = canvas.width;
    const h = canvas.height;

    // 清空背景为中性法线蓝
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
        // 生成颗粒状的高低起伏
        const noise = (Math.random() - 0.5) * 60;
        imgData.data[i] = Math.min(255, Math.max(0, 128 + noise));       // R (dx)
        imgData.data[i + 1] = Math.min(255, Math.max(0, 128 + noise));   // G (dy)
        // B (dz) 保持 255
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

// 惰性单例模式：不要在一启动时就生成贴图（阻塞主线程），而在第一次需要时生成
let woodNormalTex: THREE.CanvasTexture | null = null;
let stoneNormalTex: THREE.CanvasTexture | null = null;

// ✨ 导出给组件复用的高级材质库对象 (由于要懒加载贴图，改为一个获取材质的工厂类或导出方法)
export const getPBRMaterials = () => {
    if (!woodNormalTex) woodNormalTex = createWoodNormalMap();
    if (!stoneNormalTex) stoneNormalTex = createStoneNormalMap();

    return {
        // 朱砂红大漆：柱身使用，带有轻微的做旧感和极具深度的木纹反光
        columnWood: new THREE.MeshStandardMaterial({
            color: '#8c251d',
            roughness: 0.65, // 稍微光滑亮丽以反射环境光
            metalness: 0.05,
            normalMap: woodNormalTex,
            normalScale: new THREE.Vector2(0.8, 0.8) // 凹凸强度
        }),
        // 汉白玉/青石：柱础使用，灰白颗粒感
        stoneBase: new THREE.MeshStandardMaterial({
            color: '#b0b5b3',
            roughness: 0.95,
            metalness: 0.0,
            normalMap: stoneNormalTex,
            normalScale: new THREE.Vector2(0.5, 0.5)
        }),
        // 青绿彩画：横梁使用，带木纹，偏亚光
        beamPainted: new THREE.MeshStandardMaterial({
            color: '#1a5c53',
            roughness: 0.85,
            metalness: 0.0,
            normalMap: woodNormalTex,
            normalScale: new THREE.Vector2(0.4, 0.4)
        }),
        // 琉璃黄瓦：屋顶使用，高度光滑反射
        roofTile: new THREE.MeshPhysicalMaterial({
            color: '#dca626',
            roughness: 0.25, // 强反射
            metalness: 0.2,
            clearcoat: 0.5, // 仅有的基础车漆涂层级的高光
            clearcoatRoughness: 0.2,
            // 瓦片使用石材噪点来模拟陶土烧制的微小瑕疵
            normalMap: stoneNormalTex,
            normalScale: new THREE.Vector2(0.1, 0.1)
        })
    };
};
