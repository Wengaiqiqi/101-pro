import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, id, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="grid gap-1.5">
        <label className="text-[13px] font-bold text-slate-700" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`w-full min-h-[38px] px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 ${className}`.trim()}
          {...props}
        />
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>
    );
  },
);

Field.displayName = 'Field';
