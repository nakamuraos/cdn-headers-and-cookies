import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import browser from 'webextension-polyfill';

import {Options} from '@/Options/Options';
import {useActiveTab} from '@/hooks/useActiveTab';

const stub = browser as unknown as {
  storage: {local: {set: ReturnType<typeof vi.fn>; clear: () => Promise<void>}};
  tabs: {
    query: ReturnType<typeof vi.fn>;
    onActivated: {addListener: ReturnType<typeof vi.fn>};
    onUpdated: {addListener: ReturnType<typeof vi.fn>};
  };
  runtime: {sendMessage: ReturnType<typeof vi.fn>};
  sidebarAction?: unknown;
};

beforeEach(async () => {
  await stub.storage.local.clear();
  stub.storage.local.set.mockClear();
  stub.tabs.query.mockClear();
  stub.tabs.onActivated.addListener.mockClear();
  stub.tabs.onUpdated.addListener.mockClear();
  stub.tabs.query.mockResolvedValue([{id: 1, url: 'https://example.com/'}]);
  stub.runtime.sendMessage.mockResolvedValue({status: 'ok', requests: []});
});

describe('the surface setting', () => {
  afterEach(() => {
    delete stub.sidebarAction;
  });

  it('writes the chosen surface through', async () => {
    stub.sidebarAction = {open: vi.fn()};

    render(<Options />);

    const select = await screen.findByLabelText('Open in');
    expect(select).toHaveValue('popup');

    await userEvent.selectOptions(select, 'panel');

    await waitFor(() => {
      expect(stub.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({surface: 'panel'}),
        })
      );
    });
  });

  // Mobile builds have no panel, so offering the choice would only strand the
  // toolbar click on a surface that cannot open.
  it('is not offered where the browser has no panel', async () => {
    render(<Options />);

    await screen.findByLabelText('Skin');
    expect(screen.queryByLabelText('Open in')).not.toBeInTheDocument();
  });
});

function ActiveTabProbe(): React.JSX.Element {
  const {tabUrl} = useActiveTab();

  return <span>{tabUrl || 'none'}</span>;
}

describe('following the active tab', () => {
  it('re-reads when another tab is activated', async () => {
    render(<ActiveTabProbe />);

    await screen.findByText('https://example.com/');
    expect(stub.tabs.query).toHaveBeenCalledTimes(1);

    stub.tabs.query.mockResolvedValue([{id: 2, url: 'https://other.example/'}]);

    const [onActivated] = stub.tabs.onActivated.addListener.mock.calls.at(-1) ?? [];
    await act(async () => {
      (onActivated as () => void)();
    });

    await screen.findByText('https://other.example/');
  });

  it('re-reads a navigation only once it has settled', async () => {
    render(<ActiveTabProbe />);

    await screen.findByText('https://example.com/');

    const [onUpdated] = stub.tabs.onUpdated.addListener.mock.calls.at(-1) ?? [];
    const fire = onUpdated as (id: number, change: {status?: string}) => void;

    await act(async () => {
      fire(1, {status: 'loading'});
    });
    expect(stub.tabs.query).toHaveBeenCalledTimes(1);

    await act(async () => {
      fire(1, {status: 'complete'});
    });
    expect(stub.tabs.query).toHaveBeenCalledTimes(2);
  });
});
