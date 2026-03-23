import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchPanel from '../components/SearchPanel';

// Mock fetch API
global.fetch = vi.fn();

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders search input and button', () => {
    render(<SearchPanel />);
    
    expect(screen.getByPlaceholderText(/输入关键词搜索/i)).toBeInTheDocument();
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
          score: 0.85
        }
      ],
      mode: 'HYBRID',
      total: 1
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    render(<SearchPanel />);
    
    const input = screen.getByPlaceholderText(/输入关键词搜索/i);
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
          score: 0.85
        }
      ],
      mode: 'HYBRID',
      total: 1
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    render(<SearchPanel />);
    
    const input = screen.getByPlaceholderText(/输入关键词搜索/i);
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
          score: 0.85
        }
      ],
      mode: 'HYBRID',
      total: 1
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    render(<SearchPanel />);
    
    const input = screen.getByPlaceholderText(/输入关键词搜索/i);
    fireEvent.change(input, { target: { value: '斗拱' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText('斗拱结构')).toBeInTheDocument();
    });

    // Click on result to open modal
    fireEvent.click(screen.getByText('斗拱结构'));

    // Modal should show full content
    await waitFor(() => {
      expect(screen.getAllByText('斗拱结构').length).toBeGreaterThan(1);
    });
  });

  it('supports switching between search modes', () => {
    render(<SearchPanel />);
    
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
      json: async () => ({ detail: '搜索关键词不能为空' })
    });

    render(<SearchPanel />);
    
    const input = screen.getByPlaceholderText(/输入关键词搜索/i);
    fireEvent.change(input, { target: { value: '斗拱' } });
    fireEvent.click(screen.getByRole('button', { name: /搜索/i }));

    await waitFor(() => {
      expect(screen.getByText(/搜索关键词不能为空/i)).toBeInTheDocument();
    });
  });
});
