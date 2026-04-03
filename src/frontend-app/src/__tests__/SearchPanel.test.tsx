import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPanel from '../components/SearchPanel';

// Mock fetch API
global.fetch = vi.fn();

describe('SearchPanel', () => {
  const searchPlaceholder = /输入人物、典故、概念或一句原文/i;
  const props = {
    onOpenDocument: vi.fn(),
    onAsk: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
          title: '斗拱结构',
          content: '斗拱是中国古代建筑特有的构件...',
          source: '营造法式',
          score: 0.85,
        },
      ],
      mode: 'HYBRID',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    const button = screen.getByRole('button', { name: /搜索/i });

    fireEvent.change(input, { target: { value: '斗拱' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/search?q=%E6%96%97%E6%8B%B1')
      );
    });
  });

  it('displays search results with title, content, and source', async () => {
    const mockResponse = {
      results: [
        {
          id: 1,
          title: '斗拱结构',
          content: '斗拱是中国古代建筑特有的构件，用于承重和装饰。',
          source: '营造法式',
          score: 0.85,
        },
      ],
      mode: 'HYBRID',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '斗拱' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText('斗拱结构')).toBeInTheDocument();
      expect(screen.getByText(/斗拱是中国古代建筑特有的构件/i)).toBeInTheDocument();
      expect(screen.getByText(/营造法式/i)).toBeInTheDocument();
    });
  });

  it('opens detail modal when clicking on a result', async () => {
    const mockResponse = {
      results: [
        {
          id: 1,
          title: '斗拱结构',
          content: '斗拱是中国古代建筑特有的构件，用于承重和装饰。',
          source: '营造法式',
          score: 0.85,
        },
      ],
      mode: 'HYBRID',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '斗拱' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText('斗拱结构')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('斗拱结构'));

    await waitFor(() => {
      expect(screen.getAllByText('斗拱结构').length).toBeGreaterThan(1);
    });
  });

  it('supports switching between search modes', () => {
    render(<SearchPanel {...props} />);

    const [fulltextRadio, vectorRadio, hybridRadio] = screen.getAllByRole('radio');

    expect(hybridRadio).toBeChecked();

    fireEvent.click(fulltextRadio);
    expect(fulltextRadio).toBeChecked();

    fireEvent.click(vectorRadio);
    expect(vectorRadio).toBeChecked();
  });

  it('shows error message when search fails', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: '搜索关键词不能为空' }),
    });

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '斗拱' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText(/搜索关键词不能为空/i)).toBeInTheDocument();
    });
  });

  it('shows fallback actions when network request cannot reach the search service', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Failed to fetch'));

    render(<SearchPanel {...props} />);

    const input = screen.getByPlaceholderText(searchPlaceholder);
    fireEvent.change(input, { target: { value: '孔子怎样谈仁' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText(/离线体验样例结果/i)).toBeInTheDocument();
      expect(screen.getByText('体验样例 · 《论语·学而》')).toBeInTheDocument();
    });
  });

  it('routes search results to reading and QA actions', async () => {
    const mockResponse = {
      results: [
        {
          id: 'doc-42',
          document_id: 'real-doc-42',
          title: '斗拱结构',
          content: '斗拱是中国古代建筑特有的构件，用于承重和装饰。',
          source: '营造法式',
          score: 0.85,
        },
      ],
      mode: 'HYBRID',
      total: 1,
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<SearchPanel {...props} />);

    fireEvent.change(screen.getByPlaceholderText(searchPlaceholder), { target: { value: '斗拱' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    expect(await screen.findByText('斗拱结构')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开原文' }));
    expect(props.onOpenDocument).toHaveBeenCalledWith('real-doc-42');

    fireEvent.click(screen.getByRole('button', { name: '去问答' }));
    expect(props.onAsk).toHaveBeenCalledWith(expect.stringContaining('斗拱结构'));
  });
});
