import { ModularSystem } from './src/components/ProceduralEngine/ModularSystem';

// 测试清代斗口制8等材的相对系数表现，模拟 1 材 = 0.5 unit (例如 0.5米)
const modSys = new ModularSystem(0.5, 0.3);

const columnHeight = modSys.calculateColumnHeight(15); // 平柱高 15 材
const beamWidth = modSys.calculateLengthFromCai(10); // 假定一个梁宽 10 材

console.log('--- 营造法式 T1.1.1 材分换算引擎单元测试 ---');
console.log(`清代斗口 1 材 scaler: ${modSys.getCaiScaler()}`);
console.log(`换算得出柱高(15材): ${columnHeight} units`);
console.log(`换算得出梁宽(10材): ${beamWidth} units`);

if (columnHeight === 7.5 && beamWidth === 5.0) {
    console.log('✅ 测试通过: 传入“清代斗口制等材”返回预期长宽比例');
} else {
    console.error('❌ 测试失败: 比例缩放换算错误！');
    process.exit(1);
}
