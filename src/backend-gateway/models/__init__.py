# -*- coding: utf-8 -*-
"""
数据模型包
"""
from .schemas import (
    ChatRequest, ChatResponse, Citation,
    DocumentUploadResponse, DocumentProcessResponse,
    WordExplainRequest, WordExplainResponse,
    ForgotPasswordRequest, ForgotPasswordResponse,
)

__all__ = [
    "ChatRequest", "ChatResponse", "Citation",
    "DocumentUploadResponse", "DocumentProcessResponse",
    "WordExplainRequest", "WordExplainResponse",
    "ForgotPasswordRequest", "ForgotPasswordResponse",
]
