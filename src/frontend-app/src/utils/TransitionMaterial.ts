import * as THREE from 'three';

/**
 * 带有平滑 Dithering (抖动) 淡入淡出能力的自定义材质类。
 * 解决原生 transparent=true 带来的深度排序穿插错乱问题，用于 LOD 巨型网格层叠切换防眨眼硬切。
 */
export class TransitionMaterial extends THREE.MeshStandardMaterial {
    public fadeProgress: number; // 0.0 -> 1.0 (0为隐身，1为实体)
    private _shader: any;

    constructor(parameters: THREE.MeshStandardMaterialParameters = {}) {
        super(parameters);
        this.fadeProgress = 0.0; 
        
        // 我们不开启原生 transparent，而是依靠 clip (discard) 模拟半透明
        this.transparent = false; 

        this.onBeforeCompile = (shader) => {
            shader.uniforms.uFadeProgress = { value: this.fadeProgress };

            shader.fragmentShader = `
                uniform float uFadeProgress;
                
                // 经典的高斯/拜耳噪声函数，用于生成平滑过渡的抖动掩码网点
                float random(vec2 p) {
                    return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453);
                }
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>
                
                // 获取屏幕空间像素坐标
                vec2 screenCoord = gl_FragCoord.xy;
                float noise = random(screenCoord);
                
                // 若随机阈值大于透明度进度，则直接抛弃该像素点，实现网点溶解式的全息投影登场效果
                if (noise > uFadeProgress) {
                    discard;
                }
                `
            );

            this._shader = shader;
        };
    }

    /** 更新 Shader Uniforms */
    public updateFadeProgress(progress: number) {
        this.fadeProgress = THREE.MathUtils.clamp(progress, 0, 1);
        if (this._shader) {
            this._shader.uniforms.uFadeProgress.value = this.fadeProgress;
        }
    }

    /** 自带驱动的动画平滑显现函数 */
    public fadeIn(duration: number = 800) {
        // 重置进度
        this.updateFadeProgress(0);
        const start = performance.now();
        const animate = (time: number) => {
            const elapsed = time - start;
            this.updateFadeProgress(elapsed / duration);
            if (elapsed < duration) {
                requestAnimationFrame(animate);
            } else {
                this.updateFadeProgress(1.0);
            }
        };
        requestAnimationFrame(animate);
    }
}
