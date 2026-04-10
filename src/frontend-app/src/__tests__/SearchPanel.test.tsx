import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPanel from '../components/SearchPanel';
import { useDocumentStore } from '../store/useDocumentStore';

// Mock fetch API
global.fetch = vi.fn();

describe('SearchPanel', () => {
  const searchPlaceholder = /贴一句原文，或搜人物、典故、概念/i;
  const props = {
    onOpenDocument: vi.fn(),
    onAsk: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.getState().reset();
  });

  it('renders search input and button', () => {
    render(<SearchPanel {...props} />);

    expect(screen.getByPlaceholderText(searchPlaceholder)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /搜索/i })).toBeInTheDocument();
  });

  it('calls search API when search button is clicked', async () => {
    const mockResponse = {
      results: [
        {
          id: 1,
          title: '逍遥游',
          content: '北冥有鱼，其名为鲲。',
          source: '庄子',
          score: 0.85,
        },
      ],
      mode: 'FULLTEXT',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    const button = screen.getByRole('button', { name: /搜索/i });

    fireEvent.change(input, { target: { value: '逍遥游' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/search?q=%E9%80%8D%E9%81%A5%E6%B8%B8&mode=FULLTEXT'),
        expect.anything()
      );
    });
  });

  it('displays search results with title, content, and source', async () => {
    const mockResponse = {
      results: [
        {
          id: 1,
          title: '逍遥游',
          content: '北冥有鱼，其名为鲲。',
          source: '庄子',
          score: 0.85,
        },
      ],
      mode: 'FULLTEXT',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '逍遥游' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText('逍遥游')).toBeInTheDocument();
      expect(screen.getByText(/北冥有鱼，其名为鲲/i)).toBeInTheDocument();
      expect(screen.getAllByText(/庄子/i).length).toBeGreaterThan(0);
    });
  });

  it('opens detail modal when clicking on a result', async () => {
    const mockResponse = {
      results: [
        {
          id: 1,
          title: '逍遥游',
          content: '北冥有鱼，其名为鲲。',
          source: '庄子',
          score: 0.85,
        },
      ],
      mode: 'FULLTEXT',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '逍遥游' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText('逍遥游')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('逍遥游'));

    await waitFor(() => {
      expect(screen.getAllByText('逍遥游').length).toBeGreaterThan(1);
    });
  });

  it('defaults to FULLTEXT mode and still exposes the three search modes', () => {
    render(<SearchPanel {...props} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toBeChecked();
  });

  it('shows error message when search fails', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: '搜索关键词不能为空' }),
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '逍遥游' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText(/搜索关键词不能为空/i)).toBeInTheDocument();
    });
  });

  it('shows service error when network request cannot reach the search service', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Failed to fetch'));

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '孔子怎样谈仁' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText(/检索服务暂时不可用/i)).toBeInTheDocument();
    });
  });

  it('routes search results to reading action only', async () => {
    const mockResponse = {
      results: [
        {
          id: 'doc-42',
          document_id: 'real-doc-42',
          title: '逍遥游',
          content: '北冥有鱼，其名为鲲。',
          source: '庄子',
          score: 0.85,
          anchor_text: '北冥有鱼，其名为鲲。',
        },
      ],
      mode: 'FULLTEXT',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText(searchPlaceholder), { target: { value: '逍遥游' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    expect(await screen.findByText('逍遥游')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开原文' }));
    expect(props.onOpenDocument).toHaveBeenCalledWith('real-doc-42');
    expect(useDocumentStore.getState().pendingAnchorText).toBe('北冥有鱼，其名为鲲。');
    expect(screen.queryByRole('button', { name: '继续追问' })).toBeNull();
  });
});
