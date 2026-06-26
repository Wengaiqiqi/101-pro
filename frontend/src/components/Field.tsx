import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, hint, id, className = '', ...props }, ref) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <input ref={ref} id={inputId} className={`field__control ${className}`.trim()} {...props} />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
});

Field.displayName = 'Field';
