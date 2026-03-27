import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'
import { useStore } from '../store/useStore'
import { useAuthStore } from '../store/useAuthStore'

// Mock fetch with URL-based routing
global.fetch = vi.fn()

function mockChatFetch(mockReader: any) {
    (global.fetch as any).mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/chat')) {
            return Promise.resolve({
                ok: true,
                body: { getReader: () => mockReader },
            })
        }
        // Default: return empty response for other endpoints
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ documents: [], entries: [], nodes: [], edges: [], frequencies: [], top_entities: [], total_nodes: 0, total_edges: 0 }),
        })
    })
}

async function openChatTab() {
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }))
    await waitFor(() => {
        expect(screen.getByText('对话')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('对话'))
    await screen.findByPlaceholderText(/输入问题/i)
}

describe('Chat Integration E2E', () => {
    beforeEach(() => {
        const state = useStore.getState()
        state.clearMessages()
        useAuthStore.setState({ token: 'test-token', username: 'tester' })
        vi.clearAllMocks()
        ;(global.fetch as any).mockImplementation(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ documents: [], entries: [], nodes: [], edges: [], frequencies: [], top_entities: [], total_nodes: 0, total_edges: 0 }),
            })
        )
    })

    it('测试1: App.tsx可以切换到ChatInterface组件', async () => {
        render(<App />)

        expect(screen.getByText('古籍智解')).toBeInTheDocument()
        await openChatTab()
        expect(screen.getByPlaceholderText(/输入问题/i)).toBeInTheDocument()
    })

    it('测试2: 用户可以输入消息并发送', async () => {
        const mockReader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"斗拱是"}\n'),
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"中国古代建筑"}\n'),
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: [DONE]\n'),
                })
                .mockResolvedValueOnce({ done: true }),
        }

        mockChatFetch(mockReader)

        render(<App />)

        await openChatTab()

        const input = await screen.findByPlaceholderText(/输入问题/i)
        const sendButton = screen.getByRole('button', { name: '发送' })

        fireEvent.change(input, { target: { value: '什么是斗拱？' } })
        fireEvent.click(sendButton)

        await waitFor(() => {
            expect(screen.getByText('什么是斗拱？')).toBeInTheDocument()
        })

        await waitFor(() => {
            expect(screen.getByText(/斗拱是中国古代建筑/)).toBeInTheDocument()
        }, { timeout: 3000 })
    })

    it('测试3: 模拟SSE响应，验证消息显示在界面上', async () => {
        const mockReader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"测试回答"}\n'),
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: [DONE]\n'),
                })
                .mockResolvedValueOnce({ done: true }),
        }

        mockChatFetch(mockReader)

        render(<App />)

        await openChatTab()

        const input = await screen.findByPlaceholderText(/输入问题/i)
        fireEvent.change(input, { target: { value: '测试' } })
        fireEvent.click(screen.getByRole('button', { name: '发送' }))

        await waitFor(() => {
            expect(screen.getByText('测试回答')).toBeInTheDocument()
        })
    })

    it('测试4: 验证引用来源卡片渲染', async () => {
        const mockReader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"回答内容"}\n'),
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('event: citations\ndata: {"citations":[{"title":"营造法式","source":"宋代李诫"}]}\n\n'),
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: [DONE]\n'),
                })
                .mockResolvedValueOnce({ done: true }),
        }

        mockChatFetch(mockReader)

        render(<App />)

        await openChatTab()

        const input = await screen.findByPlaceholderText(/输入问题/i)
        fireEvent.change(input, { target: { value: '测试引用' } })
        fireEvent.click(screen.getByRole('button', { name: '发送' }))

        await waitFor(() => {
            expect(screen.getByText(/营造法式/)).toBeInTheDocument()
        }, { timeout: 3000 })
    })
})
