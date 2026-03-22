import pytest
from unittest.mock import MagicMock, patch
from agents.router import IntentRouter

def test_generate_building_intent():
    # 测试能否解析出宏大建筑类别及生成意图
    mock_zhipu_client = MagicMock()
    # 模拟 GLM-4 返回的 tool_call 数据
    mock_choice = MagicMock()
    mock_tool_call = MagicMock()
    mock_tool_call.function.name = "generate_macro_building"
    mock_tool_call.function.arguments = '{"action": "generate_building", "target": "residential", "need_rag": false}'
    mock_choice.message.tool_calls = [mock_tool_call]
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    
    mock_zhipu_client.chat.completions.create.return_value = mock_response

    # 用 mock_client 替换掉原本要网络请求的 client
    with patch('agents.router.ZhipuAI', return_value=mock_zhipu_client):
        # 强制塞个假密钥避开初始化报错
        with patch.dict('os.environ', {'ZHIPUAI_API_KEY': 'fake_key'}):
            router = IntentRouter()
            res = router._call_glm("帮我搭个四合院看看")
            
            assert res["action"] == "generate_building"
            assert res["target"] == "residential"
            assert res["need_rag"] is False

def test_explode_micro_intent():
    # 测试老版本遗留或新版微观的透视解析能力
    mock_zhipu_client = MagicMock()
    mock_choice = MagicMock()
    mock_tool_call = MagicMock()
    mock_tool_call.function.name = "control_3d_scene"
    mock_tool_call.function.arguments = '{"action": "explode", "target": "dougong", "need_rag": true}'
    mock_choice.message.tool_calls = [mock_tool_call]
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    
    mock_zhipu_client.chat.completions.create.return_value = mock_response

    with patch('agents.router.ZhipuAI', return_value=mock_zhipu_client):
        with patch.dict('os.environ', {'ZHIPUAI_API_KEY': 'fake_key'}):
            router = IntentRouter()
            res = router._call_glm("斗拱是怎么受力的？你可以拆开给我讲解一下吗")
            
            assert res["action"] == "explode"
            assert res["target"] == "dougong"
            assert res["need_rag"] is True
