# -*- coding: utf-8 -*-
"""
Pydantic数据模型
定义聊天请求/响应和引用来源的数据结构
"""
from pydantic import BaseModel, Field, field_validator
from pydantic.config import ConfigDict
from typing import List, Optional
import re


def _strip_html(text: str) -> str:
    """Remove HTML/script tags from user input."""
    return re.sub(r'<[^>]+>', '', text)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Citation(BaseModel):
    """引用来源模型"""
    title: str = Field(..., description="古籍标题")
    source: str = Field(..., description="具体出处（如卷数、章节）")

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "title": "《论语》",
            "source": "学而篇",
        }
    })


class ChatRequest(BaseModel):
    """聊天请求模型"""
    message: str = Field(..., min_length=1, max_length=2000, description="用户消息内容")

    @field_validator('message')
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        """验证消息不为空，并过滤 HTML 标签"""
        if not v or not v.strip():
            raise ValueError("消息内容不能为空")
        return _strip_html(v.strip())

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "message": "“学而时习之”是什么意思？"
        }
    })


class ChatResponse(BaseModel):
    """聊天响应模型"""
    answer: str = Field(..., description="AI生成的回答")
    citations: List[Citation] = Field(default_factory=list, description="引用来源列表")

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "answer": "这句话的意思是：学习后经常复习实践，是很快乐的事。",
            "citations": [
                {"title": "《论语》", "source": "学而篇"},
                {"title": "《孟子》", "source": "梁惠王上"},
            ],
        }
    })


# ---- Document Processing Schemas (Phase 2) ----

class DocumentUploadResponse(BaseModel):
    """文档上传OCR识别响应"""
    document_id: str = Field(..., description="文档唯一ID")
    text: str = Field(..., description="OCR识别的文本")
    confidence: float = Field(..., description="OCR置信度")
    image_url: Optional[str] = Field(default=None, description="原图预览地址或 data URL")


class DocumentProcessResponse(BaseModel):
    """文档处理（断句+翻译）响应"""
    punctuated: str = Field(..., description="添加标点后的古文")
    translated: str = Field(..., description="白话翻译")


class WordExplainRequest(BaseModel):
    """字词释义请求"""
    word: str = Field(..., min_length=1, max_length=20, description="待释义的字词")
    context: Optional[str] = Field(default="", max_length=500, description="字词所在的上下文")


class WordExplainResponse(BaseModel):
    """字词释义响应"""
    meaning: str = Field(..., description="字词含义")
    allusion: str = Field(..., description="相关典故")
    citations: List[dict] = Field(default_factory=list, description="引用来源")


# ---- Auth Schemas ----

class UserRegister(BaseModel):
    """用户注册请求"""
    username: str = Field(..., min_length=2, max_length=20, description="用户名")
    email: str = Field(..., min_length=5, max_length=120, description="邮箱地址")
    password: str = Field(..., min_length=6, max_length=64, description="密码")

    @field_validator('username', 'email', 'password')
    @classmethod
    def strip_auth_fields(cls, value: str) -> str:
        cleaned = _strip_html(value.strip())
        if not cleaned:
            raise ValueError("字段不能为空")
        return cleaned

    @field_validator('password')
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode('utf-8')) > 72:
            raise ValueError("密码过长，请缩短至72字节以内")
        return value

    @field_validator('email')
    @classmethod
    def validate_email(cls, value: str) -> str:
        lowered = value.lower()
        if not EMAIL_RE.match(lowered):
            raise ValueError("邮箱格式不正确")
        return lowered

class UserLogin(BaseModel):
    """用户登录请求"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")

    @field_validator('username', 'password')
    @classmethod
    def strip_login_fields(cls, value: str) -> str:
        cleaned = _strip_html(value.strip())
        if not cleaned:
            raise ValueError("字段不能为空")
        return cleaned


class TokenResponse(BaseModel):
    """登录成功响应"""
    token: str = Field(..., description="JWT令牌")
    username: str = Field(..., description="用户名")


class AuthMeResponse(BaseModel):
    """登录态校验响应"""
    user_id: str = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
