import {Select} from '@/components/Field';
import {Switch} from '@/components/Switch';
import {presetList, presets} from '@/lib/presets';
import type {CdnPresetId, Settings, Skin} from '@/types';

const VERSION = __APP_VERSION__;

function SkinField({
  skin,
  onChange,
  id,
}: {
  skin: Skin;
  onChange: (skin: Skin) => void;
  id: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label htmlFor={id} className="min-w-33 font-semibold">
        Appearance
      </label>
      <Select id={id} value={skin} onChange={(e) => onChange(e.target.value as Skin)}>
        <option value="modern">Modern</option>
        <option value="classic">Classic 2.0.6</option>
      </Select>
    </div>
  );
}

/**
 * The classic skin keeps the 2.0.6 settings row verbatim, including the note
 * paragraphs that explain what enabling the toggle actually does. This is one
 * of the few places where the two skins differ structurally rather than only
 * in tokens.
 */
export function SettingsPanel({
  settings,
  host,
  injectEnabled,
  onToggleInject,
  onChange,
}: {
  settings: Settings;
  host: string;
  injectEnabled: boolean;
  onToggleInject: (enabled: boolean) => void;
  onChange: (patch: Partial<Settings>) => void;
}): React.JSX.Element {
  const classic = settings.skin === 'classic';
  const preset = presets[settings.preset];

  if (classic) {
    return (
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-surface-2 p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="inject-classic" className="skin-display min-w-33 text-[12px] font-semibold">
            Load {preset.label} Headers
          </label>
          <Switch id="inject-classic" checked={injectEnabled} onChange={onToggleInject} />
        </div>

        <p className="skin-sm m-0 text-ink-dim">
          Note: Enabling the above checkbox means, the following {preset.label} header
          names will be appended to the Pragma header value and it will be appended to the
          next request.
        </p>
        <p className="skin-sm m-0 break-words text-ink-dim">
          {preset.inject.map((h) => h.value).join(' ')}
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="subres-classic" className="skin-display min-w-33 text-[12px] font-semibold">
            Watch Subresources
          </label>
          <Switch
            id="subres-classic"
            checked={settings.captureSubresources}
            onChange={(captureSubresources) => onChange({captureSubresources})}
          />
        </div>

        <SkinField
          id="skin-classic"
          skin={settings.skin}
          onChange={(skin) => onChange({skin})}
        />

        <p className="skin-sm m-0 text-right text-[11px] text-ink-dim italic">version : {VERSION}</p>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="preset" className="min-w-33 font-semibold">
          CDN preset
        </label>
        <Select
          id="preset"
          value={settings.preset}
          onChange={(e) => onChange({preset: e.target.value as CdnPresetId})}
        >
          {presetList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>

        <Switch
          label={`Inject on ${host}`}
          checked={injectEnabled}
          onChange={onToggleInject}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <span className="min-w-33 font-semibold">Capture</span>
        <Switch
          label="Watch subresources"
          checked={settings.captureSubresources}
          onChange={(captureSubresources) => onChange({captureSubresources})}
        />
      </div>

      <SkinField
        id="skin-modern"
        skin={settings.skin}
        onChange={(skin) => onChange({skin})}
      />

      <p className="skin-sm m-0 text-ink-dim">
        Injected request headers are added by this extension and marked in the request
        headers table.
      </p>
      <p className="skin-sm m-0 text-ink-dim">Version {VERSION}</p>
    </div>
  );
}
