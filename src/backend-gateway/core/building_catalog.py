from pydantic import BaseModel
from typing import List, Dict

class BuildingVariant(BaseModel):
    id: str
    name: str

class BuildingCategory(BaseModel):
    display_name: str
    description: str
    available_variants: List[BuildingVariant]

BUILDING_CATALOG_DICT: Dict[str, BuildingCategory] = {
    "residential": BuildingCategory(
        display_name="民居体系",
        description="基于《营造法式》标准民房降级模数构建，禁止任何彩绘逾制。",
        available_variants=[
            BuildingVariant(id="courtyard_2_bay", name="标准两进四合院"),
            BuildingVariant(id="courtyard_3_bay", name="标准三进四合院")
        ]
    ),
    "official": BuildingCategory(
        display_name="官府衙门",
        description="严格遵循大门、仪门、大堂、二堂轴线关系的标准制式。",
        available_variants=[
            BuildingVariant(id="yamen_standard", name="标准县衙"),
            BuildingVariant(id="yamen_grand", name="高阶府衙")
        ]
    ),
    "imperial": BuildingCategory(
        display_name="皇宫苑囿",
        description="至高规制，享受十一踩重檐庑殿等极致法式参数映射。",
        available_variants=[
            BuildingVariant(id="palace_hall_9", name="九五至尊大殿"),
            BuildingVariant(id="palace_gate_5", name="五开间城台门")
        ]
    ),
    "bridge": BuildingCategory(
        display_name="桥梁工程",
        description="石券拱推力学参数构建的大型桥梁。",
        available_variants=[
            BuildingVariant(id="stone_arch_single", name="单孔敞肩石拱桥"),
            BuildingVariant(id="stone_arch_multi", name="多孔联拱石桥")
        ]
    )
}
