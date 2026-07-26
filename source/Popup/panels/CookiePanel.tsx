import {useMemo, useState} from 'react';

import {Button} from '@/components/Button';
import {Checkbox, Select, TextInput} from '@/components/Field';
import {Chip} from '@/components/Chip';
import {describeFlags} from '@/lib/cookies';
import type {CookieRecord} from '@/types';

const SAME_SITE: CookieRecord['sameSite'][] = ['no_restriction', 'lax', 'strict'];

function CookieEditor({
  cookie,
  onSave,
  onCancel,
}: {
  cookie: CookieRecord;
  onSave: (next: CookieRecord) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(cookie);

  return (
    <tr className="bg-surface-2">
      <td colSpan={4} className="skin-cell border-b border-line">
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            <TextInput
              value={draft.name}
              onChange={(e) => setDraft({...draft, name: e.target.value})}
              aria-label="Cookie name"
              placeholder="Name"
              className="skin-mono flex-1"
            />
            <TextInput
              value={draft.value}
              onChange={(e) => setDraft({...draft, value: e.target.value})}
              aria-label="Cookie value"
              placeholder="Value"
              className="skin-mono flex-2"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <TextInput
              value={draft.path}
              onChange={(e) => setDraft({...draft, path: e.target.value})}
              aria-label="Cookie path"
              className="skin-mono w-24"
            />
            <Checkbox
              label="Secure"
              checked={draft.secure}
              onChange={(secure) => setDraft({...draft, secure})}
            />
            <Checkbox
              label="HttpOnly"
              checked={draft.httpOnly}
              onChange={(httpOnly) => setDraft({...draft, httpOnly})}
            />
            <Select
              value={draft.sameSite}
              onChange={(e) =>
                setDraft({...draft, sameSite: e.target.value as CookieRecord['sameSite']})
              }
              aria-label="SameSite"
            >
              {SAME_SITE.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-1.5">
            <Button variant="primary" onClick={() => onSave(draft)}>
              Save
            </Button>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function CookiePanel({
  cookies,
  domain,
  onSave,
  onDelete,
  onExport,
}: {
  cookies: CookieRecord[];
  domain: string;
  onSave: (cookie: CookieRecord) => void;
  onDelete: (cookie: CookieRecord) => void;
  onExport: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cookies;

    return cookies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
    );
  }, [cookies, query]);

  const blank: CookieRecord = {
    name: '',
    value: '',
    domain,
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'lax',
    session: true,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-2 flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter cookies"
          aria-label="Filter cookies"
          className="flex-1"
        />
        <Button onClick={() => setEditing('new')}>Add cookie</Button>
        <Button onClick={onExport}>Export</Button>
      </div>

      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {['Name', 'Value', 'Flags', ''].map((label, i) => (
              <th
                key={label || 'actions'}
                scope="col"
                style={{width: [ '20%', 'auto', '20%', '56px' ][i]}}
                className="skin-cell skin-sm skin-cell-rule sticky top-0 z-1 border-b border-line bg-surface-2 text-left font-semibold tracking-wider text-ink uppercase classic:tracking-normal classic:normal-case"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {editing === 'new' ? (
            <CookieEditor
              cookie={blank}
              onSave={(next) => {
                onSave(next);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}

          {rows.length === 0 && editing !== 'new' ? (
            <tr>
              <td colSpan={4} className="skin-cell text-ink-dim">
                {query.trim()
                  ? 'No cookies match that filter.'
                  : `No cookies set for ${domain}.`}
              </td>
            </tr>
          ) : (
            rows.map((cookie, index) =>
              editing === index ? (
                <CookieEditor
                  key={`${cookie.name}-edit`}
                  cookie={cookie}
                  onSave={(next) => {
                    onSave(next);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <tr key={`${cookie.domain}${cookie.path}${cookie.name}`} className="classic:odd:bg-surface-2">
                  <td className="skin-cell skin-mono skin-cell-rule border-b border-line bg-surface-2 align-top break-words">
                    {cookie.name}
                  </td>
                  <td className="skin-cell skin-mono skin-cell-rule border-b border-line align-top break-words">
                    {cookie.value}
                  </td>
                  <td className="skin-cell skin-cell-rule border-b border-line align-top">
                    <span className="flex flex-wrap gap-1">
                      {describeFlags(cookie).map((flag) => (
                        <Chip key={flag}>{flag}</Chip>
                      ))}
                    </span>
                  </td>
                  <td className="skin-cell skin-cell-rule border-b border-line align-top">
                    <span className="flex gap-0.5">
                      <Button
                        variant="icon"
                        className="size-6"
                        title={`Edit ${cookie.name}`}
                        onClick={() => setEditing(index)}
                      >
                        ✎
                      </Button>
                      <Button
                        variant="icon"
                        className="size-6"
                        title={`Delete ${cookie.name}`}
                        onClick={() => onDelete(cookie)}
                      >
                        ✕
                      </Button>
                    </span>
                  </td>
                </tr>
              )
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
