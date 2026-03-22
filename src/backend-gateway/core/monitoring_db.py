"""
结构健康监测数据库模块
使用 SQLite 存储历史监测数据，模拟真实传感器数据流
"""
import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path
import random
import math


class MonitoringDatabase:
    """监测数据库管理类"""

    def __init__(self, db_path: str = "data/monitoring.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_database()

    def _init_database(self):
        """初始化数据库表结构"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 创建监测记录表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS monitoring_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                building_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                settlement REAL,          -- 结构沉降 (mm)
                tilt REAL,                -- 水平倾斜 (度)
                stress REAL,              -- 构件应力 (MPa)
                wind_load REAL,           -- 风载耗损 (kN)
                humidity_decay REAL,      -- 温湿度衰变 (%)
                fire_risk REAL,           -- 火险隐患 (级)
                wind_speed REAL,          -- 风速 (m/s)
                temperature REAL,         -- 温度 (°C)
                humidity REAL,            -- 湿度 (%)
                surface_moisture REAL     -- 表面含水率 (%)
            )
        """)

        # 创建索引
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_building_timestamp
            ON monitoring_records(building_id, timestamp)
        """)

        conn.commit()
        conn.close()

    def seed_historical_data(self, building_id: str = "dougong", days: int = 7):
        """
        生成历史监测数据（模拟传感器采集）

        Args:
            building_id: 建筑ID
            days: 生成多少天的历史数据
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 检查是否已有数据
        cursor.execute(
            "SELECT COUNT(*) FROM monitoring_records WHERE building_id = ?",
            (building_id,)
        )
        if cursor.fetchone()[0] > 0:
            conn.close()
            return  # 已有数据，跳过

        # 生成历史数据（每小时一条记录）
        now = datetime.now()
        records = []

        for hour in range(days * 24):
            timestamp = now - timedelta(hours=days * 24 - hour)

            # 模拟传感器数据（带有日周期和随机波动）
            time_factor = math.sin(hour * 2 * math.pi / 24)  # 日周期

            record = (
                building_id,
                timestamp.isoformat(),
                20 + random.uniform(-3, 3) + time_factor * 2,  # 沉降
                15 + random.uniform(-2, 2) + time_factor * 1,  # 倾斜
                35 + random.uniform(-5, 5) + time_factor * 3,  # 应力
                50 + random.uniform(-8, 8) + time_factor * 5,  # 风载
                35 + random.uniform(-4, 4) + time_factor * 2,  # 温湿度衰变
                12 + random.uniform(-2, 2),  # 火险
                2.0 + random.uniform(-0.5, 0.5) + abs(time_factor) * 1.5,  # 风速
                20 + random.uniform(-3, 3) + time_factor * 5,  # 温度
                60 + random.uniform(-10, 10) - time_factor * 10,  # 湿度
                14 + random.uniform(-2, 2) + time_factor * 1,  # 表面含水率
            )
            records.append(record)

        cursor.executemany("""
            INSERT INTO monitoring_records (
                building_id, timestamp, settlement, tilt, stress, wind_load,
                humidity_decay, fire_risk, wind_speed, temperature, humidity, surface_moisture
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, records)

        conn.commit()
        conn.close()

    def get_latest_data(self, building_id: str = "dougong"):
        """
        获取最新监测数据

        Returns:
            dict: 最新的监测数据
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM monitoring_records
            WHERE building_id = ?
            ORDER BY timestamp DESC
            LIMIT 1
        """, (building_id,))

        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        return {
            "building_id": row[1],
            "timestamp": row[2],
            "settlement": row[3],
            "tilt": row[4],
            "stress": row[5],
            "wind_load": row[6],
            "humidity_decay": row[7],
            "fire_risk": row[8],
            "wind_speed": row[9],
            "temperature": row[10],
            "humidity": row[11],
            "surface_moisture": row[12],
        }

    def get_trend_data(self, building_id: str = "dougong", hours: int = 24):
        """
        获取趋势数据（用于绘制趋势图）

        Args:
            building_id: 建筑ID
            hours: 获取最近多少小时的数据

        Returns:
            list: 趋势数据列表
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cutoff_time = (datetime.now() - timedelta(hours=hours)).isoformat()

        cursor.execute("""
            SELECT timestamp, stress FROM monitoring_records
            WHERE building_id = ? AND timestamp >= ?
            ORDER BY timestamp ASC
        """, (building_id, cutoff_time))

        rows = cursor.fetchall()
        conn.close()

        return [
            {"timestamp": i, "value": row[1]}
            for i, row in enumerate(rows)
        ]

    def add_realtime_record(self, building_id: str, data: dict):
        """
        添加实时监测记录（模拟传感器实时上报）

        Args:
            building_id: 建筑ID
            data: 监测数据字典
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO monitoring_records (
                building_id, timestamp, settlement, tilt, stress, wind_load,
                humidity_decay, fire_risk, wind_speed, temperature, humidity, surface_moisture
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            building_id,
            datetime.now().isoformat(),
            data.get("settlement", 0),
            data.get("tilt", 0),
            data.get("stress", 0),
            data.get("wind_load", 0),
            data.get("humidity_decay", 0),
            data.get("fire_risk", 0),
            data.get("wind_speed", 0),
            data.get("temperature", 0),
            data.get("humidity", 0),
            data.get("surface_moisture", 0),
        ))

        conn.commit()
        conn.close()
