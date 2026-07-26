import {beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {HeaderTable} from '@/components/HeaderTable';
import {ResponsePanel} from '@/Popup/panels/ResponsePanel';
import {RequestPanel} from '@/Popup/panels/RequestPanel';
import {presets} from '@/lib/presets';
import type {CapturedRequest, Skin} from '@/types';

const SKINS: Skin[] = ['modern', 'classic'];

/** Mirrors what useAppearance stamps on the document, so skin variants apply. */
function renderWithSkin(ui: React.ReactElement, skin: Skin): void {
  document.documentElement.dataset.skin = skin;
  document.documentElement.dataset.theme = 'light';
  render(ui);
}

const request: CapturedRequest = {
  id: '1',
  tabId: 1,
  url: 'https://example.com/products/42',
  host: 'example.com',
  method: 'GET',
  type: 'main_frame',
  timeStamp: 0,
  requestHeaders: [
    {name: 'pragma', value: 'akamai-x-cache-on', injected: true},
    {name: 'accept', value: 'text/html'},
  ],
  responseHeaders: [
    {name: 'Status', value: 'HTTP/2 200'},
    {name: 'x-cache', value: 'TCP_MEM_HIT from edge'},
    {name: 'content-type', value: 'text/html'},
  ],
  statusCode: 200,
  completed: true,
};

beforeEach(() => {
  document.documentElement.removeAttribute('data-skin');
});

describe.each(SKINS)('under the %s skin', (skin) => {
  it('renders every header row', () => {
    renderWithSkin(
      <HeaderTable
        headers={request.requestHeaders}
        preset={presets.akamai}
        sort={{key: 'name', dir: 'asc'}}
        onSort={() => undefined}
      />,
      skin
    );

    expect(screen.getByText('pragma')).toBeInTheDocument();
    expect(screen.getByText('accept')).toBeInTheDocument();
  });

  it('marks injected headers and leaves the rest unmarked', () => {
    renderWithSkin(
      <HeaderTable
        headers={request.requestHeaders}
        preset={presets.akamai}
        sort={{key: 'name', dir: 'asc'}}
        onSort={() => undefined}
      />,
      skin
    );

    const injectedRow = screen.getByText('pragma').closest('tr');
    const plainRow = screen.getByText('accept').closest('tr');

    expect(within(injectedRow as HTMLElement).getByText('injected')).toBeInTheDocument();
    expect(within(plainRow as HTMLElement).queryByText('injected')).toBeNull();
  });

  it('groups CDN response headers ahead of the rest', () => {
    renderWithSkin(
      <ResponsePanel
        request={request}
        preset={presets.akamai}
        skin={skin}
        onExport={() => undefined}
      />,
      skin
    );

    expect(screen.getByText('Akamai Response Headers')).toBeInTheDocument();
    expect(screen.getByText('Default Response Headers')).toBeInTheDocument();
    expect(screen.getByText('TCP_MEM_HIT from edge')).toBeInTheDocument();
  });

  it('switches sort direction when a column heading is activated', async () => {
    const onSort = vi.fn();

    renderWithSkin(
      <HeaderTable
        headers={request.requestHeaders}
        preset={presets.akamai}
        sort={{key: 'name', dir: 'asc'}}
        onSort={onSort}
      />,
      skin
    );

    await userEvent.click(screen.getByRole('button', {name: /Name/}));

    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('reports an invalid custom header instead of silently dropping it', async () => {
    renderWithSkin(
      <RequestPanel
        request={request}
        preset={presets.akamai}
        host="example.com"
        customHeaders={[{name: 'Bad Header', value: '1', enabled: true}]}
        onCustomHeadersChange={() => undefined}
        onExport={() => undefined}
      />,
      skin
    );

    expect(screen.getByText(/may only contain/)).toBeInTheDocument();
  });
});

describe('structural skin differences', () => {
  it('shows the cache disclaimer only under the classic skin', () => {
    const {unmount} = render(
      <ResponsePanel
        request={request}
        preset={presets.akamai}
        skin="classic"
        onExport={() => undefined}
      />
    );

    expect(screen.getByText(/display purpose only/)).toBeInTheDocument();
    unmount();

    render(
      <ResponsePanel
        request={request}
        preset={presets.akamai}
        skin="modern"
        onExport={() => undefined}
      />
    );

    expect(screen.queryByText(/display purpose only/)).toBeNull();
  });
});

describe('CDN detection', () => {
  const cloudfront = {
    ...request,
    responseHeaders: [
      {name: 'Status', value: 'HTTP/2 200'},
      {name: 'x-cache', value: 'Hit from cloudfront'},
      {name: 'x-amz-cf-pop', value: 'LHR62-P4'},
      {name: 'content-type', value: 'text/html'},
    ],
  };

  it('groups by the CDN that answered, not the selected preset', () => {
    render(
      <ResponsePanel
        request={cloudfront}
        preset={presets.akamai}
        skin="modern"
        onExport={() => undefined}
      />
    );

    expect(screen.getByText('CloudFront Response Headers')).toBeInTheDocument();
    expect(screen.getByText(/Served by/)).toHaveTextContent('CloudFront');
    expect(screen.getByText(/preset is set to Akamai/)).toBeInTheDocument();
  });

  it('offers to adopt the detected preset', async () => {
    const onUsePreset = vi.fn();

    render(
      <ResponsePanel
        request={cloudfront}
        preset={presets.akamai}
        skin="modern"
        onExport={() => undefined}
        onUsePreset={onUsePreset}
      />
    );

    await userEvent.click(screen.getByRole('button', {name: 'Use CloudFront'}));

    expect(onUsePreset).toHaveBeenCalledWith('cloudfront');
  });

  it('does not nag when the preset already agrees', () => {
    render(
      <ResponsePanel
        request={cloudfront}
        preset={presets.cloudfront}
        skin="modern"
        onExport={() => undefined}
        onUsePreset={() => undefined}
      />
    );

    expect(screen.queryByText(/preset is set to/)).toBeNull();
    expect(screen.queryByRole('button', {name: /^Use /})).toBeNull();
  });

  it('falls back to the selected preset when no CDN is identifiable', () => {
    render(
      <ResponsePanel
        request={{
          ...request,
          responseHeaders: [{name: 'content-type', value: 'text/html'}],
        }}
        preset={presets.fastly}
        skin="modern"
        onExport={() => undefined}
      />
    );

    expect(screen.getByText('Fastly Response Headers')).toBeInTheDocument();
    expect(screen.queryByText(/Served by/)).toBeNull();
  });
});

describe('header ordering', () => {
  const scrambled = {
    ...request,
    requestHeaders: [
      {name: 'zeta', value: '1'},
      {name: 'alpha', value: '2'},
      {name: 'mid', value: '3'},
    ],
  };

  const names = (): string[] =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td')?.textContent ?? '');

  it('keeps the order headers were sent in until a column is chosen', () => {
    render(
      <RequestPanel
        request={scrambled}
        preset={presets.akamai}
        host="example.com"
        customHeaders={[]}
        onCustomHeadersChange={() => undefined}
        onExport={() => undefined}
      />
    );

    expect(names()).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('cycles ascending, descending, then back to the original order', async () => {
    render(
      <RequestPanel
        request={scrambled}
        preset={presets.akamai}
        host="example.com"
        customHeaders={[]}
        onCustomHeadersChange={() => undefined}
        onExport={() => undefined}
      />
    );

    const heading = screen.getByRole('button', {name: /Name/});

    await userEvent.click(heading);
    expect(names()).toEqual(['alpha', 'mid', 'zeta']);

    await userEvent.click(heading);
    expect(names()).toEqual(['zeta', 'mid', 'alpha']);

    await userEvent.click(heading);
    expect(names()).toEqual(['zeta', 'alpha', 'mid']);
  });
});

describe('custom header editing', () => {
  it('appends a blank row when a header is added', async () => {
    const onChange = vi.fn();

    render(
      <RequestPanel
        request={request}
        preset={presets.akamai}
        host="example.com"
        customHeaders={[]}
        onCustomHeadersChange={onChange}
        onExport={() => undefined}
      />
    );

    await userEvent.click(screen.getByRole('button', {name: 'Add header'}));

    expect(onChange).toHaveBeenCalledWith([{name: '', value: '', enabled: true}]);
  });

  it('removes the row that was deleted', async () => {
    const onChange = vi.fn();

    render(
      <RequestPanel
        request={request}
        preset={presets.akamai}
        host="example.com"
        customHeaders={[
          {name: 'X-A', value: '1', enabled: true},
          {name: 'X-B', value: '2', enabled: true},
        ]}
        onCustomHeadersChange={onChange}
        onExport={() => undefined}
      />
    );

    const [firstDelete] = screen.getAllByTitle('Delete header');
    await userEvent.click(firstDelete as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([{name: 'X-B', value: '2', enabled: true}]);
  });

  it('filters the header table', async () => {
    render(
      <RequestPanel
        request={request}
        preset={presets.akamai}
        host="example.com"
        customHeaders={[]}
        onCustomHeadersChange={() => undefined}
        onExport={() => undefined}
      />
    );

    await userEvent.type(screen.getByLabelText('Filter request headers'), 'pragma');

    expect(screen.getByText('pragma')).toBeInTheDocument();
    expect(screen.queryByText('accept')).toBeNull();
  });
});
