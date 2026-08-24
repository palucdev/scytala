import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import Home from '@/app/page';

// Mock next/image to render a plain <img>
vi.mock('next/image', () => ({
  default: (props: React.ComponentProps<'img'>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock the server action
vi.mock('@/actions/audit', () => ({
  getLatestDeploymentInfo: vi.fn(),
}));

import { getLatestDeploymentInfo } from '@/actions/audit';

const mockGetLatestDeploymentInfo = vi.mocked(getLatestDeploymentInfo);

describe('Landing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the hero heading', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    expect(screen.getByText('Scytala')).toBeInTheDocument();
  });

  it('renders the tagline', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    expect(
      screen.getByText(/share your dynamic hypermedia content/i)
    ).toBeInTheDocument();
  });

  it('renders all three feature items', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Share')).toBeInTheDocument();
    expect(screen.getByText('Cooperate')).toBeInTheDocument();
  });

  it('renders feature descriptions', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    expect(
      screen.getByText(/create secure notes, documents, images/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/send your content in form of shareable links/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/modify shared content together/i)
    ).toBeInTheDocument();
  });

  it('renders the Get Started call-to-action linking to /new', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    const cta = screen.getByText('Get Started').closest('a');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/new');
  });

  it('renders the trust signals text', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    expect(
      screen.getByText(/no account required/i)
    ).toBeInTheDocument();
  });

  it('renders the logo image with correct alt text', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    const logo = screen.getByAltText('Scytala cipher logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', '/logo.svg');
  });

  it('displays deployment version when data is available', async () => {
    const createdAt = '2026-08-18T06:00:00Z';
    mockGetLatestDeploymentInfo.mockResolvedValue({
      id: 1,
      app_version: '0.1.1',
      init_data: '{}',
      created_at: createdAt,
    });

    const jsx = await Home();
    render(jsx);

    expect(screen.getByText(/version: 0\.1\.1/i)).toBeInTheDocument();
    expect(
      screen.getByText(dayjs(createdAt).format('YYYY-MM-DD HH:mm'))
    ).toBeInTheDocument();
  });

  it('handles null deployment info gracefully', async () => {
    mockGetLatestDeploymentInfo.mockResolvedValue(null);

    const jsx = await Home();
    render(jsx);

    // Page still renders without crashing
    expect(screen.getByText('Scytala')).toBeInTheDocument();
  });
});
