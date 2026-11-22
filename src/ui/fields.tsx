import { useEffect, useRef, useState } from 'react';
import { beginTransaction, endTransaction } from '../store/store';

interface TextProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  testId?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** Текстове поле: усе редагування від фокусу до втрати фокусу — один крок в історії. */
/** Якщо поле зникає (змінився вибір), поки має фокус — закриваємо крок історії. */
function useCloseOnUnmount() {
  const focused = useRef(false);
  useEffect(
    () => () => {
      if (focused.current) endTransaction();
    },
    [],
  );
  return focused;
}

export function TextField({ label, value, onChange, multiline, rows = 3, testId, placeholder, disabled }: TextProps) {
  const focused = useCloseOnUnmount();
  const common = {
    value,
    placeholder,
    disabled,
    'data-testid': testId,
    onFocus: () => {
      focused.current = true;
      beginTransaction();
    },
    onBlur: () => {
      focused.current = false;
      endTransaction();
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
    </label>
  );
}

export function parseNum(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface NumProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testId?: string;
  suffix?: string;
  min?: number;
}

export function NumberField({ label, value, onChange, testId, suffix, min }: NumProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const focusedRef = useCloseOnUnmount();
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  return (
    <label className="field field-num">
      <span className="field-label">{label}</span>
      <span className="num-wrap">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          data-testid={testId}
          onFocus={() => {
            focusedRef.current = true;
            setFocused(true);
            beginTransaction();
          }}
          onBlur={() => {
            focusedRef.current = false;
            setFocused(false);
            endTransaction();
            setText(String(value));
          }}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNum(e.target.value);
            if (n !== null && (min === undefined || n >= min)) onChange(n);
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
    </label>
  );
}
