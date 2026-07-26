import {Button} from '@/components/Button';
import {Select, TextInput} from '@/components/Field';
import {useAppearance} from '@/hooks/useAppearance';
import {useSettings} from '@/hooks/useSettings';
import {validateHeader} from '@/Background/rules';
import {presetList} from '@/lib/presets';
import type {
  CdnPresetId,
  CustomHeader,
  Settings,
  Skin,
  ThemePreference,
} from '@/types';

const CAPTURE_LIMITS = [50, 200, 500, 1000];

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 border-b border-line pb-1.5 text-[11px] font-semibold tracking-widest text-ink-dim uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[190px_1fr] items-start gap-3.5 max-sm:grid-cols-1 max-sm:gap-1">
      <label htmlFor={htmlFor} className="pt-1 text-ink-dim">
        {label}
      </label>
      <div>
        {children}
        {help ? <p className="mt-1 mb-0 text-xs text-ink-dim">{help}</p> : null}
      </div>
    </div>
  );
}

function GlobalHeaders({
  headers,
  onChange,
}: {
  headers: CustomHeader[];
  onChange: (next: CustomHeader[]) => void;
}): React.JSX.Element {
  const replaceAt = (index: number, next: CustomHeader): void => {
    onChange(headers.map((h, i) => (i === index ? next : h)));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {headers.map((header, index) => {
        const error = validateHeader(header);

        return (
          // Rows are positional; a name-based key would remount mid-edit.
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={header.enabled}
                onChange={(e) => replaceAt(index, {...header, enabled: e.target.checked})}
                aria-label={`Enable ${header.name || 'header'}`}
                className="accent-[var(--accent)]"
              />
              <TextInput
                value={header.name}
                onChange={(e) => replaceAt(index, {...header, name: e.target.value})}
                aria-label="Header name"
                placeholder="Name"
                className="skin-mono flex-1"
              />
              <TextInput
                value={header.value}
                onChange={(e) => replaceAt(index, {...header, value: e.target.value})}
                aria-label="Header value"
                placeholder="Value"
                className="skin-mono flex-2"
              />
              <Button
                variant="icon"
                title="Delete header"
                onClick={() => onChange(headers.filter((_, i) => i !== index))}
              >
                ✕
              </Button>
            </div>
            {error ? <p className="m-0 text-xs text-crit">{error}</p> : null}
          </div>
        );
      })}

      <div>
        <Button
          onClick={() => onChange([...headers, {name: '', value: '', enabled: true}])}
        >
          Add header
        </Button>
      </div>
    </div>
  );
}

export function Options(): React.JSX.Element {
  const {settings, loaded, update} = useSettings();
  useAppearance(settings);

  const set = (patch: Partial<Settings>): void => {
    void update(patch);
  };

  if (!loaded) {
    return <main className="p-7 text-ink-dim">Loading settings…</main>;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 bg-surface p-7 text-[13.5px] text-ink">
      <h1 className="m-0 text-lg font-semibold">CDN Headers &amp; Cookies settings</h1>

      <Group title="Header injection">
        <Row
          label="CDN preset"
          htmlFor="preset"
          help="Decides which debug headers are injected and which response headers are grouped as CDN headers."
        >
          <Select
            id="preset"
            value={settings.preset}
            onChange={(e) => set({preset: e.target.value as CdnPresetId})}
          >
            {presetList.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </Select>
        </Row>

        <Row
          label="Global custom headers"
          help="Applied to every host, on top of any per-host headers set from the popup."
        >
          <GlobalHeaders
            headers={settings.globalHeaders}
            onChange={(globalHeaders) => set({globalHeaders})}
          />
        </Row>
      </Group>

      <Group title="Capture">
        <Row
          label="Requests kept per tab"
          htmlFor="limit"
          help="Oldest requests are dropped first once the limit is reached."
        >
          <Select
            id="limit"
            value={settings.captureLimit}
            onChange={(e) => set({captureLimit: Number(e.target.value)})}
          >
            {CAPTURE_LIMITS.map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </Select>
        </Row>
      </Group>

      <Group title="Appearance">
        <Row
          label="Skin"
          htmlFor="skin"
          help="Classic recreates the 2.0.6 interface. It is light-only."
        >
          <Select
            id="skin"
            value={settings.skin}
            onChange={(e) => set({skin: e.target.value as Skin})}
          >
            <option value="modern">Modern</option>
            <option value="classic">Classic 2.0.6</option>
          </Select>
        </Row>

        {settings.skin === 'classic' ? null : (
          <Row label="Theme" htmlFor="theme">
            <Select
              id="theme"
              value={settings.theme}
              onChange={(e) => set({theme: e.target.value as ThemePreference})}
            >
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Row>
        )}
      </Group>

      <Group title="Data">
        <Row
          label="Stored settings"
          help="Removes custom headers, per-host toggles and captured requests."
        >
          <Button
            variant="danger"
            onClick={() => {
              void update({
                hostToggles: {},
                hostHeaders: {},
                globalHeaders: [],
              });
            }}
          >
            Clear all data
          </Button>
        </Row>
      </Group>
    </main>
  );
}
