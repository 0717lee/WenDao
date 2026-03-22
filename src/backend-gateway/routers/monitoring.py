"""
结构健康监测 (SHM - Structural Health Monitoring) 路由
提供古建筑木构结构的实时监测数据
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict
from datetime import datetime
from core.monitoring_db import MonitoringDatabase

router = APIRouter(prefix="/api/v1/monitoring", tags=["monitoring"])

# 初始化数据库
db = MonitoringDatabase()


class MonitoringMetrics(BaseModel):
    """监测指标数据模型"""
    subject: str  # 指标名称
    value: float  # 当前值 (0-100)
    unit: str  # 单位
    status: str  # 状态: safe/warning/danger
    threshold_warning: float  # 警戒阈值
    threshold_danger: float  # 危险阈值


class MonitoringData(BaseModel):
    """监测数据响应模型"""
    building_id: str
    building_name: str
    timestamp: str
    overall_status: str  # safe/warning/danger
    metrics: List[MonitoringMetrics]
    environmental: Dict[str, float]  # 环境数据
    trend_data: List[Dict[str, float]]  # 趋势数据


def get_monitoring_data_from_db(building_id: str = "dougong") -> MonitoringData:
    """
    从数据库获取监测数据

    实际应用中，这些数据来自：
    - 倾斜传感器 (Tilt Sensor)
    - 应变计 (Strain Gauge)
    - 加速度计 (Accelerometer)
    - 温湿度传感器 (Temperature & Humidity Sensor)
    - 位移传感器 (Displacement Sensor)
    - 气象站 (Weather Station)
    """
    # 确保有历史数据
    db.seed_historical_data(building_id, days=7)

    # 获取最新数据
    latest = db.get_latest_data(building_id)
    if not latest:
        raise HTTPException(status_code=404, detail="未找到监测数据")

    # 获取趋势数据
    trend_data = db.get_trend_data(building_id, hours=24)

    # 构建指标数据
    metrics_config = [
        {
            "subject": "结构沉降",
            "value": latest["settlement"],
            "unit": "mm",
            "threshold_warning": 50,
            "threshold_danger": 80,
        },
        {
            "subject": "水平倾斜",
            "value": latest["tilt"],
            "unit": "°",
            "threshold_warning": 40,
            "threshold_danger": 70,
        },
        {
            "subject": "构件应力",
            "value": latest["stress"],
            "unit": "MPa",
            "threshold_warning": 60,
            "threshold_danger": 85,
        },
        {
            "subject": "风载耗损",
            "value": latest["wind_load"],
            "unit": "kN",
            "threshold_warning": 70,
            "threshold_danger": 90,
        },
        {
            "subject": "温湿度衰变",
            "value": latest["humidity_decay"],
            "unit": "%",
            "threshold_warning": 60,
            "threshold_danger": 80,
        },
        {
            "subject": "火险隐患",
            "value": latest["fire_risk"],
            "unit": "级",
            "threshold_warning": 50,
            "threshold_danger": 75,
        },
    ]

    # 计算状态
    metrics = []
    max_value = 0
    for m in metrics_config:
        if m["value"] >= m["threshold_danger"]:
            status = "danger"
        elif m["value"] >= m["threshold_warning"]:
            status = "warning"
        else:
            status = "safe"

        metrics.append(MonitoringMetrics(
            subject=m["subject"],
            value=round(m["value"], 1),
            unit=m["unit"],
            status=status,
            threshold_warning=m["threshold_warning"],
            threshold_danger=m["threshold_danger"],
        ))
        max_value = max(max_value, m["value"])

    # 整体状态
    if max_value >= 85:
        overall_status = "danger"
    elif max_value >= 60:
        overall_status = "warning"
    else:
        overall_status = "safe"

    # 环境数据
    environmental = {
        "wind_speed": round(latest["wind_speed"], 1),
        "temperature": round(latest["temperature"], 1),
        "humidity": round(latest["humidity"], 1),
        "surface_moisture": round(latest["surface_moisture"], 1),
    }

    return MonitoringData(
        building_id=building_id,
        building_name="斗拱构件" if building_id == "dougong" else building_id,
        timestamp=latest["timestamp"],
        overall_status=overall_status,
        metrics=metrics,
        environmental=environmental,
        trend_data=trend_data,
    )


@router.get("/health/{building_id}", response_model=MonitoringData)
async def get_building_health(building_id: str):
    """
    获取指定建筑的结构健康监测数据

    Args:
        building_id: 建筑ID (如 dougong, taihe, siheyuan 等)

    Returns:
        MonitoringData: 包含雷达图指标、环境数据、趋势数据
    """
    try:
        data = get_monitoring_data_from_db(building_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取监测数据失败: {str(e)}")


@router.get("/health", response_model=MonitoringData)
async def get_default_health():
    """获取默认建筑的监测数据"""
    return get_monitoring_data_from_db("dougong")

