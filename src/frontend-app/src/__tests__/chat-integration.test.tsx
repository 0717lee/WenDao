import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'
import { useStore } from '../store/useStore'
import { useAuthStore } from '../store/useAuthStore'

// Mock fetch with URL-based routing
global.fetch = vi.fn()

const chatPlaceholder = /贴一句原文，或提问人物、典故、概念/i

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
    await waitFor(() => {
        expect(screen.getByRole('button', { name: '打开导航' })).toBeInTheDocument()
    })
    await waitFor(() => {
        expect(screen.getAllByText('AI问答').length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getAllByText('AI问答')[0])
    await screen.findByPlaceholderText(chatPlaceholder)
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

        await waitFor(() => {
            expect(screen.getByText('古籍智解')).toBeInTheDocument()
        })
        await openChatTab()
        expect(screen.getByPlaceholderText(chatPlaceholder)).toBeInTheDocument()
    })

    it('测试2: 用户可以输入消息并发送', async () => {
        const mockReader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"仁政是"}\n'),
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"孟子提出的治国主张"}\n'),
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

        const input = await screen.findByPlaceholderText(chatPlaceholder)
        const sendButton = screen.getByRole('button', { name: '发送' })

        fireEvent.change(input, { target: { value: '什么是仁政？' } })
        fireEvent.click(sendButton)

        await waitFor(() => {
            expect(screen.getByText('什么是仁政？')).toBeInTheDocument()
        })

        await waitFor(() => {
            expect(screen.getByText(/仁政是孟子提出的治国主张/)).toBeInTheDocument()
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

        const input = await screen.findByPlaceholderText(chatPlaceholder)
        fireEvent.change(input, { target: { value: '测试' } })
        fireEvent.click(screen.getByRole('button', { name: '发送' }))

        await waitFor(() => {
            expect(screen.getByText('测试回答')).toBeInTheDocument()
        })
    })

    it('测试4: 即使后端返回 citations 事件，也不再展示引用卡片', async () => {
        const mockReader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"回答内容"}\n'),
                })
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('event: citations\ndata: {"citations":[{"title":"孟子","source":"梁惠王上"}]}\n\n'),
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

        const input = await screen.findByPlaceholderText(chatPlaceholder)
        fireEvent.change(input, { target: { value: '测试引用' } })
        fireEvent.click(screen.getByRole('button', { name: '发送' }))

        await waitFor(() => {
            expect(screen.getByText('回答内容')).toBeInTheDocument()
        }, { timeout: 3000 })
        expect(screen.queryByText(/梁惠王上/)).toBeNull()
    })

    it('测试4-1: 对模糊起手式会先追问，不会乱答', async () => {
        const mockReader = {
            read: vi.fn()
                .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode('data: {"content":"可以。先把你记得的那一句原文直接贴给我。"}\n'),
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

        const input = await screen.findByPlaceholderText(chatPlaceholder)
        fireEvent.change(input, { target: { value: '我只记得一句古文，请带我从一句话开始' } })
        fireEvent.click(screen.getByRole('button', { name: '发送' }))

        await waitFor(() => {
            expect(screen.getByText(/先把你记得的那一句原文直接贴给我/)).toBeInTheDocument()
        })
    })

    it('测试5: 后端不可用时显示在线服务失败提示', async () => {
        ;(global.fetch as any).mockImplementation((url: string) => {
            if (typeof url === 'string' && url.includes('/api/v1/chat')) {
                return Promise.reject(new Error('Failed to fetch'))
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ documents: [], entries: [], nodes: [], edges: [], frequencies: [], top_entities: [], total_nodes: 0, total_edges: 0 }),
            })
        })

        render(<App />)

        await openChatTab()

        const input = await screen.findByPlaceholderText(chatPlaceholder)
        fireEvent.change(input, { target: { value: '学而时习之是什么意思？' } })
        fireEvent.click(screen.getByRole('button', { name: '发送' }))

        await waitFor(() => {
            expect(screen.getByText(/当前问答服务暂时不可用/)).toBeInTheDocument()
        })
    })
})
