from fastapi import APIRouter
from core.building_catalog import BUILDING_CATALOG_DICT

router = APIRouter(tags=["Catalog"])

@router.get("/api/v1/catalog")
async def get_catalog():
    """返回预设的合规建筑生成名录及参数配置"""
    return BUILDING_CATALOG_DICT
